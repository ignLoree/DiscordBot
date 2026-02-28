const axios = require("axios");
const { EmbedBuilder } = require("discord.js");
const { leaveTtsGuild } = require("../TTS/ttsService");
const { resolvePlayableRadioUrl } = require("./radioService");
const {
  getVoiceSession,
  setVoiceSession,
  clearVoiceSession,
} = require("../Voice/voiceSessionService");

let Shoukaku = null;
let Connectors = null;
let LoadType = null;
let Constants = { State: { CONNECTED: "CONNECTED" } };
try {
  ({ Shoukaku, Connectors, LoadType, Constants } = require("shoukaku"));
} catch (_) {}

const queues = new Map();
const inactivityTimers = new Map();
const emptyVoiceTimers = new Map();
const DEFAULT_VOLUME = 5;
const INACTIVITY_MS = 3 * 60 * 1000;
const EMPTY_VOICE_MS = 3 * 60 * 1000;
const SEARCH_PREFIXES = [
  { prefix: "spsearch:", source: "spotify", bias: 16 },
  { prefix: "amsearch:", source: "apple", bias: 14 },
  { prefix: "dzsearch:", source: "deezer", bias: 15 },
];
const PLAYABLE_SOURCE_KEYS = new Set(["spotify", "apple", "deezer", "radio"]);
const DIRECT_URL_SOURCE_BY_MATCHER = [
  { fn: isSpotifyUrl, source: "spotify" },
  { fn: isAppleMusicUrl, source: "apple" },
  { fn: isDeezerUrl, source: "deezer" },
];

function logMusic(event, payload = {}) {
  const logger = global.logger;
  if (!logger?.info && !logger?.warn && !logger?.error) return;
  const parts = Object.entries(payload)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
  const line = `[MUSIC][${event}]${parts.length ? ` ${parts.join(" | ")}` : ""}`;
  if (logger.info) logger.info(line);
  else if (logger.warn) logger.warn(line);
}

