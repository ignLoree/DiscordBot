const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { getUserOverviewStats } = require("../Services/Community/activityService");
const { resolveTopChannelEntries } = require("../Prefix/Stats/top");
const { renderUserActivityCanvas } = require("../Utils/Render/activityCanvas");
const USER_REFRESH_CUSTOM_ID_PREFIX = "user_refresh";
const USER_PERIOD_OPEN_CUSTOM_ID_PREFIX = "user_period_open";
const USER_PERIOD_SET_CUSTOM_ID_PREFIX = "user_period_set";
const USER_PERIOD_BACK_CUSTOM_ID_PREFIX = "user_period_back";
const ALLOWED_LOOKBACK = [1, 7, 14, 21, 30];

function normalizeLookbackDays(x) {
  if (x == null || x === "") return 14;
  const s = String(x).replace(/d$/i, "").trim();
  const n = Number.parseInt(s, 10);
  return ALLOWED_LOOKBACK.includes(n) ? n : 14;
}

function match(interaction) {
  const id = interaction?.customId || "";
  const prefixes = [USER_REFRESH_CUSTOM_ID_PREFIX, USER_PERIOD_OPEN_CUSTOM_ID_PREFIX, USER_PERIOD_SET_CUSTOM_ID_PREFIX, USER_PERIOD_BACK_CUSTOM_ID_PREFIX];
  return interaction.isButton() && prefixes.some((p) => id === p || id.startsWith(`${p}:`));
}

async function execute(interaction, client) {
  const { parseUserCustomId, denyIfNotOwner, sendControlErrorFallback } = require("../Utils/Interaction/buttonParsers");
  const parsed = parseUserCustomId(interaction.customId);
  if (!parsed) return false;
  const denied = await denyIfNotOwner(interaction, parsed.ownerId);
  if (denied) return true;

  const guild = interaction.guild;
  const targetUserId = parsed.targetUserId || parsed.ownerId;
  if (!guild || !targetUserId) {
    await sendControlErrorFallback(interaction);
    return true;
  }

  let view = "main";
  let lookbackDays = parsed.lookbackDays;
  if (parsed.prefix === USER_PERIOD_OPEN_CUSTOM_ID_PREFIX) view = "period";
  else if (parsed.prefix === USER_PERIOD_SET_CUSTOM_ID_PREFIX) lookbackDays = parsed.lookbackDays;
  else if (parsed.prefix === USER_PERIOD_BACK_CUSTOM_ID_PREFIX) view = "main";

  try {
    const payload = await buildUserOverviewPayload(guild, targetUserId, lookbackDays, view, client);
    const payloadWithComponents = {
      ...payload,
      components: buildUserComponents(parsed.ownerId || interaction.user?.id, targetUserId, lookbackDays, view),
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payloadWithComponents).catch(() => interaction.followUp(payloadWithComponents).catch(() => { }));
    } else {
      await interaction.update(payloadWithComponents).catch(async () => {
        await interaction.reply({ ...payloadWithComponents, ephemeral: true }).catch(() => { });
      });
    }
    return true;
  } catch (err) {
    global.logger?.error?.("[Buttons/user] execute", err);
    await sendControlErrorFallback(interaction);
    return true;
  }
}

async function buildUserOverviewPayload(guild, targetId, lookbackDays, view, client) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  if (!guild?.id || !targetId) return { embeds: [], components: [], files: [] };
  const stats = await getUserOverviewStats(guild.id, targetId, safeLookback);
  let user = null;
  let member = null;
  try { member = await guild.members.fetch(targetId).catch(() => null); user = member?.user ?? null; } catch (_) { }
  if (!user && (client?.users?.fetch || guild.client?.users?.fetch)) {
    const c = client || guild.client;
    user = await c.users.fetch(targetId).catch(() => null);
  }
  const displayName = member?.displayName ?? user?.username ?? "User";
  const userTag = user?.tag ?? user?.username ?? "User";
  const avatarUrl = user?.displayAvatarURL?.({ size: 256, extension: "png" }) || null;
  const createdOn = user?.createdAt ?? new Date(0);
  const joinedOn = (member?.joinedAt && member.joinedAt instanceof Date) ? member.joinedAt : (member?.joinedTimestamp ? new Date(member.joinedTimestamp) : createdOn);
  const emptySnapshot = new Map();
  const [topChannelsText, topChannelsVoice] = await Promise.all([
    resolveTopChannelEntries(guild, stats.topChannelsText || [], emptySnapshot),
    resolveTopChannelEntries(guild, stats.topChannelsVoice || [], emptySnapshot),
  ]);
  const buffer = await renderUserActivityCanvas({ guildName: guild.name || "Server", userTag, displayName, avatarUrl, createdOn, joinedOn, lookbackDays: safeLookback, windows: stats.windows, ranks: stats.ranks, topChannelsText, topChannelsVoice, chart: stats.chart });
  const file = new AttachmentBuilder(buffer, { name: "user-activity.png" });
  return { files: [file], components: [] };
}

