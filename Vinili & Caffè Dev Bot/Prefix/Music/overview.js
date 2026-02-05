const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { lastFmRequest, buildUserUrl } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { buildOverviewEmbed, buildOverviewComponents, buildOverviewV2Components } = require("../../Utils/Music/overviewView");

function formatDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTrackKey(artist, title) {
  return `${String(artist || "").toLowerCase()}||${String(title || "").toLowerCase()}`;
}

const MAX_DAYS = 8;

async function fetchTrackInfoMap(tracks, concurrency = 4) {
  const unique = new Map();
  tracks.forEach(track => {
    const artist = track.artist?.["#text"] || track.artist?.name || track.artist || "";
    const title = track.name || "";
    const key = getTrackKey(artist, title);
    if (!unique.has(key)) {
      unique.set(key, { artist, title });
    }
  });
  const entries = Array.from(unique.values());
  const results = new Map();
  let index = 0;
  async function worker() {
    while (index < entries.length) {
      const current = index;
      index += 1;
      const entry = entries[current];
      try {
        const info = await lastFmRequest("track.getInfo", {
          artist: entry.artist,
          track: entry.title
        });
        const duration = Number(info?.track?.duration || 0);
        const tags = (info?.track?.toptags?.tag || [])
          .map(tag => tag?.name)
          .filter(Boolean)
          .slice(0, 3);
        results.set(getTrackKey(entry.artist, entry.title), { duration, tags });
      } catch {
        results.set(getTrackKey(entry.artist, entry.title), { duration: 0, tags: [] });
      }
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, entries.length); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

function buildDaySummaries(tracks, infoMap) {
  const dayMap = new Map();
  const uniqueTracks = new Set();
  tracks.forEach(track => {
    const artist = track.artist?.["#text"] || track.artist?.name || track.artist || "";
    const title = track.name || "";
    const album = track.album?.["#text"] || track.album?.name || track.album || "Senza album";
    const key = getTrackKey(artist, title);
    uniqueTracks.add(key);
    const uts = track?.date?.uts;
    if (!uts) return;
    const date = new Date(Number(uts) * 1000);
    if (Number.isNaN(date.getTime())) return;
    const dayKey = formatDateKey(date);
    if (!dayMap.has(dayKey)) {
      dayMap.set(dayKey, {
        key: dayKey,
        date: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
        plays: 0,
        durationMs: 0,
        tracks: new Map(),
        albums: new Map(),
        artists: new Map(),
        tagCounts: new Map()
      });
    }
    const day = dayMap.get(dayKey);
    day.plays += 1;
    const info = infoMap.get(key);
    if (info?.duration) day.durationMs += info.duration;
    const trackEntry = day.tracks.get(key) || { artist, title, plays: 0 };
    trackEntry.plays += 1;
    day.tracks.set(key, trackEntry);
    const artistEntry = day.artists.get(artist) || { artist, plays: 0 };
    artistEntry.plays += 1;
    day.artists.set(artist, artistEntry);
    const albumKey = `${artist}||${album}`.toLowerCase();
    const albumEntry = day.albums.get(albumKey) || { artist, album, plays: 0 };
    albumEntry.plays += 1;
    day.albums.set(albumKey, albumEntry);
    if (info?.tags?.length) {
      info.tags.forEach(tag => {
        day.tagCounts.set(tag, (day.tagCounts.get(tag) || 0) + 1);
      });
    }
  });

  const dayList = Array.from(dayMap.values())
    .sort((a, b) => b.date - a.date)
    .map(day => {
      const topArtist = Array.from(day.artists.values())
        .sort((a, b) => b.plays - a.plays)[0] || null;
      const topAlbum = Array.from(day.albums.values())
        .sort((a, b) => b.plays - a.plays)[0] || null;
      const topTrack = Array.from(day.tracks.values())
        .sort((a, b) => b.plays - a.plays)[0] || null;
      const tags = Array.from(day.tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag]) => tag);
      return {
        date: day.date,
        plays: day.plays,
        durationMs: day.durationMs,
        topArtist,
        topAlbum,
        topTrack,
        tags
      };
    });
  return { dayList, uniqueTracksCount: uniqueTracks.size };
}

function paginateDays(dayList, page, perPage) {
  const totalPages = Math.max(1, Math.ceil(dayList.length / perPage));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const start = (safePage - 1) * perPage;
  const days = dayList.slice(start, start + perPage);
  return { days, page: safePage, totalPages };
}

