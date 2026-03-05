const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getServerOverviewStats } = require("../../Services/Community/activityService");
const { renderServerActivityCanvas } = require("../../Utils/Render/activityCanvas");

const name = "server";
const label = "Statistiche Server";
const description = "Refresh e vista panoramica statistiche server (+server).";
const order = 10;

const SERVER_REFRESH_CUSTOM_ID_PREFIX = "stats_server_refresh";

function parseWindowDays(rawValue) {
  const parsed = Number(String(rawValue || "14").toLowerCase().replace(/d$/i, ""));
  if ([7, 14, 21, 30].includes(parsed)) return parsed;
  return 14;
}

function parseServerActivityArgs(args = []) {
  const tokens = Array.isArray(args) ? args.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const dayToken = tokens.find((t) => /^\d+d?$/i.test(t));
  return { lookbackDays: parseWindowDays(dayToken || "14") };
}

function safeWindow(windows, key) {
  const row = windows?.[key] || {};
  return {
    text: Number(row.text || 0),
    voiceSeconds: Number(row.voiceSeconds || 0),
    contributors: Number(row.contributors || 0),
  };
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

async function resolveUserLabel(guild, userId) {
  const id = String(userId || "");
  if (!id) return id;
  const member = guild.members?.cache?.get(id) || (await guild.members?.fetch(id).catch(() => null));
  if (member?.user?.username) return member.user.username;
  if (member?.displayName) return member.displayName;
  const user = await guild.client?.users?.fetch(id).catch(() => null);
  if (user?.username) return user.username;
  return id;
}

async function enrichTops(guild, stats) {
  const memberRole = await resolveMemberVisibilityRole(guild);
  const topUsersText = [];
  for (const item of stats.topUsersText || [])
    topUsersText.push({ ...item, label: await resolveUserLabel(guild, item.id) });
  const topUsersVoice = [];
  for (const item of stats.topUsersVoice || [])
    topUsersVoice.push({ ...item, label: await resolveUserLabel(guild, item.id) });
  const topChannelsText = [];
  for (const item of stats.topChannelsText || []) {
    const channel = guild.channels?.cache?.get(String(item?.id || "")) || (await guild.channels?.fetch(String(item?.id || "")).catch(() => null));
    if (!channel) continue;
    if (isTextChannelUnderVoiceCategory(guild, channel)) continue;
    const visible = await isChannelVisibleToMemberRole(guild, item?.id, memberRole);
    if (!visible) continue;
    topChannelsText.push({ ...item, label: await resolveChannelLabel(guild, item.id) });
  }
  const topChannelsVoice = [];
  for (const item of stats.topChannelsVoice || []) {
    const visible = await isChannelVisibleToMemberRole(guild, item?.id, memberRole);
    if (!visible) continue;
    topChannelsVoice.push({ ...item, label: await resolveChannelLabel(guild, item.id) });
  }
  return { topUsersText, topUsersVoice, topChannelsText, topChannelsVoice };
}

const IMAGE_MODE = "image";

function buildRefreshRow(ownerId, lookbackDays) {
  const safeOwner = String(ownerId || "0");
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${SERVER_REFRESH_CUSTOM_ID_PREFIX}:${safeOwner}:${Number(lookbackDays || 14)}:${IMAGE_MODE}`)
      .setEmoji({ id: "1473359252276904203", name: "VC_Refresh" })
      .setStyle(ButtonStyle.Secondary),
  );
}

async function buildServerOverviewPayload(guild, lookbackDays = 14, ownerId = null) {
  const stats = await getServerOverviewStats(guild.id, lookbackDays);
  const lookbackKey = `d${lookbackDays}`;
  const d1 = safeWindow(stats?.windows, "d1");
  const d7 = safeWindow(stats?.windows, "d7");
  const dLookback = safeWindow(stats?.windows, lookbackKey);
  const enriched = await enrichTops(guild, stats);

  const imageName = `server-overview-${guild.id}-${lookbackDays}d-${Date.now()}.png`;
  let file = null;
  try {
    const buffer = await renderServerActivityCanvas({
      guildName: guild?.name || "Server",
      guildIconUrl: guild?.iconURL({ extension: "png", size: 256 }) || null,
      createdOn: guild?.createdAt || null,
      invitedBotOn: guild?.members?.me?.joinedAt || null,
      lookbackDays,
      windows: { d1, d7, d14: dLookback, [lookbackKey]: dLookback },
      topUsersText: enriched.topUsersText,
      topUsersVoice: enriched.topUsersVoice,
      topChannelsText: enriched.topChannelsText,
      topChannelsVoice: enriched.topChannelsVoice,
      chart: Array.isArray(stats?.chart) ? stats.chart : [],
      approximate: Boolean(stats?.approximate),
    });
    file = new AttachmentBuilder(buffer, { name: imageName });
  } catch (error) {
    global.logger?.warn?.("[SERVER] Canvas render failed:", error?.message || error);
  }

  return {
    files: file ? [file] : [],
    content: file ? null : "<:vegax:1443934876440068179> Non sono riuscito a generare il canvas.",
    components: [buildRefreshRow(ownerId, lookbackDays)],
  };
}

function match(interaction) {
  const { parseServerRefreshCustomId } = require("../../Utils/Interaction/buttonParsers");
  return !!parseServerRefreshCustomId(interaction?.customId);
}

async function execute(interaction) {
  const { denyIfNotOwner, sendControlErrorFallback, parseServerRefreshCustomId, normalizeComponentsForDiscord } = require("../../Utils/Interaction/buttonParsers");
  const parsed = parseServerRefreshCustomId(interaction.customId);
  if (!parsed) return false;
  if (await denyIfNotOwner(interaction, parsed.ownerId)) return true;
  try {
    await interaction.deferUpdate();
    const payload = await buildServerOverviewPayload(interaction.guild, parsed.lookbackDays, parsed.ownerId || interaction.user?.id);
    await interaction.message.edit({
      ...payload,
      components: normalizeComponentsForDiscord(payload?.components),
      content: payload.content || null,
    });
  } catch (error) {
    global.logger?.error?.("[SERVER REFRESH BUTTON] Failed:", error);
    await sendControlErrorFallback(interaction);
  }
  return true;
}

module.exports = { name, label, description, order, match, execute, buildServerOverviewPayload, buildRefreshRow, SERVER_REFRESH_CUSTOM_ID_PREFIX, parseServerActivityArgs };
