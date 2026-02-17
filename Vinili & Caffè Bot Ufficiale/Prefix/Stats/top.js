const {
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const IDs = require("../../Utils/Config/ids");
const {
  getServerOverviewStats,
} = require("../../Services/Community/activityService");
const {
  renderTopStatisticsCanvas,
  renderTopLeaderboardPageCanvas,
} = require("../../Utils/Render/activityCanvas");
const {
  upsertChannelSnapshot,
  syncGuildChannelSnapshots,
  getChannelSnapshotMap,
} = require("../../Utils/Community/channelSnapshotUtils");

const TOP_CHANNEL_DIRECT_CHANNEL_IDS = new Set(
  [IDs.channels.commands, IDs.channels.staffCmds, IDs.channels.highCmds]
    .filter(Boolean)
    .map(String),
);

const TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX = "stats_top_channel_refresh";
const TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX = "stats_top_channel_period_open";
const TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX = "stats_top_channel_period_set";
const TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX = "stats_top_channel_period_back";
const TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX = "stats_top_channel_view_select";

const TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX = "stats_top_channel_page_first";
const TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX = "stats_top_channel_page_prev";
const TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX =
  "stats_top_channel_page_modal_open";
const TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX = "stats_top_channel_page_next";
const TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX = "stats_top_channel_page_last";

const TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX = "stats_top_channel_page_modal";
const TOP_CHANNEL_PAGE_MODAL_INPUT_CUSTOM_ID = "stats_top_channel_page_modal_input";

const TOP_VIEWS = [
  "overview",
  "message_users",
  "voice_users",
  "message_channels",
  "voice_channels",
];
const TOP_PAGE_DATA_LIMIT = 100;
const TOP_SOURCE_CACHE_TTL_MS = 15 * 1000;
const SNAPSHOT_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const topSourceCache = new Map();
const snapshotSyncByGuild = new Map();

function normalizeLookbackDays(raw) {
  const parsed = Number(
    String(raw || "14")
      .toLowerCase()
      .replace(/d$/i, ""),
  );
  return [1, 7, 14, 21, 30].includes(parsed) ? parsed : 14;
}

function normalizeTopView(raw) {
  const value = String(raw || "overview")
    .trim()
    .toLowerCase();
  return TOP_VIEWS.includes(value) ? value : "overview";
}

function normalizeControlsView(raw) {
  return String(raw || "main").toLowerCase() === "period" ? "period" : "main";
}

function normalizePage(value, fallback = 1) {
  const n = Number.parseInt(String(value || fallback), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeCanvasLabel(value, fallback) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return fallback;
  if (/^<@!?\d+>$/.test(text)) return fallback;
  if (/^<#\d+>$/.test(text)) return fallback;
  return text;
}

async function resolveDisplayName(guild, userId) {
  const cachedMember = guild.members.cache.get(userId);
  if (cachedMember) return cachedMember.displayName;
  const fetchedMember = await guild.members.fetch(userId).catch(() => null);
  if (fetchedMember) return fetchedMember.displayName;
  const cachedUser = guild.client.users.cache.get(userId);
  if (cachedUser) return cachedUser.username;
  const fetchedUser = await guild.client.users.fetch(userId).catch(() => null);
  if (fetchedUser) return fetchedUser.username;
  return `utente_${String(userId).slice(-6)}`;
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
    if (
      ch.type === ChannelType.GuildVoice ||
      ch.type === ChannelType.GuildStageVoice
    ) {
      voiceCount += 1;
      continue;
    }
    if (
      ch.type === ChannelType.GuildText ||
      ch.type === ChannelType.GuildAnnouncement
    ) {
      textCount += 1;
    }
  }

  return voiceCount >= 2 && textCount <= 2;
}

async function resolveTopUserEntries(guild, entries = []) {
  const out = [];
  for (const item of entries) {
    const userId = String(item?.id || "");
    const rawDisplayName = await resolveDisplayName(guild, userId);
    out.push({
      id: userId,
      label: normalizeCanvasLabel(rawDisplayName, `utente_${userId.slice(-6)}`),
      value: Number(item?.value || 0),
    });
  }
  return out;
}

async function resolveTopChannelEntries(guild, entries = [], snapshotMap = new Map()) {
  const afkIds = new Set(
    [guild?.afkChannelId, IDs.channels?.vocaleAFK]
      .filter(Boolean)
      .map((x) => String(x)),
  );

  const out = [];
  for (const item of entries) {
    const channelId = String(item?.id || "");
    if (afkIds.has(channelId)) continue;

    const channel = guild.channels?.cache?.get(channelId) || null;
    if (channel) {
      upsertChannelSnapshot(channel).catch(() => {});
    }
    const snapshotName = String(snapshotMap.get(channelId) || "").trim();
    const rawLabel = channel
      ? `#${channel.name}`
      : snapshotName
        ? `#${snapshotName}`
        : "#canale-eliminato";
    out.push({
      id: channelId,
      label: normalizeCanvasLabel(rawLabel, "#canale-eliminato"),
      value: Number(item?.value || 0),
    });
  }
  return out;
}

async function resolveTopTextChannelEntries(guild, entries = [], snapshotMap = new Map()) {
  const rows = await resolveTopChannelEntries(guild, entries, snapshotMap);
  const out = [];

  for (const row of rows) {
    const channelId = String(row?.id || "");
    const channel = guild.channels?.cache?.get(channelId) || null;

    if (!channel) {
      out.push(row);
      continue;
    }
    if (isTextChannelUnderVoiceCategory(guild, channel)) continue;
    out.push(row);
  }

  return out;
}

function buildSourceCacheKey(guildId, lookbackDays) {
  return `${String(guildId || "")}:${Number(lookbackDays || 14)}`;
}

function scheduleSnapshotSync(guild) {
  const guildId = String(guild?.id || "");
  if (!guildId) return;
  const now = Date.now();
  const nextAllowed = Number(snapshotSyncByGuild.get(guildId) || 0);
  if (nextAllowed > now) return;
  snapshotSyncByGuild.set(guildId, now + SNAPSHOT_SYNC_INTERVAL_MS);
  syncGuildChannelSnapshots(guild).catch(() => {});
}

async function getTopSource(guild, lookbackDays) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const cacheKey = buildSourceCacheKey(guild?.id, safeLookback);
  const now = Date.now();
  const cached = topSourceCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  scheduleSnapshotSync(guild);

  const stats = await getServerOverviewStats(
    guild.id,
    safeLookback,
    TOP_PAGE_DATA_LIMIT,
  );
  const channelIds = Array.from(
    new Set(
      [...(stats.topChannelsText || []), ...(stats.topChannelsVoice || [])]
        .map((item) => String(item?.id || "").trim())
        .filter(Boolean),
    ),
  );
  const snapshotMap = await getChannelSnapshotMap(guild.id, channelIds);

  const topUsersText = await resolveTopUserEntries(guild, stats.topUsersText || []);
  const topChannelsText = await resolveTopTextChannelEntries(
    guild,
    stats.topChannelsText || [],
    snapshotMap,
  );
  const topUsersVoice = await resolveTopUserEntries(guild, stats.topUsersVoice || []);
  const topChannelsVoice = await resolveTopChannelEntries(
    guild,
    stats.topChannelsVoice || [],
    snapshotMap,
  );

  const value = {
    topUsersText,
    topChannelsText,
    topUsersVoice,
    topChannelsVoice,
  };
  topSourceCache.set(cacheKey, { expiresAt: now + TOP_SOURCE_CACHE_TTL_MS, value });
  return value;
}

function resolveViewConfig(selectedView, source) {
  const safeView = normalizeTopView(selectedView);
  if (safeView === "message_users") {
    return {
      title: "Top Message Users",
      rows: source.topUsersText,
      unit: "msg",
      mode: "messages",
    };
  }
  if (safeView === "voice_users") {
    return {
      title: "Top Voice Users",
      rows: source.topUsersVoice,
      unit: "h",
      mode: "voice",
    };
  }
  if (safeView === "message_channels") {
    return {
      title: "Top Message Channels",
      rows: source.topChannelsText,
      unit: "msg",
      mode: "messages",
    };
  }
  return {
    title: "Top Voice Channels",
    rows: source.topChannelsVoice,
    unit: "h",
    mode: "voice",
  };
}

function buildTopChannelSelectRow(lookbackDays, selectedView = "overview") {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        `${TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX}:${safeLookback}:${safeView}`,
      )
      .setPlaceholder("Overview")
      .addOptions(
        {
          label: "Overview",
          value: "overview",
          default: safeView === "overview",
        },
        {
          label: "Top Message Users",
          value: "message_users",
          default: safeView === "message_users",
        },
        {
          label: "Top Voice Users",
          value: "voice_users",
          default: safeView === "voice_users",
        },
        {
          label: "Top Message Channels",
          value: "message_channels",
          default: safeView === "message_channels",
        },
        {
          label: "Top Voice Channels",
          value: "voice_channels",
          default: safeView === "voice_channels",
        },
      ),
  );
}