async function fetchRecentTracks(username, maxPages = 5, limit = 200) {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await lastFmRequest("user.getrecenttracks", {
      user: username,
      limit,
      page
    });
    const tracks = data?.recenttracks?.track || [];
    const pageList = Array.isArray(tracks) ? tracks : [tracks];
    if (!pageList.length) break;
    all.push(...pageList);
    const attr = data?.recenttracks?.["@attr"] || {};
    const totalPages = Number(attr.totalPages || page);
    if (page >= totalPages) break;
  }
  const seen = new Set();
  const deduped = [];
  for (const track of all) {
    const artist = track.artist?.["#text"] || track.artist?.name || track.artist || "";
    const title = track.name || "";
    const album = track.album?.["#text"] || track.album?.name || track.album || "";
    const uts = track?.date?.uts || "np";
    const key = `${uts}||${artist}||${title}||${album}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(track);
  }
  return deduped;
}

async function enrichMissingTags(dayList) {
  await Promise.all(dayList.map(async (day) => {
    if (day.tags?.length || !day.topArtist?.artist) return;
    try {
      const data = await lastFmRequest("artist.getTopTags", {
        artist: day.topArtist.artist
      });
      const tags = (data?.toptags?.tag || [])
        .map(tag => tag?.name)
        .filter(Boolean)
        .slice(0, 3);
      if (tags.length) day.tags = tags;
    } catch {
      return;
    }
  }));
}
async function buildOverviewState(user, displayName) {
  const recent = await fetchRecentTracks(user.lastFmUsername, 5, 200);
  const infoMap = await fetchTrackInfoMap(recent, 4);
  const { dayList, uniqueTracksCount } = buildDaySummaries(recent, infoMap);
  const limitedDayList = dayList.slice(0, MAX_DAYS);
  await enrichMissingTags(limitedDayList);
  const totalPlays = limitedDayList.reduce((sum, day) => sum + day.plays, 0);
  const avgPlays = limitedDayList.length ? totalPlays / limitedDayList.length : 0;
  return {
    displayName,
    lastFmUsername: user.lastFmUsername,
    dayList: limitedDayList,
    uniqueTracksCount,
    totalPlays,
    avgPlays,
    perPage: 4,
    page: 1,
    expiresAt: Date.now() + 30 * 60 * 1000
  };
}

module.exports = {
  skipPrefix: false,
  name: "overview",
  aliases: ["o"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, lastfm } = extractTargetUserWithLastfm(message, args);
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;
    const member = message.guild?.members.cache.get(target.id);
    const displayName = member?.displayName || member?.user?.username || target.username;
    const profileUrl = buildUserUrl(user.lastFmUsername);

    try {
      const state = await buildOverviewState(user, displayName);
      const { days, page, totalPages } = paginateDays(state.dayList, 1, state.perPage);
      state.totalPages = totalPages;
      const useV2 = typeof buildOverviewV2Components === "function" && MessageFlags?.IsComponentsV2;
      let sent;
      if (useV2) {
        const components = buildOverviewV2Components({
          displayName,
          profileUrl,
          days,
          page,
          totalPages,
          totalPlays: state.totalPlays,
          uniqueTracks: state.uniqueTracksCount,
          avgPlays: state.avgPlays,
          numberFormat: user.localization?.numberFormat,
          messageId: "pending"
        });
        sent = await safeChannelSend(message.channel, { flags: MessageFlags.IsComponentsV2, components });
      } else {
        const embed = buildOverviewEmbed({
          displayName,
          profileUrl,
          days,
          page,
          totalPages,
          totalPlays: state.totalPlays,
          uniqueTracks: state.uniqueTracksCount,
          avgPlays: state.avgPlays,
          numberFormat: user.localization?.numberFormat
        });
        sent = await safeChannelSend(message.channel, { embeds: [embed], components: [] });
      }
      if (!message.client.overviewStates) {
        message.client.overviewStates = new Map();
      }
      message.client.overviewStates.set(sent.id, {
        ...state,
        totalPages,
        page,
        messageId: sent.id,
        userId: message.author.id,
        numberFormat: user.localization?.numberFormat,
        v2: useV2
      });
      if (useV2) {
        const newComponents = buildOverviewV2Components({
          displayName,
          profileUrl,
          days,
          page,
          totalPages,
          totalPlays: state.totalPlays,
          uniqueTracks: state.uniqueTracksCount,
          avgPlays: state.avgPlays,
          numberFormat: user.localization?.numberFormat,
          messageId: sent.id
        });
        await sent.edit({ flags: MessageFlags.IsComponentsV2, components: newComponents });
      } else {
        const components = buildOverviewComponents({
          page,
          totalPages,
          messageId: sent.id
        });
        if (components.length) await sent.edit({ components });
      }
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante la panoramica.")
        ]
      });
    }
  }
};

module.exports.buildOverviewState = buildOverviewState;
module.exports.paginateDays = paginateDays;

