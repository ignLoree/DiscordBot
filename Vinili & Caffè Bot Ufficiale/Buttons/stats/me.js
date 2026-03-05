const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getUserOverviewStats } = require("../../Services/Community/activityService");
const { renderUserActivityCanvas } = require("../../Utils/Render/activityCanvas");

const name = "me";
const label = "Statistiche Me";
const description = "Controlli periodo e vista delle proprie statistiche (+me).";
const order = 5;

const ME_REFRESH_CUSTOM_ID_PREFIX = "stats_me_refresh";
const ME_PERIOD_OPEN_CUSTOM_ID_PREFIX = "stats_me_period_open";
const ME_PERIOD_SET_CUSTOM_ID_PREFIX = "stats_me_period_set";
const ME_PERIOD_BACK_CUSTOM_ID_PREFIX = "stats_me_period_back";
const VALID_LOOKBACKS = [1, 7, 14, 21, 30];

function parseWindowDays(rawValue) {
  const parsed = Number(String(rawValue || "14").toLowerCase().replace(/d$/i, ""));
  if ([1, 7, 14, 21, 30].includes(parsed)) return parsed;
  return 14;
}

function parseMyActivityArgs(args = []) {
  const tokens = Array.isArray(args) ? args.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const dayToken = tokens.find((t) => /^\d+d?$/i.test(t));
  return { lookbackDays: parseWindowDays(dayToken || "14") };
}

function normalizeLookbackDays(value) {
  const n = Number.parseInt(String(value || "14"), 10);
  return VALID_LOOKBACKS.includes(n) ? n : 14;
}

const IMAGE_MODE = "image";

function buildMainControlsRow(ownerId, lookbackDays) {
  const safeOwner = String(ownerId || "0");
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ME_REFRESH_CUSTOM_ID_PREFIX}:${safeOwner}:${normalizeLookbackDays(lookbackDays)}:${IMAGE_MODE}`)
      .setEmoji({ id: "1473359252276904203", name: "VC_Refresh" })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${ME_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${safeOwner}:${normalizeLookbackDays(lookbackDays)}:${IMAGE_MODE}`)
      .setEmoji({ id: "1473359204189474886", name: "VC_Clock" })
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildPeriodControlsRows(ownerId, lookbackDays) {
  const current = normalizeLookbackDays(lookbackDays);
  const safeOwner = String(ownerId || "0");
  const topRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ME_PERIOD_BACK_CUSTOM_ID_PREFIX}:${safeOwner}:${normalizeLookbackDays(lookbackDays)}:${IMAGE_MODE}`)
      .setEmoji({ id: "1462914743416131816", name: "vegaleftarrow", animated: true })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${ME_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:1:${IMAGE_MODE}`)
      .setLabel("1d")
      .setStyle(current === 1 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${ME_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:7:${IMAGE_MODE}`)
      .setLabel("7d")
      .setStyle(current === 7 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${ME_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:14:${IMAGE_MODE}`)
      .setLabel("14d")
      .setStyle(current === 14 ? ButtonStyle.Success : ButtonStyle.Primary),
  );
  const bottomRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ME_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:21:${IMAGE_MODE}`)
      .setLabel("21d")
      .setStyle(current === 21 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${ME_PERIOD_SET_CUSTOM_ID_PREFIX}:${safeOwner}:30:${IMAGE_MODE}`)
      .setLabel("30d")
      .setStyle(current === 30 ? ButtonStyle.Success : ButtonStyle.Primary),
  );
  return [topRow, bottomRow];
}

function buildMeComponents(ownerId, lookbackDays, controlsView = "main") {
  if (controlsView === "period") return buildPeriodControlsRows(ownerId, lookbackDays);
  return [buildMainControlsRow(ownerId, lookbackDays)];
}

async function resolveChannelLabel(guild, channelId) {
  const id = String(channelId || "");
  if (!id) return `#${id}`;
  const channel = guild.channels?.cache?.get(id) || (await guild.channels?.fetch(id).catch(() => null));
  if (!channel) return `#${id}`;
  return `#${channel.name}`;
}

async function resolveMemberVisibilityRole(guild) {
  if (!guild) return null;
  const configuredId = String(IDs.roles?.Member || "").trim();
  if (configuredId) {
    const role = guild.roles?.cache?.get(configuredId) || (await guild.roles?.fetch(configuredId).catch(() => null));
    if (role) return role;
  }
  return guild.roles?.everyone || null;
}

async function isChannelVisibleToMemberRole(guild, channelId, memberRole) {
  const id = String(channelId || "");
  if (!id || !guild || !memberRole) return false;
  const channel = guild.channels?.cache?.get(id) || (await guild.channels?.fetch(id).catch(() => null));
  if (!channel) return false;
  const perms = channel.permissionsFor(memberRole);
  return Boolean(perms?.has("ViewChannel"));
}