function buildTopChannelMainControlsRow(
  lookbackDays,
  selectedView = "overview",
  page = 1,
) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);
  const safePage = normalizePage(page, 1);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX}:${safeLookback}:${safeView}:${safePage}`,
      )
      .setEmoji({ id: "1473359252276904203", name: "VC_Refresh" })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(
        `${TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${safeLookback}:${safeView}:${safePage}`,
      )
      .setEmoji({ id: "1473359204189474886", name: "VC_Clock" })
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildTopChannelPeriodControlsRows(
  lookbackDays,
  selectedView = "overview",
  page = 1,
) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);
  const safePage = normalizePage(page, 1);

  const topRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX}:${safeLookback}:${safeView}:${safePage}`,
      )
      .setEmoji({ id: "1462914743416131816", name: "vegaleftarrow", animated: true })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX}:1:${safeView}:${safePage}`)
      .setLabel("1d")
      .setStyle(safeLookback === 1 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX}:7:${safeView}:${safePage}`)
      .setLabel("7d")
      .setStyle(safeLookback === 7 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX}:14:${safeView}:${safePage}`)
      .setLabel("14d")
      .setStyle(safeLookback === 14 ? ButtonStyle.Success : ButtonStyle.Primary),
  );

  const bottomRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX}:21:${safeView}:${safePage}`)
      .setLabel("21d")
      .setStyle(safeLookback === 21 ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX}:30:${safeView}:${safePage}`)
      .setLabel("30d")
      .setStyle(safeLookback === 30 ? ButtonStyle.Success : ButtonStyle.Primary),
  );

  return [topRow, bottomRow];
}

function buildTopChannelPaginationRow(
  lookbackDays,
  selectedView,
  page,
  totalPages,
  controlsView = "main",
) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);
  const safePage = Math.min(Math.max(1, normalizePage(page, 1)), Math.max(1, normalizePage(totalPages, 1)));
  const safeTotal = Math.max(1, normalizePage(totalPages, 1));
  const controls = normalizeControlsView(controlsView);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX}:${safeLookback}:${safeView}:${safePage}:${safeTotal}:${controls}`,
      )
      .setLabel("First")
      .setStyle(ButtonStyle.Success)
      .setDisabled(safePage <= 1),
    new ButtonBuilder()
      .setCustomId(
        `${TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX}:${safeLookback}:${safeView}:${safePage}:${safeTotal}:${controls}`,
      )
      .setLabel("Previous")
      .setStyle(ButtonStyle.Success)
      .setDisabled(safePage <= 1),
    new ButtonBuilder()
      .setCustomId(
        `${TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX}:${safeLookback}:${safeView}:${safePage}:${safeTotal}:${controls}`,
      )
      .setLabel(`${safePage}/${safeTotal}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(
        `${TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX}:${safeLookback}:${safeView}:${safePage}:${safeTotal}:${controls}`,
      )
      .setLabel("Next")
      .setStyle(ButtonStyle.Success)
      .setDisabled(safePage >= safeTotal),
    new ButtonBuilder()
      .setCustomId(
        `${TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX}:${safeLookback}:${safeView}:${safePage}:${safeTotal}:${controls}`,
      )
      .setLabel("Last")
      .setStyle(ButtonStyle.Success)
      .setDisabled(safePage >= safeTotal),
  );
}

function buildTopChannelComponents(
  lookbackDays,
  controlsView = "main",
  selectedView = "overview",
  page = 1,
  totalPages = 1,
) {
  const safeView = normalizeTopView(selectedView);
  const safeControls = normalizeControlsView(controlsView);

  const rows = [buildTopChannelSelectRow(lookbackDays, safeView)];
  if (safeView !== "overview") {
    rows.push(
      buildTopChannelPaginationRow(
        lookbackDays,
        safeView,
        page,
        totalPages,
        safeControls,
      ),
    );
  }

  rows.push(buildTopChannelMainControlsRow(lookbackDays, safeView, page));
  if (safeControls === "period") {
    rows.push(...buildTopChannelPeriodControlsRows(lookbackDays, safeView, page));
  }

  return rows;
}

function buildTopPageJumpModal(
  lookbackDays,
  selectedView,
  currentPage,
  totalPages,
  controlsView = "main",
) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);
  const safeCurrent = normalizePage(currentPage, 1);
  const safeTotal = Math.max(1, normalizePage(totalPages, 1));
  const controls = normalizeControlsView(controlsView);

  const input = new TextInputBuilder()
    .setCustomId(TOP_CHANNEL_PAGE_MODAL_INPUT_CUSTOM_ID)
    .setLabel(`Pagina (1-${safeTotal})`)
    .setPlaceholder(String(safeCurrent))
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4);

  const row = new ActionRowBuilder().addComponents(input);

  return new ModalBuilder()
    .setCustomId(
      `${TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX}:${safeLookback}:${safeView}:${safeCurrent}:${safeTotal}:${controls}`,
    )
    .setTitle("Vai a una pagina")
    .addComponents(row);
}

function resolveRequestedPage(action, currentPage, totalPages) {
  const current = Math.max(1, normalizePage(currentPage, 1));
  const total = Math.max(1, normalizePage(totalPages, 1));

  if (action === "first") return 1;
  if (action === "prev") return Math.max(1, current - 1);
  if (action === "next") return Math.min(total, current + 1);
  if (action === "last") return total;
  return current;
}

async function buildTopChannelPayload(
  message,
  lookbackDays = 14,
  controlsView = "main",
  selectedView = "overview",
  page = 1,
) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);
  const safeControls = normalizeControlsView(controlsView);
  const source = await getTopSource(message.guild, safeLookback);

  const isOverview = safeView === "overview";
  const viewConfig = !isOverview ? resolveViewConfig(safeView, source) : null;
  const totalItems = viewConfig ? viewConfig.rows.length : 0;
  const totalPages = isOverview ? 1 : Math.max(1, Math.ceil(totalItems / 10));
  const safePage = Math.min(Math.max(1, normalizePage(page, 1)), totalPages);
  const pageRows = isOverview
    ? []
    : viewConfig.rows.slice((safePage - 1) * 10, safePage * 10);

  const imageName = `top-channel-${safeView}-${message.guild.id}-${safeLookback}d-p${safePage}-${Date.now()}.png`;

  try {
    let buffer = null;

    if (isOverview) {
      buffer = await renderTopStatisticsCanvas({
        guildName: message.guild?.name || "Server",
        guildIconUrl: message.guild?.iconURL?.({ extension: "png", size: 256 }),
        lookbackDays: safeLookback,
        ...source,
      });
    } else {
      buffer = await renderTopLeaderboardPageCanvas({
        guildName: message.guild?.name || "Server",
        guildIconUrl: message.guild?.iconURL?.({ extension: "png", size: 256 }),
        lookbackDays: safeLookback,
        title: viewConfig.title,
        page: safePage,
        totalPages,
        rows: pageRows,
        unit: viewConfig.unit,
        mode: viewConfig.mode,
      });
    }

    return {
      files: [new AttachmentBuilder(buffer, { name: imageName })],
      embeds: [],
      content: null,
      components: buildTopChannelComponents(
        safeLookback,
        safeControls,
        safeView,
        safePage,
        totalPages,
      ),
      meta: {
        lookbackDays: safeLookback,
        selectedView: safeView,
        controlsView: safeControls,
        page: safePage,
        totalPages,
      },
    };
  } catch (error) {
    global.logger?.warn?.("[TOP] Canvas render failed:", error);
    return {
      embeds: [],
      content:
        "<:vegax:1443934876440068179> Non sono riuscito a generare l'immagine top.",
      components: buildTopChannelComponents(
        safeLookback,
        safeControls,
        safeView,
        safePage,
        totalPages,
      ),
      meta: {
        lookbackDays: safeLookback,
        selectedView: safeView,
        controlsView: safeControls,
        page: safePage,
        totalPages,
      },
    };
  }
}

async function sendTopPayload(message, payload) {
  const channelId = String(message.channel.id || "");
  if (TOP_CHANNEL_DIRECT_CHANNEL_IDS.has(channelId)) {
    await safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const targetChannel =
    message.guild.channels.cache.get(IDs.channels.commands) ||
    (await message.guild.channels.fetch(IDs.channels.commands).catch(() => null));

  if (!targetChannel || !targetChannel.isTextBased()) {
    await safeMessageReply(message, {
      content: `Non riesco a trovare il canale <#${IDs.channels.commands}>.`,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const sent = await targetChannel.send(payload).catch(() => null);
  if (!sent) {
    await safeMessageReply(message, {
      content: `Non sono riuscito a inviare la classifica in <#${IDs.channels.commands}>.`,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  await safeMessageReply(message, {
    content:
      `Per evitare di intasare la chat, la classifica e stata generata in <#${IDs.channels.commands}>.\n` +
      `[Clicca qui per vederla](${sent.url}).`,
    allowedMentions: { repliedUser: false },
  });
}

module.exports = {
  name: "top",
  TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_MODAL_INPUT_CUSTOM_ID,
  buildTopChannelPayload,
  buildTopChannelComponents,
  buildTopPageJumpModal,
  normalizeLookbackDays,
  normalizeTopView,
  normalizeControlsView,
  normalizePage,
  resolveRequestedPage,

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    const dayToken = Array.isArray(args)
      ? args.find((x) => /^\d+d?$/i.test(String(x || "").trim()))
      : null;

    const payload = await buildTopChannelPayload(
      message,
      dayToken || "14",
      "main",
      "overview",
      1,
    );
    await sendTopPayload(message, payload);
  },
};