function cleanQuery(value) {
  return String(value || "").trim().replace(/^<|>$/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDurationMs(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalizeSourceName(sourceName, uri = "") {
  const source = String(sourceName || "").toLowerCase();
  const url = String(uri || "").toLowerCase();
  if (source.includes("spotify") || /spotify\.com/.test(url)) return "spotify";
  if (source.includes("apple") || source.includes("applemusic") || /music\.apple\.com|itunes\.apple\.com/.test(url)) return "apple";
  if (source.includes("deezer") || /deezer\.com/.test(url)) return "deezer";
  if (source.includes("youtube") || /youtu\.be|youtube\.com/.test(url)) return "youtube";
  if (source.includes("soundcloud") || /soundcloud\.com/.test(url)) return "soundcloud";
  if (source.includes("http") || source.includes("local") || /^https?:\/\//i.test(url)) return "radio";
  return source || "unknown";
}

function isSpotifyUrl(value) {
  return /spotify\.com/i.test(String(value || ""));
}

function isAppleMusicUrl(value) {
  return /music\.apple\.com|itunes\.apple\.com/i.test(String(value || ""));
}

function isDeezerUrl(value) {
  return /deezer\.com/i.test(String(value || ""));
}

function isSoundCloudUrl(value) {
  return /soundcloud\.com/i.test(String(value || ""));
}

function isYouTubeVideoUrl(value) {
  const input = String(value || "");
  if (!/^https?:\/\//i.test(input)) return false;
  if (!/youtu\.be|youtube\.com/i.test(input)) return false;
  if (/[?&]list=/i.test(input) || /\/playlist/i.test(input)) return false;
  return /(?:watch\?v=|youtu\.be\/|\/shorts\/)/i.test(input);
}

function isLikelyPodcast(track) {
  const haystack = [track?.title, track?.author, track?.url]
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .join(" ");
  return /\b(podcast|episodio|episode|puntata|show|audiobook|audiolibro)\b/.test(haystack);
}

function toTrack(raw, requestedBy = null, extra = {}) {
  const info = raw?.info || {};
  const url = String(info.uri || extra.url || "");
  const source = extra.source || normalizeSourceName(info.sourceName, url);
  return {
    encoded: String(raw?.encoded || ""),
    identifier: String(info.identifier || ""),
    title: String(info.title || "Sconosciuto"),
    author: String(info.author || "Unknown"),
    url,
    thumbnail: info.artworkUrl || null,
    durationMS: Number(info.length || 0),
    duration: formatDurationMs(info.length || 0),
    isStream: Boolean(info.isStream),
    source,
    requestedBy: requestedBy?.user || requestedBy || null,
    metadata: {
      requestedAt: Date.now(),
      requestedById: String(requestedBy?.id || requestedBy?.user?.id || ""),
      resolverInput: String(extra.resolverInput || url || "").trim(),
      originalQuery: String(extra.originalQuery || "").trim(),
      station: extra.station || null,
    },
    resolverInput: String(extra.resolverInput || url || `${info.title || ""} ${info.author || ""}`.trim()).trim(),
  };
}

function scoreTrackCandidate(track, query) {
  const normalizedQuery = normalizeText(query);
  const title = normalizeText(track?.title);
  const author = normalizeText(track?.author);
  const combined = `${title} ${author}`.trim();
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  let score = 0;

  if (title === normalizedQuery) score += 140;
  if (combined === normalizedQuery) score += 180;
  if (combined.includes(normalizedQuery)) score += 55;
  if (title.includes(normalizedQuery)) score += 40;
  if (author && normalizedQuery.includes(author)) score += 25;

  let titleMatches = 0;
  let authorMatches = 0;
  for (const token of tokens) {
    if (title.includes(token)) titleMatches += 1;
    if (author.includes(token)) authorMatches += 1;
  }
  score += titleMatches * 14;
  score += authorMatches * 8;
  if (tokens.length > 1 && titleMatches + authorMatches === tokens.length) score += 25;

  if (isLikelyPodcast(track)) score -= 100;
  if (["remix", "live", "karaoke", "sped up", "nightcore"].some((term) => combined.includes(term) && !normalizedQuery.includes(term))) {
    score -= 15;
  }

  if (track.source === "spotify") score += 12;
  if (track.source === "apple") score += 10;
  if (track.source === "deezer") score += 11;
  return score;
}

function dedupeTracks(tracks = []) {
  const seen = new Map();
  for (const track of tracks) {
    const key = `${normalizeText(track?.title)}:${normalizeText(track?.author)}`;
    const current = seen.get(key);
    if (!current || Number(track.score || 0) > Number(current.score || 0)) {
      seen.set(key, track);
    }
  }
  return Array.from(seen.values());
}

function buildDirectUrlExpectedSource(input) {
  for (const entry of DIRECT_URL_SOURCE_BY_MATCHER) {
    if (entry.fn(input)) return entry.source;
  }
  return null;
}

function getConnectedNode(manager) {
  if (!manager?.nodes?.size) return null;
  return Array.from(manager.nodes.values()).find((node) => node.state === Constants.State.CONNECTED) || Array.from(manager.nodes.values())[0] || null;
}

async function fetchYouTubeOEmbed(url) {
  const response = await axios.get("https://www.youtube.com/oembed", {
    params: { url, format: "json" },
    timeout: 12000,
  }).catch(() => null);
  const data = response?.data;
  if (!data?.title) return null;
  return {
    title: String(data.title || "").trim(),
    author: String(data.author_name || "").trim(),
  };
}

async function fetchSoundCloudOEmbed(url) {
  const response = await axios.get("https://soundcloud.com/oembed", {
    params: { url, format: "json" },
    timeout: 12000,
  }).catch(() => null);
  const data = response?.data;
  if (!data?.title) return null;
  return {
    title: String(data.title || "").trim(),
    author: String(data.author_name || "").trim(),
  };
}

function cleanExternalTitle(title) {
  return String(title || "")
    .replace(/\[[^\]]*(official|video|audio|lyrics?|visualizer)[^\]]*\]/gi, " ")
    .replace(/\([^)]*(official|video|audio|lyrics?|visualizer)[^)]*\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let spotifyTokenCache = { accessToken: "", expiresAt: 0 };

function extractAppleSongId(url) {
  const match = String(url || "").match(/\/song\/[^/]+\/(\d+)/i);
  return match?.[1] || "";
}

function extractSpotifyUrlParts(url) {
  const match = String(url || "").match(/spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/i);
  return match ? { type: String(match[1]).toLowerCase(), id: String(match[2]) } : null;
}

async function getSpotifyAccessToken() {
  const now = Date.now();
  if (spotifyTokenCache.accessToken && spotifyTokenCache.expiresAt > now + 15_000) {
    return spotifyTokenCache.accessToken;
  }
  const clientId = String(process.env.SPOTIFY_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.SPOTIFY_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return "";
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    {
      timeout: 12_000,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  ).catch(() => null);
  const accessToken = String(response?.data?.access_token || "").trim();
  const expiresIn = Number(response?.data?.expires_in || 3600);
  if (!accessToken) return "";
  spotifyTokenCache = {
    accessToken,
    expiresAt: now + Math.max(60, expiresIn - 30) * 1000,
  };
  return accessToken;
}

async function fetchSpotifyTracksForQuery(query) {
  const accessToken = await getSpotifyAccessToken();
  if (!accessToken) return [];
  const response = await axios.get("https://api.spotify.com/v1/search", {
    timeout: 12_000,
    params: { q: query, type: "track", limit: 10, market: "IT" },
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  const items = Array.isArray(response?.data?.tracks?.items) ? response.data.tracks.items : [];
  return items.map((item) => ({
    title: String(item?.name || "").trim(),
    author: String(item?.artists?.[0]?.name || "").trim(),
    url: String(item?.external_urls?.spotify || "").trim(),
    thumbnail: item?.album?.images?.[0]?.url || null,
    durationMS: Number(item?.duration_ms || 0),
    source: "spotify",
  })).filter((item) => item.title && item.url);
}

async function fetchSpotifyMetadataFromUrl(url) {
  const accessToken = await getSpotifyAccessToken();
  const parts = extractSpotifyUrlParts(url);
  if (!accessToken || !parts?.id || !parts?.type) return null;
  const response = await axios.get(`https://api.spotify.com/v1/${parts.type}s/${parts.id}`, {
    timeout: 12_000,
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  const data = response?.data;
  if (!data) return null;
  if (parts.type === "track") {
    return {
      query: `${data?.name || ""} ${data?.artists?.[0]?.name || ""}`.trim(),
      source: "spotify",
    };
  }
  const firstTrack = Array.isArray(data?.tracks?.items)
    ? data.tracks.items.find((item) => item?.track?.name || item?.name)
    : null;
  const track = firstTrack?.track || firstTrack;
  if (!track?.name) return null;
  return {
    query: `${track?.name || ""} ${track?.artists?.[0]?.name || ""}`.trim(),
    source: "spotify",
  };
}

async function fetchAppleMetadataFromUrl(url) {
  const songId = extractAppleSongId(url);
  if (!songId) return null;
  const response = await axios.get("https://itunes.apple.com/lookup", {
    timeout: 12_000,
    params: { id: songId, entity: "song", country: "IT" },
  }).catch(() => null);
  const item = Array.isArray(response?.data?.results) ? response.data.results.find((row) => row?.wrapperType === "track") : null;
  if (!item?.trackName) return null;
  return {
    query: `${item.trackName || ""} ${item.artistName || ""}`.trim(),
    source: "apple",
  };
}

async function fetchDeezerCatalogSearch(query) {
  const response = await axios.get("https://api.deezer.com/search", {
    timeout: 12_000,
    params: { q: query, limit: 10 },
  }).catch(() => null);
  const items = Array.isArray(response?.data?.data) ? response.data.data : [];
  return items.map((item) => ({
    title: String(item?.title || "").trim(),
    author: String(item?.artist?.name || "").trim(),
    url: String(item?.link || "").trim(),
    thumbnail: item?.album?.cover_xl || item?.album?.cover_big || item?.album?.cover_medium || null,
    durationMS: Number(item?.duration || 0) * 1000,
    source: "deezer",
  })).filter((item) => item.title && item.url);
}

async function fetchAppleTracksForQuery(query) {
  const response = await axios.get("https://itunes.apple.com/search", {
    timeout: 12_000,
    params: { term: query, entity: "song", country: "IT", limit: 10 },
  }).catch(() => null);
  const items = Array.isArray(response?.data?.results) ? response.data.results : [];
  return items.map((item) => ({
    title: String(item?.trackName || "").trim(),
    author: String(item?.artistName || "").trim(),
    url: String(item?.trackViewUrl || item?.collectionViewUrl || "").trim(),
    thumbnail: item?.artworkUrl100 || item?.artworkUrl60 || null,
    durationMS: Number(item?.trackTimeMillis || 0),
    source: "apple",
  })).filter((item) => item.title && item.url);
}

async function resolveExternalCandidates(manager, candidates, requestedBy, originalQuery) {
  const resolved = [];
  for (const candidate of candidates.slice(0, 12)) {
    const result = await resolveIdentifier(manager, candidate.url).catch(() => null);
    const parsed = tracksFromLavalinkResponse(result, requestedBy, {
      resolverInput: candidate.url,
      originalQuery,
      source: candidate.source,
      url: candidate.url,
    }).tracks;
    const track = parsed.find((item) => PLAYABLE_SOURCE_KEYS.has(item.source) && !isLikelyPodcast(item));
    if (!track) continue;
    track.score = scoreTrackCandidate(track, originalQuery) + scoreTrackCandidate(candidate, originalQuery);
    resolved.push(track);
  }
  return dedupeTracks(resolved).sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}

async function runExternalCatalogSearch(manager, query, requestedBy) {
  const [deezerTracks, appleTracks, spotifyTracks] = await Promise.all([
    fetchDeezerCatalogSearch(query),
    fetchAppleTracksForQuery(query),
    fetchSpotifyTracksForQuery(query),
  ]);
  const candidates = dedupeTracks(
    [...deezerTracks, ...appleTracks, ...spotifyTracks]
      .filter((track) => !isLikelyPodcast(track))
      .map((track) => ({ ...track, score: scoreTrackCandidate(track, query) })),
  ).sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  if (!candidates.length) return [];
  const resolved = await resolveExternalCandidates(manager, candidates, requestedBy, query);
  logMusic("search_external_catalog", {
    query,
    candidateCount: candidates.length,
    resolvedCount: resolved.length,
    top: resolved.slice(0, 5).map((item) => ({
      title: item.title,
      author: item.author,
      source: item.source,
      score: item.score,
    })),
  });
  return resolved;
}

async function resolveIdentifier(manager, identifier) {
  const node = getConnectedNode(manager);
  if (!node) throw new Error("No Lavalink node available");
  return node.rest.resolve(identifier);
}

function tracksFromLavalinkResponse(result, requestedBy, extra = {}) {
  if (!result) return { tracks: [], playlist: null };
  if (result.loadType === LoadType.TRACK && result.data) {
    return { tracks: [toTrack(result.data, requestedBy, extra)], playlist: null };
  }
  if (result.loadType === LoadType.PLAYLIST && result.data) {
    return {
      tracks: Array.isArray(result.data.tracks)
        ? result.data.tracks.map((item) => toTrack(item, requestedBy, extra))
        : [],
      playlist: {
        title: String(result.data.info?.name || "Playlist"),
        tracks: Array.isArray(result.data.tracks) ? result.data.tracks : [],
      },
    };
  }
  if (result.loadType === LoadType.SEARCH && Array.isArray(result.data)) {
    return {
      tracks: result.data.map((item) => toTrack(item, requestedBy, extra)),
      playlist: null,
    };
  }
  return { tracks: [], playlist: null };
}

async function convertUnsupportedUrlToQuery(input) {
  if (isYouTubeVideoUrl(input)) {
    const meta = await fetchYouTubeOEmbed(input);
    if (!meta?.title) return null;
    return {
      convertedQuery: cleanExternalTitle(`${meta.title} ${meta.author || ""}`),
      source: "youtube",
    };
  }
  if (isSoundCloudUrl(input)) {
    const meta = await fetchSoundCloudOEmbed(input);
    if (!meta?.title) return null;
    return {
      convertedQuery: cleanExternalTitle(`${meta.title} ${meta.author || ""}`),
      source: "soundcloud",
    };
  }
  return null;
}

async function runCatalogSearch(manager, query, requestedBy) {
  const candidates = [];
  for (const entry of SEARCH_PREFIXES) {
    const result = await resolveIdentifier(manager, `${entry.prefix}${query}`).catch(() => null);
    const tracks = tracksFromLavalinkResponse(result, requestedBy, {
      resolverInput: `${entry.prefix}${query}`,
      originalQuery: query,
    }).tracks;
    for (const track of tracks) {
      if (!PLAYABLE_SOURCE_KEYS.has(track.source)) continue;
      if (isLikelyPodcast(track)) continue;
      track.score = scoreTrackCandidate(track, query) + Number(entry.bias || 0);
      candidates.push(track);
    }
  }
  return dedupeTracks(candidates).sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}

function parseLyricsPayload(item) {
  const plainLyrics = String(
    item?.plainLyrics || item?.syncedLyrics || item?.lyrics || "",
  ).trim();
  if (!plainLyrics) return null;
  return {
    trackName: String(item?.trackName || item?.name || "Unknown"),
    artistName: String(item?.artistName || item?.artist || "Unknown"),
    plainLyrics,
  };
}

async function searchLyrics(query) {
  const normalizedQuery = cleanQuery(query);
  if (!normalizedQuery) return [];
  const response = await axios.get("https://lrclib.net/api/search", {
    timeout: 12_000,
    params: { q: normalizedQuery },
    headers: { "User-Agent": "ViniliCaffeBot/1.0" },
  }).catch(() => null);
  const rows = Array.isArray(response?.data) ? response.data : [];
  return rows.map(parseLyricsPayload).filter(Boolean).slice(0, 50);
}

function buildManagerFacade(client, manager) {
  return {
    manager,
    nodes: {
      get(guildId) {
        return queues.get(String(guildId || "")) || null;
      },
    },
    lyrics: {
      async search(payload = {}) {
        return searchLyrics(payload?.q || "");
      },
    },
  };
}

function clearTimer(map, guildId) {
  const key = String(guildId || "");
  const timer = map.get(key);
  if (timer) clearTimeout(timer);
  map.delete(key);
}

async function sendQueueNotice(queue, content) {
  const channel = queue?.metadata?.channel;
  if (!channel?.isTextBased?.()) return;
  const embed = new EmbedBuilder().setColor("#ED4245").setDescription(String(content || ""));
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function scheduleInactivityLeave(queue) {
  const guildId = String(queue?.guildId || "");
  if (!guildId) return;
  clearTimer(inactivityTimers, guildId);
  const timer = setTimeout(async () => {
    const current = queues.get(guildId);
    if (!current) return;
    if (current.currentTrack) return;
    if (current.tracks.length > 0) return;
    const embed = new EmbedBuilder()
      .setColor("#ED4245")
      .setDescription("No tracks have been playing for the past 3 minutes, leaving \uD83D\uDC4B");
    const channel = current.metadata?.channel;
    if (channel?.isTextBased?.()) await channel.send({ embeds: [embed] }).catch(() => {});
    await destroyQueue(guildId, { manual: true });
  }, INACTIVITY_MS);
  inactivityTimers.set(guildId, timer);
}

async function scheduleEmptyVoiceLeave(queue) {
  const guildId = String(queue?.guildId || "");
  if (!guildId) return;
  clearTimer(emptyVoiceTimers, guildId);
  const timer = setTimeout(async () => {
    const current = queues.get(guildId);
    if (!current) return;
    const guild = current.guild;
    const channel = guild?.channels?.cache?.get(current.voiceChannelId) || (current.voiceChannelId ? await guild?.channels?.fetch?.(current.voiceChannelId).catch(() => null) : null);
    const humans = channel?.members ? Array.from(channel.members.values()).filter((m) => !m.user?.bot) : [];
    if (humans.length > 0) return;
    const embed = new EmbedBuilder()
      .setColor("#ED4245")
      .setDescription("No one has been listening for the past 3 minutes, leaving \uD83D\uDC4B");
    if (current.metadata?.channel?.isTextBased?.()) {
      await current.metadata.channel.send({ embeds: [embed] }).catch(() => {});
    }
    await destroyQueue(guildId, { manual: true });
  }, EMPTY_VOICE_MS);
  emptyVoiceTimers.set(guildId, timer);
}

function buildNodeFacade(queue) {
  return {
    isPlaying: () => Boolean(queue.currentTrack && !queue.paused),
    getTimestamp: () => {
      const current = Math.max(0, Number(queue.positionMs || 0));
      const total = Math.max(0, Number(queue.currentTrack?.durationMS || 0));
      return {
        current: { value: current, label: formatDurationMs(current) },
        total: { value: total, label: formatDurationMs(total) },
      };
    },
    setVolume: async (value) => {
      queue.volume = Math.max(0, Math.min(1000, Number(value || DEFAULT_VOLUME)));
      if (queue.player) await queue.player.setGlobalVolume(queue.volume).catch(() => {});
    },
    play: async (track) => playTrack(queue, track),
    streamTime: Number(queue.positionMs || 0),
  };
}

async function playTrack(queue, track) {
  clearTimer(inactivityTimers, queue.guildId);
  clearTimer(emptyVoiceTimers, queue.guildId);
  queue.currentTrack = track;
  queue.positionMs = 0;
  queue.startedAt = Date.now();
  queue.paused = false;
  await queue.player.setGlobalVolume(queue.volume).catch(() => {});
  await queue.player.playTrack({
    track: {
      encoded: track.encoded,
      userData: {
        title: track.title,
        author: track.author,
        url: track.url,
        source: track.source,
      },
    },
  }, false);
}

async function playNext(queue) {
  if (!queue) return;
  if (queue.tracks.length > 0) {
    const next = queue.tracks.shift();
    await playTrack(queue, next);
    return;
  }
  queue.currentTrack = null;
  queue.positionMs = 0;
  await sendQueueNotice(queue, "There are no more tracks");
  await scheduleInactivityLeave(queue);
}

function attachPlayerEvents(queue) {
  if (queue.eventsAttached) return;
  queue.eventsAttached = true;
  queue.player.on("start", () => {
    queue.startedAt = Date.now();
    queue.positionMs = 0;
    queue.paused = false;
    clearTimer(inactivityTimers, queue.guildId);
    clearTimer(emptyVoiceTimers, queue.guildId);
    logMusic("player_start", { guildId: queue.guildId, track: queue.currentTrack?.title, source: queue.currentTrack?.source });
  });
  queue.player.on("update", (data) => {
    queue.positionMs = Number(data?.state?.position || 0);
  });
  queue.player.on("end", async (data) => {
    const reason = String(data?.reason || "");
    logMusic("player_end", { guildId: queue.guildId, reason, track: queue.currentTrack?.title });
    if (reason === "replaced") return;
    if (reason === "stopped" && queue.manualDisconnect) return;
    await playNext(queue).catch((error) => {
      global.logger?.error?.("[MUSIC] playNext failed:", error?.message || error);
    });
  });
  queue.player.on("exception", async (data) => {
    global.logger?.error?.("[MUSIC] player exception:", queue.guildId, data?.exception?.message || data);
    await playNext(queue).catch(() => {});
  });
  queue.player.on("stuck", async () => {
    global.logger?.warn?.("[MUSIC] player stuck:", queue.guildId, queue.currentTrack?.title || "unknown");
    await playNext(queue).catch(() => {});
  });
  queue.player.on("closed", async () => {
    const guildId = String(queue.guildId || "");
    const current = queues.get(guildId);
    if (!current) return;
    queues.delete(guildId);
    clearTimer(inactivityTimers, guildId);
    clearTimer(emptyVoiceTimers, guildId);
    clearVoiceSession(guildId);
    if (!current.manualDisconnect) {
      await sendQueueNotice(current, "I have been kicked from the voice channel \u2639\uFE0F");
    }
  });
}

async function ensureQueue(client, guild, channel, voiceChannel) {
  const guildId = String(guild?.id || "");
  let queue = queues.get(guildId) || null;
  const manager = client.musicPlayer?.manager || (await getPlayer(client)).manager;
  if (!queue) {
    const player = await manager.joinVoiceChannel({
      guildId,
      channelId: String(voiceChannel.id),
      shardId: Number(guild?.shardId || 0),
      deaf: true,
      mute: false,
    });
    queue = {
      guildId,
      guild,
      player,
      metadata: { channel },
      voiceChannelId: String(voiceChannel.id),
      tracks: [],
      currentTrack: null,
      startedAt: 0,
      positionMs: 0,
      paused: false,
      volume: DEFAULT_VOLUME,
      manualDisconnect: false,
      eventsAttached: false,
    };
    queue.node = buildNodeFacade(queue);
    queue.clear = () => {
      queue.tracks = [];
    };
    queue.delete = () => destroyQueue(guildId, { manual: true });
    queue.connection = { channelId: queue.voiceChannelId };
    queues.set(guildId, queue);
    attachPlayerEvents(queue);
  }
  queue.guild = guild;
  queue.metadata = { ...(queue.metadata || {}), channel };
  queue.voiceChannelId = String(voiceChannel.id);
  queue.connection = { channelId: queue.voiceChannelId };
  return queue;
}

async function destroyQueue(guildId, { manual = false } = {}) {
  const key = String(guildId || "");
  const queue = queues.get(key);
  clearTimer(inactivityTimers, key);
  clearTimer(emptyVoiceTimers, key);
  clearVoiceSession(key);
  if (!queue) return false;
  queues.delete(key);
  queue.manualDisconnect = Boolean(manual);
  queue.tracks = [];
  queue.currentTrack = null;
  await queue.player.destroy().catch(() => {});
  return true;
}

async function getPlayer(client) {
  if (client.musicPlayer?.manager) return client.musicPlayer;
  if (!Shoukaku || !Connectors || !LoadType) {
    throw new Error("Shoukaku is not installed");
  }

  const host = String(process.env.LAVALINK_HOST || "127.0.0.1:2333").trim();
  const auth = String(process.env.LAVALINK_PASSWORD || "youshallnotpass").trim();
  const secure = ["1", "true", "yes", "on"].includes(String(process.env.LAVALINK_SECURE || "").toLowerCase());
  const name = String(process.env.LAVALINK_NAME || "main").trim() || "main";
  const manager = new Shoukaku(
    new Connectors.DiscordJS(client),
    [{ name, url: host, auth, secure }],
    {
      resume: true,
      resumeTimeout: 30,
      reconnectTries: 5,
      reconnectInterval: 5,
      restTimeout: 60,
      voiceConnectionTimeout: 15,
    },
  );

  manager.on("ready", (nodeName) => {
    logMusic("node_ready", { node: nodeName, host });
  });
  manager.on("error", (nodeName, error) => {
    global.logger?.error?.("[MUSIC] lavalink node error:", nodeName, error?.message || error);
  });
  manager.on("close", (nodeName, code, reason) => {
    global.logger?.warn?.("[MUSIC] lavalink node close:", nodeName, code, reason);
  });

  client.musicPlayer = buildManagerFacade(client, manager);
  return client.musicPlayer;
}

async function searchPlayable({ client, input, requestedBy }) {
  const player = await getPlayer(client);
  const manager = player.manager;
  let query = cleanQuery(input);
  if (!query) return { ok: false, reason: "empty_query" };

  if (isYouTubeVideoUrl(query) || isSoundCloudUrl(query)) {
    const converted = await convertUnsupportedUrlToQuery(query);
    if (!converted?.convertedQuery) {
      return {
        ok: false,
        reason: isSoundCloudUrl(query) ? "blocked_source" : "youtube_not_supported",
        source: isSoundCloudUrl(query) ? "soundcloud" : "youtube",
      };
    }
    query = converted.convertedQuery;
    const tracks = await runCatalogSearch(manager, query, requestedBy);
    if (!tracks.length) {
      return {
        ok: false,
        reason: converted.source === "soundcloud" ? "blocked_source" : "youtube_not_supported",
        source: converted.source,
      };
    }
    return {
      ok: true,
      player,
      resolved: { query, translated: true, youtubeConvertible: converted.source === "youtube" },
      searchResult: { tracks, playlist: null },
    };
  }

  if (isSpotifyUrl(query) || isAppleMusicUrl(query) || isDeezerUrl(query) || /^https?:\/\//i.test(query)) {
    const direct = await resolveIdentifier(manager, query).catch(() => null);
    const parsed = tracksFromLavalinkResponse(direct, requestedBy, {
      resolverInput: query,
      originalQuery: input,
    });
    const filtered = parsed.playlist
      ? parsed.tracks.filter((track) => PLAYABLE_SOURCE_KEYS.has(track.source) || track.source === "radio")
      : parsed.tracks.filter((track) => PLAYABLE_SOURCE_KEYS.has(track.source) || track.source === "radio");
    const expectedSource = buildDirectUrlExpectedSource(query);
    const playableTracks = expectedSource
      ? filtered.filter((track) => track.source === expectedSource)
      : filtered;
    if (playableTracks.length > 0) {
      return {
        ok: true,
        player,
        resolved: { query, translated: false, youtubeConvertible: false },
        searchResult: { tracks: playableTracks, playlist: parsed.playlist },
      };
    }
    const directFallbackMeta = isSpotifyUrl(query)
      ? await fetchSpotifyMetadataFromUrl(query)
      : isAppleMusicUrl(query)
        ? await fetchAppleMetadataFromUrl(query)
        : null;
    if (directFallbackMeta?.query) {
      const fallbackTracks = await runExternalCatalogSearch(manager, directFallbackMeta.query, requestedBy);
      if (fallbackTracks.length > 0) {
        return {
          ok: true,
          player,
          resolved: { query: directFallbackMeta.query, translated: true, youtubeConvertible: false },
          searchResult: { tracks: fallbackTracks, playlist: null },
        };
      }
    }
    return { ok: false, reason: "not_found" };
  }

  let tracks = await runCatalogSearch(manager, query, requestedBy);
  if (!tracks.length) {
    tracks = await runExternalCatalogSearch(manager, query, requestedBy);
  }
  if (!tracks.length) return { ok: false, reason: "not_found" };
  return {
    ok: true,
    player,
    resolved: { query, translated: false, youtubeConvertible: false },
    searchResult: { tracks, playlist: null },
  };
}

async function playRequest({
  client,
  guild,
  channel,
  voiceChannel,
  requestedBy,
  input,
  preResolved = null,
  preSearchResult = null,
}) {
  const searchResult = preSearchResult || (await searchPlayable({ client, input, requestedBy })).searchResult;
  if (!searchResult?.tracks?.length) return { ok: false, reason: "not_found" };

  const currentSession = getVoiceSession(guild?.id);
  if (currentSession?.mode === "tts") {
    await leaveTtsGuild(guild?.id, client).catch(() => null);
  }

  const queue = await ensureQueue(client, guild, channel, voiceChannel);
  setVoiceSession(guild?.id, { mode: "music", channelId: voiceChannel?.id });
  queue.manualDisconnect = false;

  const firstTrack = searchResult.tracks[0] || null;
  if (!firstTrack) return { ok: false, reason: "not_found" };

  if (!queue.currentTrack) {
    if (searchResult.playlist && searchResult.tracks.length > 1) {
      queue.tracks.push(...searchResult.tracks.slice(1));
    }
    await playTrack(queue, firstTrack);
    return {
      ok: true,
      mode: "started",
      track: firstTrack,
      playlist: searchResult.playlist,
      translated: Boolean(preResolved?.translated),
    };
  }

  if (searchResult.playlist) {
    queue.tracks.push(...searchResult.tracks);
  } else {
    queue.tracks.push(firstTrack);
  }

  const queuePosition = Math.max(1, queue.tracks.length);
  const currentRemaining = Math.max(0, Number(queue.currentTrack?.durationMS || 0) - Number(queue.positionMs || 0));
  const etaMs = currentRemaining + queue.tracks.slice(0, queuePosition - 1).reduce((sum, item) => sum + Number(item?.durationMS || 0), 0);
  return {
    ok: true,
    mode: "queued",
    track: firstTrack,
    playlist: searchResult.playlist,
    translated: Boolean(preResolved?.translated),
    queue,
    queueTrackCount: queue.tracks.length,
    queueTotalCount: queue.tracks.length + (queue.currentTrack ? 1 : 0),
    queuePosition,
    etaMs,
  };
}

async function touchMusicOutputChannel(client, guildId, channel) {
  const queue = queues.get(String(guildId || ""));
  if (!queue || !channel) return false;
  queue.metadata = { ...(queue.metadata || {}), channel };
  return true;
}

async function playRadioStation({ client, guild, channel, voiceChannel, station }) {
  const player = await getPlayer(client);
  const manager = player.manager;
  const playableUrl = await resolvePlayableRadioUrl(station.streamUrl).catch(() => "");
  const targetUrl = playableUrl || String(station.streamUrl || "").trim();
  const result = await resolveIdentifier(manager, targetUrl).catch(() => null);
  const parsed = tracksFromLavalinkResponse(result, null, {
    resolverInput: targetUrl,
    originalQuery: station.name,
    source: "radio",
    station,
    url: targetUrl,
  });
  const track = parsed.tracks[0] || null;
  if (!track) return { ok: false, reason: "not_found" };

  const currentSession = getVoiceSession(guild?.id);
  if (currentSession?.mode === "tts") {
    await leaveTtsGuild(guild?.id, client).catch(() => null);
  }

  const queue = await ensureQueue(client, guild, channel, voiceChannel);
  queue.tracks = [];
  setVoiceSession(guild?.id, { mode: "music", channelId: voiceChannel?.id });
  await playTrack(queue, track);
  return { ok: true, track, queue };
}

function getQueue(guildId) {
  return queues.get(String(guildId || "")) || null;
}

async function handleMusicVoiceStateUpdate(oldState, newState, client) {
  const guild = newState?.guild || oldState?.guild;
  if (!guild?.id || !client?.user?.id) return;
  const queue = queues.get(String(guild.id));
  if (!queue) return;
  const botMember = guild.members?.me || guild.members?.cache?.get(client.user.id);
  const botChannel = botMember?.voice?.channel;
  if (!botChannel || String(botChannel.id) !== String(queue.voiceChannelId)) return;
  const humans = Array.from(botChannel.members.values()).filter((member) => !member.user?.bot);
  if (humans.length === 0) {
    await scheduleEmptyVoiceLeave(queue);
  } else {
    clearTimer(emptyVoiceTimers, guild.id);
  }
}

module.exports = {
  getPlayer,
  getQueue,
  searchPlayable,
  searchLyrics,
  playRequest,
  playRadioStation,
  touchMusicOutputChannel,
  destroyQueue,
  handleMusicVoiceStateUpdate,
};
