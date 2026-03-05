const { AttachmentBuilder, ChannelType } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const IDs = require("../../Utils/Config/ids");
const { getServerOverviewStats } = require("../../Services/Community/activityService");
const { InviteTrack } = require("../../Schemas/Community/communitySchemas");
const { renderTopStatisticsCanvas, renderTopLeaderboardPageCanvas } = require("../../Utils/Render/activityCanvas");
const { upsertChannelSnapshot, syncGuildChannelSnapshots, getChannelSnapshotMap } = require("../../Utils/Community/channelSnapshotUtils");
const { getGuildMemberCached, getUserCached } = require("../../Utils/Interaction/interactionEntityCache");
const topComponents = require("../../Buttons/topChannel/components");

const TOP_CHANNEL_DIRECT_CHANNEL_IDS = new Set([IDs.channels.commands, IDs.channels.staffCmds, IDs.channels.highCmds].filter(Boolean).map(String));

const {
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
  normalizeLookbackDays,
  normalizeTopView,
  normalizeControlsView,
  normalizePage,
  buildTopChannelComponents,
  buildTopPageJumpModal,
} = topComponents;

const TOP_PAGE_DATA_LIMIT = 100;
const TOP_SOURCE_CACHE_TTL_MS = 15 * 1000;
const SNAPSHOT_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const topSourceCache = new Map();
const snapshotSyncByGuild = new Map();