function buildUserComponents(ownerId, targetUserId, lookbackDays, view) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const o = ownerId || "";
  const base = `${USER_REFRESH_CUSTOM_ID_PREFIX}:${o}:${targetUserId}:${safeLookback}:embed`;
  const periodOpen = `${USER_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${o}:${targetUserId}:${safeLookback}:embed`;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(base).setStyle(ButtonStyle.Secondary).setEmoji("<:VC_Refresh:1473359252276904203> "),
    new ButtonBuilder().setCustomId(periodOpen).setStyle(ButtonStyle.Secondary).setEmoji("<:VC_Clock:1473359204189474886>")
  );

  if (view === "period") {
    const periodBack = `${USER_PERIOD_BACK_CUSTOM_ID_PREFIX}:${o}:${targetUserId}:${safeLookback}:embed`;
    const rowPeriod1 = new ActionRowBuilder().addComponents(
      ...ALLOWED_LOOKBACK.map((d) =>
        new ButtonBuilder()
          .setCustomId(`${USER_PERIOD_SET_CUSTOM_ID_PREFIX}:${o}:${targetUserId}:${d}:embed`)
          .setStyle(safeLookback === d ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setLabel(`${d}d`)
      )
    );
    const rowPeriod2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(periodBack).setStyle(ButtonStyle.Secondary).setLabel("Indietro")
    );
    return [row1, rowPeriod1, rowPeriod2];
  }
  return [row1];
}

function parseUserActivityArgs(args) {
  const targetId = args && args[0] != null ? String(args[0]).trim() : null;
  const raw = args && args[1] != null ? String(args[1]).trim().replace(/d$/i, "") : "";
  const lookback = raw ? Number.parseInt(raw, 10) : 14;
  return { targetId, lookbackDays: normalizeLookbackDays(lookback) };
}

/**
 * Risolve l'utente da messaggio e args: mention, ID (raw o <@!id>), o username.
 * @param {import("discord.js").Message} message
 * @param {string[]} args
 * @returns {Promise<{ targetId: string | null, lookbackDays: number }>}
 */
async function resolveUserTargetAndLookback(message, args = []) {
  const tokens = Array.isArray(args) ? args.map((a) => String(a ?? "").trim()).filter(Boolean) : [];
  let lookbackDays = 14;
  const lookbackMatch = tokens.find((t) => /^\d+d?$/i.test(t));
  if (lookbackMatch) {
    lookbackDays = normalizeLookbackDays(lookbackMatch.replace(/d$/i, ""));
  }

  const mention = message?.mentions?.users?.first();
  if (mention) {
    return { targetId: mention.id, lookbackDays };
  }

  const first = tokens.find((t) => !/^\d+d?$/i.test(t));
  if (!first) return { targetId: null, lookbackDays };

  const mentionId = first.match(/^<@!?(\d+)>$/)?.[1];
  if (mentionId) return { targetId: mentionId, lookbackDays };

  const numericId = first.replace(/[<@!>]/g, "").trim();
  if (/^\d{17,20}$/.test(numericId)) {
    const user = await message.client?.users?.fetch(numericId).catch(() => null);
    if (user) return { targetId: user.id, lookbackDays };
  }

  const guild = message.guild;
  if (guild) {
    const byUsername = guild.members.cache.find(
      (m) =>
        (m.user?.username && String(m.user.username).toLowerCase() === first.toLowerCase()) ||
        (m.user?.tag && String(m.user.tag).toLowerCase() === first.toLowerCase()) ||
        (m.displayName && String(m.displayName).toLowerCase() === first.toLowerCase()),
    );
    if (byUsername) return { targetId: byUsername.id, lookbackDays };
    try {
      const members = await guild.members.fetch({ query: first, limit: 10 });
      const found = members.find(
        (m) =>
          (m.user?.username && String(m.user.username).toLowerCase() === first.toLowerCase()) ||
          (m.displayName && String(m.displayName).toLowerCase() === first.toLowerCase()),
      ) || members.first();
      if (found) return { targetId: found.id, lookbackDays };
    } catch (_) {}
  }

  return { targetId: null, lookbackDays };
}

module.exports = { name: "user", order: 7, match, execute, USER_REFRESH_CUSTOM_ID_PREFIX, USER_PERIOD_OPEN_CUSTOM_ID_PREFIX, USER_PERIOD_SET_CUSTOM_ID_PREFIX, USER_PERIOD_BACK_CUSTOM_ID_PREFIX, buildUserOverviewPayload, buildUserComponents, parseUserActivityArgs, resolveUserTargetAndLookback };