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
  getUserOverviewStats,
} = require("../../Services/Community/activityService");
const {
  renderUserActivityCanvas,
} = require("../../Utils/Render/activityCanvas");

const ME_REFRESH_CUSTOM_ID_PREFIX = "stats_me_refresh";
const ME_PERIOD_OPEN_CUSTOM_ID_PREFIX = "stats_me_period_open";
const ME_PERIOD_SET_CUSTOM_ID_PREFIX = "stats_me_period_set";
const ME_PERIOD_BACK_CUSTOM_ID_PREFIX = "stats_me_period_back";
const VALID_LOOKBACKS = [1, 7, 14, 21, 30];

function parseWindowDays(rawValue) {
  const parsed = Number(
    String(rawValue || "14")
      .toLowerCase()
      .replace(/d$/i, ""),
  );
  if ([1, 7, 14, 21, 30].includes(parsed)) return parsed;
  return 14;
}

function parseMyActivityArgs(args = []) {
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

function normalizeLookbackDays(value) {
  const n = Number.parseInt(String(value || "14"), 10);
  return VALID_LOOKBACKS.includes(n) ? n : 14;
}

function buildMainControlsRow(lookbackDays, wantsEmbed) {
  const mode = wantsEmbed ? "embed" : "image";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${ME_REFRESH_CUSTOM_ID_PREFIX}:${normalizeLookbackDays(lookbackDays)}:${mode}`,
      )
      .setEmoji({ id: "1473359252276904203", name: "VC_Refresh" })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(
        `${ME_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${normalizeLookbackDays(lookbackDays)}:${mode}`,
      )
      .setEmoji({ id: "1473359204189474886", name: "VC_Clock" })
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildPeriodControlsRows(lookbackDays, wantsEmbed) {
  const mode = wantsEmbed ? "embed" : "image";
  const current = normalizeLookbackDays(lookbackDays);
  const topRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${ME_PERIOD_BACK_CUSTOM_ID_PREFIX}:${normalizeLookbackDays(lookbackDays)}:${mode}`,
      )
      .setEmoji({ id: "1462914743416131816", name: "vegaleftarrow", animated: true })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${ME_PERIOD_SET_CUSTOM_ID_PREFIX}:1:${mode}`)
      .setLabel("1d")
      .setStyle(current === 1 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${ME_PERIOD_SET_CUSTOM_ID_PREFIX}:7:${mode}`)
      .setLabel("7d")
      .setStyle(current === 7 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${ME_PERIOD_SET_CUSTOM_ID_PREFIX}:14:${mode}`)
      .setLabel("14d")
      .setStyle(current === 14 ? ButtonStyle.Success : ButtonStyle.Primary),
  );
  const bottomRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ME_PERIOD_SET_CUSTOM_ID_PREFIX}:21:${mode}`)
      .setLabel("21d")
      .setStyle(current === 21 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${ME_PERIOD_SET_CUSTOM_ID_PREFIX}:30:${mode}`)
      .setLabel("30d")
      .setStyle(current === 30 ? ButtonStyle.Success : ButtonStyle.Primary),
  );
  return [topRow, bottomRow];
}

function buildMeComponents(lookbackDays, wantsEmbed, controlsView = "main") {
  if (controlsView === "period") {
    return buildPeriodControlsRows(lookbackDays, wantsEmbed);
  }
  return [buildMainControlsRow(lookbackDays, wantsEmbed)];
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

async function enrichChannels(guild, items = []) {
  const memberRole = await resolveMemberVisibilityRole(guild);
  const out = [];
  for (const item of items) {
    const visible = await isChannelVisibleToMemberRole(
      guild,
      item?.id,
      memberRole,
    );
    if (!visible) continue;
    out.push({ ...item, label: await resolveChannelLabel(guild, item?.id) });
  }
  return out;
}

async function buildMeOverviewPayload(
  guild,
  user,
  member,
  lookbackDays = 14,
  wantsEmbed = false,
  controlsView = "main",
) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const stats = await getUserOverviewStats(guild.id, user.id, safeLookback);
  const lookbackKey = `d${safeLookback}`;
  const lookbackWindow = stats?.windows?.[lookbackKey] || stats?.windows?.d14 || {
    text: 0,
    voiceSeconds: 0,
  };
  const topChannelsText = await enrichChannels(guild, stats.topChannelsText);
  const topChannelsVoice = await enrichChannels(guild, stats.topChannelsVoice);

  const imageName = `me-overview-${user.id}-${safeLookback}d.png`;
  let file = null;
  try {
    const buffer = await renderUserActivityCanvas({
      guildName: guild?.name || "Server",
      userTag: user.tag,
      displayName: member?.displayName || user.username,
      avatarUrl: user.displayAvatarURL({
        extension: "png",
        size: 256,
      }),
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

  const components = buildMeComponents(safeLookback, wantsEmbed, controlsView);

  if (!wantsEmbed) {
    return {
      files: file ? [file] : [],
      content: file
        ? null
        : "<:vegax:1443934876440068179> Non sono riuscito a generare il canvas.",
      components,
    };
  }

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: `${user.tag} - My Activity ${safeLookback}d`,
      iconURL: user.displayAvatarURL({ size: 128 }),
    })
    .setImage(file ? `attachment://${imageName}` : null)
    .setDescription(
      [
        `Messaggi (1d/7d/${safeLookback}d): **${stats.windows.d1.text} / ${stats.windows.d7.text} / ${lookbackWindow.text}**`,
        `Ore vocali (1d/7d/${safeLookback}d): **${formatHours(stats.windows.d1.voiceSeconds)} / ${formatHours(stats.windows.d7.voiceSeconds)} / ${formatHours(lookbackWindow.voiceSeconds)}**`,
        `Rank server (${safeLookback}d): **Text #${stats.ranks.text || "-"} - Voice #${stats.ranks.voice || "-"}**`,
        stats.approximate ? "_Nota: dati retroattivi parziali._" : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );

  return {
    embeds: [embed],
    files: file ? [file] : [],
    components,
  };
}

module.exports = {
  name: "me",
  ME_REFRESH_CUSTOM_ID_PREFIX,
  ME_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  ME_PERIOD_SET_CUSTOM_ID_PREFIX,
  ME_PERIOD_BACK_CUSTOM_ID_PREFIX,
  buildMeOverviewPayload,
  buildMeComponents,
  normalizeLookbackDays,

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const { lookbackDays, wantsEmbed } = parseMyActivityArgs(args);
    const payload = await buildMeOverviewPayload(
      message.guild,
      message.author,
      message.member,
      lookbackDays,
      wantsEmbed,
      "main",
    );

    await safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};
