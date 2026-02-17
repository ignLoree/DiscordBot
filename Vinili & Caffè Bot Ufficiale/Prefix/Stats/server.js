const {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const IDs = require("../../Utils/Config/ids");
const {
  getServerOverviewStats,
} = require("../../Services/Community/activityService");
const {
  renderServerActivityCanvas,
} = require("../../Utils/Render/activityCanvas");
const SERVER_REFRESH_CUSTOM_ID_PREFIX = "stats_server_refresh";

function parseWindowDays(rawValue) {
  const parsed = Number(
    String(rawValue || "14")
      .toLowerCase()
      .replace(/d$/i, ""),
  );
  if ([7, 14, 21, 30].includes(parsed)) return parsed;
  return 14;
}

function parseServerActivityArgs(args = []) {
  const tokens = Array.isArray(args)
    ? args.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const wantsEmbed = tokens.some((t) => t.toLowerCase() === "embed");
  const dayToken = tokens.find((t) => /^\d+d?$/i.test(t));
  return {
    lookbackDays: parseWindowDays(dayToken || "14"),
    wantsEmbed,
  };
}

function formatHours(seconds) {
  return (Number(seconds || 0) / 3600).toFixed(2);
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
  const channel =
    guild.channels?.cache?.get(id) ||
    (await guild.channels?.fetch(id).catch(() => null));
  if (!channel) return `#${id}`;
  return `#${channel.name}`;
}

async function resolveMemberVisibilityRole(guild) {
  if (!guild) return null;
  const configuredId = String(IDs.roles?.Member || "").trim();
  if (configuredId) {
    const role =
      guild.roles?.cache?.get(configuredId) ||
      (await guild.roles?.fetch(configuredId).catch(() => null));
    if (role) return role;
  }
  return guild.roles?.everyone || null;
}

async function isChannelVisibleToMemberRole(guild, channelId, memberRole) {
  const id = String(channelId || "");
  if (!id || !guild || !memberRole) return false;
  const channel =
    guild.channels?.cache?.get(id) ||
    (await guild.channels?.fetch(id).catch(() => null));
  if (!channel) return false;
  const perms = channel.permissionsFor(memberRole);
  return Boolean(perms?.has("ViewChannel"));
}

async function resolveUserLabel(guild, userId) {
  const id = String(userId || "");
  if (!id) return id;
  const member =
    guild.members?.cache?.get(id) ||
    (await guild.members?.fetch(id).catch(() => null));
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
    topUsersText.push({
      ...item,
      label: await resolveUserLabel(guild, item.id),
    });
  const topUsersVoice = [];
  for (const item of stats.topUsersVoice || [])
    topUsersVoice.push({
      ...item,
      label: await resolveUserLabel(guild, item.id),
    });
  const topChannelsText = [];
  for (const item of stats.topChannelsText || []) {
    const visible = await isChannelVisibleToMemberRole(
      guild,
      item?.id,
      memberRole,
    );
    if (!visible) continue;
    topChannelsText.push({
      ...item,
      label: await resolveChannelLabel(guild, item.id),
    });
  }
  const topChannelsVoice = [];
  for (const item of stats.topChannelsVoice || []) {
    const visible = await isChannelVisibleToMemberRole(
      guild,
      item?.id,
      memberRole,
    );
    if (!visible) continue;
    topChannelsVoice.push({
      ...item,
      label: await resolveChannelLabel(guild, item.id),
    });
  }
  return { topUsersText, topUsersVoice, topChannelsText, topChannelsVoice };
}

function buildRefreshRow(lookbackDays, wantsEmbed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${SERVER_REFRESH_CUSTOM_ID_PREFIX}:${Number(lookbackDays || 14)}:${wantsEmbed ? "embed" : "image"}`,
      )
      .setEmoji({ id: "1473359252276904203", name: "VC_Refresh" })
      .setStyle(ButtonStyle.Secondary),
  );
}

async function buildServerOverviewPayload(guild, lookbackDays = 14, wantsEmbed = false) {
  const stats = await getServerOverviewStats(guild.id, lookbackDays);
  const lookbackKey = `d${lookbackDays}`;
  const d1 = safeWindow(stats?.windows, "d1");
  const d7 = safeWindow(stats?.windows, "d7");
  const dLookback = safeWindow(stats?.windows, lookbackKey);
  const enriched = await enrichTops(guild, stats);

  const imageName = `server-overview-${guild.id}-${lookbackDays}d.png`;
  let file = null;
  try {
    const buffer = await renderServerActivityCanvas({
      guildName: guild?.name || "Server",
      guildIconUrl: guild?.iconURL({ extension: "png", size: 256 }) || null,
      createdOn: guild?.createdAt || null,
      invitedBotOn: guild?.members?.me?.joinedAt || null,
      lookbackDays,
      windows: {
        d1,
        d7,
        d14: dLookback,
        [lookbackKey]: dLookback,
      },
      topUsersText: enriched.topUsersText,
      topUsersVoice: enriched.topUsersVoice,
      topChannelsText: enriched.topChannelsText,
      topChannelsVoice: enriched.topChannelsVoice,
      chart: Array.isArray(stats?.chart) ? stats.chart : [],
      approximate: Boolean(stats?.approximate),
    });
    file = new AttachmentBuilder(buffer, { name: imageName });
  } catch (error) {
    global.logger?.warn?.(
      "[SERVER] Canvas render failed:",
      error?.message || error,
    );
  }

  if (!wantsEmbed) {
    return {
      files: file ? [file] : [],
      content: file
        ? null
        : "<:vegax:1443934876440068179> Non sono riuscito a generare il canvas.",
      components: [buildRefreshRow(lookbackDays, wantsEmbed)],
    };
  }

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: `${guild?.name || "Server"} - Overview ${lookbackDays}d`,
      iconURL: guild?.iconURL({ size: 128 }) || null,
    })
    .setImage(file ? `attachment://${imageName}` : null)
    .setDescription(
      [
        `Messaggi (1d/7d/${lookbackDays}d): **${d1.text} / ${d7.text} / ${dLookback.text}**`,
        `Ore vocali (1d/7d/${lookbackDays}d): **${formatHours(d1.voiceSeconds)} / ${formatHours(d7.voiceSeconds)} / ${formatHours(dLookback.voiceSeconds)}**`,
        `Contributori (1d/7d/${lookbackDays}d): **${d1.contributors} / ${d7.contributors} / ${dLookback.contributors}**`,
        stats?.approximate ? "_Nota: dati retroattivi parziali._" : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );

  return {
    embeds: [embed],
    files: file ? [file] : [],
    components: [buildRefreshRow(lookbackDays, wantsEmbed)],
  };
}

module.exports = {
  name: "server",
  SERVER_REFRESH_CUSTOM_ID_PREFIX,
  buildServerOverviewPayload,

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const { lookbackDays, wantsEmbed } = parseServerActivityArgs(args);
    const payload = await buildServerOverviewPayload(
      message.guild,
      lookbackDays,
      wantsEmbed,
    );
    await safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};