function isTextChannelUnderVoiceCategory(guild, channel) {
  if (!guild || !channel) return false;
  const parentId = channel.parentId || channel.parent?.id;
  if (!parentId) return false;
  const siblings = guild.channels?.cache?.filter((ch) => ch.parentId === parentId);
  if (!siblings?.size) return false;
  let voiceCount = 0;
  let textCount = 0;
  for (const ch of siblings.values()) {
    if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) {
      voiceCount += 1;
      continue;
    }
    if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) textCount += 1;
  }
  return voiceCount >= 2 && textCount <= 2;
}

async function enrichChannels(guild, items = [], { excludeVoiceCategoryText = false } = {}) {
  const memberRole = await resolveMemberVisibilityRole(guild);
  const out = [];
  for (const item of items) {
    const channel = guild.channels?.cache?.get(String(item?.id || "")) || (await guild.channels?.fetch(String(item?.id || "")).catch(() => null));
    if (!channel) continue;
    if (excludeVoiceCategoryText && isTextChannelUnderVoiceCategory(guild, channel)) continue;
    const visible = await isChannelVisibleToMemberRole(guild, item?.id, memberRole);
    if (!visible) continue;
    out.push({ ...item, label: await resolveChannelLabel(guild, item?.id) });
  }
  return out;
}

async function buildMeOverviewPayload(guild, user, member, lookbackDays = 14, controlsView = "main") {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const stats = await getUserOverviewStats(guild.id, user.id, safeLookback);
  const lookbackKey = `d${safeLookback}`;
  const topChannelsText = await enrichChannels(guild, stats.topChannelsText, { excludeVoiceCategoryText: true });
  const topChannelsVoice = await enrichChannels(guild, stats.topChannelsVoice);

  const imageName = `me-overview-${user.id}-${safeLookback}d-${Date.now()}.png`;
  let file = null;
  try {
    const buffer = await renderUserActivityCanvas({
      guildName: guild?.name || "Server",
      userTag: user.tag,
      displayName: member?.displayName || user.username,
      avatarUrl: user.displayAvatarURL({ extension: "png", size: 256 }),
      createdOn: user.createdAt || null,
      joinedOn: member?.joinedAt || null,
      lookbackDays: safeLookback,
      windows: stats.windows,
      ranks: stats.ranks,
      topChannelsText,
      topChannelsVoice,
      chart: stats.chart,
    });
    file = new AttachmentBuilder(buffer, { name: imageName });
  } catch (error) {
    global.logger?.warn?.("[ME] Canvas render failed:", error?.message || error);
  }

  const components = buildMeComponents(user?.id, safeLookback, controlsView);
  return {
    files: file ? [file] : [],
    content: file ? null : "<:vegax:1443934876440068179> Non sono riuscito a generare il canvas.",
    components,
  };
}

function match(interaction) {
  const { parseMeCustomId } = require("../../Utils/Interaction/buttonParsers");
  return !!parseMeCustomId(interaction?.customId);
}

async function execute(interaction) {
  const { denyIfNotOwner, sendControlErrorFallback, parseMeCustomId, normalizeComponentsForDiscord } = require("../../Utils/Interaction/buttonParsers");
  const parsedMe = parseMeCustomId(interaction.customId);
  if (!parsedMe) return false;
  if (await denyIfNotOwner(interaction, parsedMe.ownerId)) return true;
  try {
    await interaction.deferUpdate();
    if (parsedMe.prefix === ME_PERIOD_OPEN_CUSTOM_ID_PREFIX) {
      await interaction.message.edit({
        components: normalizeComponentsForDiscord(buildMeComponents(parsedMe.ownerId || interaction.user?.id, parsedMe.lookbackDays, "period")),
      });
      return true;
    }
    if (parsedMe.prefix === ME_PERIOD_BACK_CUSTOM_ID_PREFIX) {
      await interaction.message.edit({
        components: normalizeComponentsForDiscord(buildMeComponents(parsedMe.ownerId || interaction.user?.id, parsedMe.lookbackDays, "main")),
      });
      return true;
    }
    const controlsView = parsedMe.prefix === ME_PERIOD_SET_CUSTOM_ID_PREFIX ? "period" : "main";
    const payload = await buildMeOverviewPayload(interaction.guild, interaction.user, interaction.member, parsedMe.lookbackDays, controlsView);
    payload.components = buildMeComponents(parsedMe.ownerId || interaction.user?.id, parsedMe.lookbackDays, controlsView);
    await interaction.message.edit({
      ...payload,
      components: normalizeComponentsForDiscord(payload?.components),
      content: payload.content || null,
    });
  } catch (error) {
    global.logger?.error?.("[ME BUTTON] Failed:", error);
    await sendControlErrorFallback(interaction);
  }
  return true;
}

module.exports = { name, label, description, order, match, execute, buildMeOverviewPayload, buildMeComponents, normalizeLookbackDays, ME_REFRESH_CUSTOM_ID_PREFIX, ME_PERIOD_OPEN_CUSTOM_ID_PREFIX, ME_PERIOD_SET_CUSTOM_ID_PREFIX, ME_PERIOD_BACK_CUSTOM_ID_PREFIX, parseMyActivityArgs };