function normalizeCanvasLabel(value, fallback) {
  const text=String(value||"").replace(/\s+/g," ").trim();
  if (!text) return fallback;
  if (/^<@!?\d+>$/.test(text)) return fallback;
  if (/^<#\d+>$/.test(text)) return fallback;
  return text;
}

async function resolveDisplayName(guild, userId) {
  const cachedMember = guild.members.cache.get(userId);
  if (cachedMember) return cachedMember.displayName;
  const fetchedMember = await getGuildMemberCached(guild, userId);
  if (fetchedMember) return fetchedMember.displayName;
  const cachedUser = guild.client.users.cache.get(userId);
  if (cachedUser) return cachedUser.username;
  const fetchedUser = await getUserCached(guild.client, userId);
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

async function isBotUser(guild, userId) {
  const memberCached = guild.members.cache.get(userId);
  if (memberCached) return Boolean(memberCached.user?.bot);

  const memberFetched = await getGuildMemberCached(guild, userId);
  if (memberFetched) return Boolean(memberFetched.user?.bot);

  const userCached = guild.client.users.cache.get(userId);
  if (userCached) return Boolean(userCached.bot);

  const userFetched = await getUserCached(guild.client, userId);
  return Boolean(userFetched?.bot);
}

async function resolveTopInviteEntries(
  guild,
  guildId,
  limit = TOP_PAGE_DATA_LIMIT,
) {
  const safeGuildId = String(guildId || "").trim();
  if (!safeGuildId) return [];

  let trackedTotals = [];
  try {
    trackedTotals = await InviteTrack.aggregate([
      {
        $match: {
          guildId: safeGuildId,
          inviterId: { $exists: true, $nin: [null, ""] },
        },
      },
      { $group: { _id: "$inviterId", value: { $sum: 1 } } },
      { $sort: { value: -1 } },
      { $limit: Math.max(20, Number(limit || TOP_PAGE_DATA_LIMIT) * 2) },
    ]);
  } catch {
    trackedTotals = [];
  }

  const trackedByInviter = new Map();
  for (const item of trackedTotals) {
    const inviterId = String(item?._id || "").trim();
    if (!inviterId) continue;
    trackedByInviter.set(inviterId, Number(item?.value || 0));
  }

  const liveUsesByInviter = new Map();
  const liveInvites = await guild.invites.fetch().catch(() => null);
  if (liveInvites?.size) {
    for (const invite of liveInvites.values()) {
      const inviterId = String(invite?.inviter?.id || "").trim();
      if (!inviterId) continue;
      const uses = Number(invite?.uses || 0);
      liveUsesByInviter.set(
        inviterId,
        Number(liveUsesByInviter.get(inviterId) || 0) + uses,
      );
    }
  }

  const inviterIds=new Set([...trackedByInviter.keys(),...liveUsesByInviter.keys(),]);

  const out = [];
  for (const userId of inviterIds) {
    if (!userId) continue;
    const bot = await isBotUser(guild, userId);
    if (bot) continue;

    const trackedTotal = Number(trackedByInviter.get(userId) || 0);
    const liveUses = Number(liveUsesByInviter.get(userId) || 0);
    const effectiveValue = Math.max(trackedTotal, liveUses);
    if (effectiveValue <= 0) continue;

    const rawDisplayName = await resolveDisplayName(guild, userId);
    out.push({
      id: userId,
      label: normalizeCanvasLabel(rawDisplayName, `utente_${userId.slice(-6)}`),
      value: effectiveValue,
    });
  }

  out.sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
  return out.slice(0, Math.max(1, Number(limit || TOP_PAGE_DATA_LIMIT)));
}

async function resolveTopChannelEntries(guild, entries = [], snapshotMap = new Map()) {
  const afkIds=new Set([guild?.afkChannelId,IDs.channels?.vocaleAFK].filter(Boolean).map((x) => String(x)),);

  const out = [];
  for (const item of entries) {
    const channelId = String(item?.id || "");
    if (afkIds.has(channelId)) continue;

    const channel = guild.channels?.cache?.get(channelId) || null;
    if (channel) {
      upsertChannelSnapshot(channel).catch(() => {});
    }
    const snapshotName = String(snapshotMap.get(channelId) || "").trim();
    const rawLabel=channel?`#${channel.name}`
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

  const stats=await getServerOverviewStats(guild.id,safeLookback,TOP_PAGE_DATA_LIMIT,);
  const channelIds=Array.from(new Set([...(stats.topChannelsText||[]),...(stats.topChannelsVoice||[])].map((item) => String(item?.id||"").trim()).filter(Boolean),),);
  const snapshotMap = await getChannelSnapshotMap(guild.id, channelIds);

  const topUsersText = await resolveTopUserEntries(guild, stats.topUsersText || []);
  const topChannelsText=await resolveTopTextChannelEntries(guild,stats.topChannelsText||[],snapshotMap,);
  const topUsersVoice = await resolveTopUserEntries(guild, stats.topUsersVoice || []);
  const topUsersInvites=await resolveTopInviteEntries(guild,guild.id,TOP_PAGE_DATA_LIMIT,);
  const topChannelsVoice=await resolveTopChannelEntries(guild,stats.topChannelsVoice||[],snapshotMap,);

  const value={topUsersText,topChannelsText,topUsersVoice,topUsersInvites,topChannelsVoice,};
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
      title: "Top canali messaggi",
      rows: source.topChannelsText,
      unit: "msg",
      mode: "messages",
    };
  }
  if (safeView === "invites_users") {
    return {
      title: "Invites User",
      rows: source.topUsersInvites,
      unit: "invites",
      mode: "messages",
    };
  }
  return {
    title: "Top canali vocali",
    rows: source.topChannelsVoice,
    unit: "h",
    mode: "voice",
  };
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
  ownerId = null,
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
  const pageRows=isOverview?[]:viewConfig.rows.slice((safePage-1)*10,safePage*10);

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
        ownerId,
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
        ownerId,
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

  const targetChannel=message.guild.channels.cache.get(IDs.channels.commands)||(await message.guild.channels.fetch(IDs.channels.commands).catch(() => null));

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
      `Per evitare di intasare la chat, la classifica è stata generata in <#${IDs.channels.commands}>.\n` +
      `[Clicca qui per vederla](${sent.url}).`,
    allowedMentions: { repliedUser: false },
  });
}

module.exports = {
  name: "top",
  allowEmptyArgs: true,
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
    const dayToken=Array.isArray(args)?args.find((x) => /^\d+d?$/i.test(String(x||"").trim())):null;

    const payload=await buildTopChannelPayload(message,dayToken||"14","main","overview",1,message.author?.id,);
    await sendTopPayload(message, payload);
  },
};