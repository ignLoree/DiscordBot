const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { getUserOverviewStats } = require("../Services/Community/activityService");
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

  try {
    const payload = await buildUserOverviewPayload(guild, targetUserId, parsed.lookbackDays, "main", client);
    const payloadWithComponents = {
      ...payload,
      components: buildUserComponents(parsed.ownerId || interaction.user?.id, targetUserId, parsed.lookbackDays, "main"),
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payloadWithComponents).catch(() => interaction.followUp(payloadWithComponents).catch(() => {}));
    } else {
      await interaction.update(payloadWithComponents).catch(async () => {
        await interaction.reply({ ...payloadWithComponents, ephemeral: true }).catch(() => {});
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
  try {
    member = await guild.members.fetch(targetId).catch(() => null);
    user = member?.user ?? null;
  } catch (_) {}
  if (!user && (client?.users?.fetch || guild.client?.users?.fetch)) {
    const c = client || guild.client;
    user = await c.users.fetch(targetId).catch(() => null);
  }
  const displayName = member?.displayName ?? user?.username ?? "User";
  const userTag = user?.tag ?? user?.username ?? "User";
  const avatarUrl = user?.displayAvatarURL?.({ size: 256, extension: "png" }) || null;
  const createdOn = user?.createdAt ?? new Date(0);
  const joinedOn = (member?.joinedAt && member.joinedAt instanceof Date) ? member.joinedAt : (member?.joinedTimestamp ? new Date(member.joinedTimestamp) : createdOn);

  const buffer = await renderUserActivityCanvas({
    guildName: guild.name || "Server",
    userTag,
    displayName,
    avatarUrl,
    createdOn,
    joinedOn,
    lookbackDays: safeLookback,
    windows: stats.windows,
    ranks: stats.ranks,
    topChannelsText: stats.topChannelsText,
    topChannelsVoice: stats.topChannelsVoice,
    chart: stats.chart,
  });

  const file = new AttachmentBuilder(buffer, { name: "user-activity.png" });
  return { files: [file], components: buildUserComponents(null, targetId, safeLookback, view) };
}

function buildUserComponents(ownerId, targetUserId, lookbackDays, view) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const o = ownerId || "";
  const base = `${USER_REFRESH_CUSTOM_ID_PREFIX}:${o}:${targetUserId}:${safeLookback}:embed`;
  const periodOpen = `${USER_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${o}:${targetUserId}:${safeLookback}:embed`;
  const periodBack = `${USER_PERIOD_BACK_CUSTOM_ID_PREFIX}:${o}:${targetUserId}:${safeLookback}:embed`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(base).setLabel("Aggiorna").setStyle(ButtonStyle.Secondary).setEmoji("🔄"),
    new ButtonBuilder().setCustomId(periodOpen).setLabel("Periodo").setStyle(ButtonStyle.Secondary).setEmoji("📅"),
    new ButtonBuilder().setCustomId(periodBack).setLabel("Indietro").setStyle(ButtonStyle.Secondary).setEmoji("◀️")
  );
  return [row];
}

function parseUserActivityArgs(args) {
  const targetId = args && args[0] != null ? String(args[0]).trim() : null;
  const raw = args && args[1] != null ? String(args[1]).trim().replace(/d$/i, "") : "";
  const lookback = raw ? Number.parseInt(raw, 10) : 14;
  return { targetId, lookbackDays: normalizeLookbackDays(lookback) };
}

module.exports = {
  name: "user",
  order: 7,
  match,
  execute,
  USER_REFRESH_CUSTOM_ID_PREFIX,
  USER_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  USER_PERIOD_SET_CUSTOM_ID_PREFIX,
  USER_PERIOD_BACK_CUSTOM_ID_PREFIX,
  buildUserOverviewPayload,
  buildUserComponents,
  parseUserActivityArgs,
};
