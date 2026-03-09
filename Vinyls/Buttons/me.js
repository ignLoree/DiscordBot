const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { getUserOverviewStats } = require("../Services/Community/activityService");
const { renderUserActivityCanvas } = require("../Utils/Render/activityCanvas");

const ME_REFRESH_CUSTOM_ID_PREFIX = "me_refresh";
const ME_PERIOD_OPEN_CUSTOM_ID_PREFIX = "me_period_open";
const ME_PERIOD_SET_CUSTOM_ID_PREFIX = "me_period_set";
const ME_PERIOD_BACK_CUSTOM_ID_PREFIX = "me_period_back";

const ALLOWED_LOOKBACK = [1, 7, 14, 21, 30];
function normalizeLookbackDays(x) {
  if (x == null || x === "") return 14;
  const s = String(x).replace(/d$/i, "").trim();
  const n = Number.parseInt(s, 10);
  return ALLOWED_LOOKBACK.includes(n) ? n : 14;
}

function match(interaction) {
  const id = interaction?.customId || "";
  const prefixes = [ME_REFRESH_CUSTOM_ID_PREFIX, ME_PERIOD_OPEN_CUSTOM_ID_PREFIX, ME_PERIOD_SET_CUSTOM_ID_PREFIX, ME_PERIOD_BACK_CUSTOM_ID_PREFIX];
  return interaction.isButton() && prefixes.some((p) => id === p || id.startsWith(`${p}:`));
}

async function execute(interaction, client) {
  const { parseMeCustomId, denyIfNotOwner, sendControlErrorFallback } = require("../Utils/Interaction/buttonParsers");
  const parsed = parseMeCustomId(interaction.customId);
  if (!parsed) return false;
  const denied = await denyIfNotOwner(interaction, parsed.ownerId);
  if (denied) return true;

  const guild = interaction.guild;
  const userId = parsed.ownerId || interaction.user?.id;
  if (!guild || !userId) {
    await sendControlErrorFallback(interaction);
    return true;
  }

  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    const user = member?.user ?? interaction.user;
    const payload = await buildMeOverviewPayload(guild, user, member, parsed.lookbackDays, "main");
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => interaction.followUp(payload).catch(() => {}));
    } else {
      await interaction.update(payload).catch(async () => {
        await interaction.reply({ ...payload, ephemeral: true }).catch(() => {});
      });
    }
    return true;
  } catch (err) {
    global.logger?.error?.("[Buttons/me] execute", err);
    await sendControlErrorFallback(interaction);
    return true;
  }
}

async function buildMeOverviewPayload(guild, author, member, lookbackDays, view) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const userId = author?.id;
  if (!guild?.id || !userId) return { embeds: [], components: [], files: [] };

  const stats = await getUserOverviewStats(guild.id, userId, safeLookback);

  const guildName = guild.name || "Server";
  const userTag = author?.tag || author?.username || "User";
  const displayName = member?.displayName ?? author?.username ?? "User";
  const avatarUrl = author?.displayAvatarURL?.({ size: 256, extension: "png" }) || null;
  const createdOn = author?.createdAt ?? new Date(0);
  const joinedOn = (member?.joinedAt && member.joinedAt instanceof Date) ? member.joinedAt : (member?.joinedTimestamp ? new Date(member.joinedTimestamp) : createdOn);

  const buffer = await renderUserActivityCanvas({
    guildName,
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

  const components = buildMeComponents(userId, safeLookback, view);
  const file = new AttachmentBuilder(buffer, { name: "me-activity.png" });
  return { files: [file], components };
}

function buildMeComponents(ownerId, lookbackDays, view) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const base = ownerId ? `${ME_REFRESH_CUSTOM_ID_PREFIX}:${ownerId}:${safeLookback}:embed` : `${ME_REFRESH_CUSTOM_ID_PREFIX}:${safeLookback}:embed`;
  const periodOpen = ownerId ? `${ME_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${ownerId}:${safeLookback}:embed` : `${ME_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${safeLookback}:embed`;
  const periodBack = ownerId ? `${ME_PERIOD_BACK_CUSTOM_ID_PREFIX}:${ownerId}:${safeLookback}:embed` : `${ME_PERIOD_BACK_CUSTOM_ID_PREFIX}:${safeLookback}:embed`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(base).setLabel("Aggiorna").setStyle(ButtonStyle.Secondary).setEmoji("🔄"),
    new ButtonBuilder().setCustomId(periodOpen).setLabel("Periodo").setStyle(ButtonStyle.Secondary).setEmoji("📅"),
    new ButtonBuilder().setCustomId(periodBack).setLabel("Indietro").setStyle(ButtonStyle.Secondary).setEmoji("◀️")
  );
  return [row];
}

function parseMyActivityArgs(args) {
  const raw = args && args[0] != null ? String(args[0]).trim().replace(/d$/i, "") : "";
  const lookback = raw ? Number.parseInt(raw, 10) : 14;
  return { lookbackDays: normalizeLookbackDays(lookback) };
}

module.exports = {
  name: "me",
  order: 6,
  match,
  execute,
  ME_REFRESH_CUSTOM_ID_PREFIX,
  ME_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  ME_PERIOD_SET_CUSTOM_ID_PREFIX,
  ME_PERIOD_BACK_CUSTOM_ID_PREFIX,
  normalizeLookbackDays,
  buildMeOverviewPayload,
  buildMeComponents,
  parseMyActivityArgs,
};
