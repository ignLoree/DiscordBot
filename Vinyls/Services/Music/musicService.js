const axios = require("axios");
const { EmbedBuilder } = require("discord.js");
const { leaveTtsGuild, setTtsLockedChannel } = require("../TTS/ttsService");
const { resolvePlayableRadioUrl } = require("./radioService");
const { getVoiceSession, setVoiceSession, clearVoiceSession, } = require("../Voice/voiceSessionService");

let Shoukaku = null;
let Connectors = null;
let LoadType = null;
let Constants = { State: { CONNECTED: "CONNECTED" } };
try {
  ({ Shoukaku, Connectors, LoadType, Constants } = require("shoukaku"));
} catch (err) {
  global.logger?.warn?.("[musicService] shoukaku optional load:", err?.message || err);
}

const queues = new Map();
const inactivityTimers = new Map();
const emptyVoiceTimers = new Map();
let lastLavalinkNullLogAt = 0;
const LAVALINK_NULL_LOG_THROTTLE_MS = 15_000;
const DEFAULT_VOLUME = 5;
const INACTIVITY_MS = 3 * 60 * 1000;
const EMPTY_VOICE_MS = 3 * 60 * 1000;
const PLAYABLE_SOURCE_KEYS = new Set(["youtube", "radio"]);
const DIRECT_URL_SOURCE_BY_MATCHER = [
  { fn: (u) => /youtu\.be|youtube\.com/i.test(String(u || "")), source: "youtube" },
  { fn: (u) => /^https?:\/\//i.test(String(u || "")), source: "radio" },
];

function logMusic(event, payload = {}) {
  if (["0", "false", "off"].includes(String(process.env.MUSIC_LOGS || "").toLowerCase())) return;
  const logger = global.logger;
  if (!logger?.info && !logger?.warn && !logger?.error) return;
  const parts = Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
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
  const haystack = [track?.title, track?.author, track?.url].map((item) => normalizeText(item)).filter(Boolean).join(" ");
  return /\b(podcast|episodio|episode|puntata|show|audiobook|audiolibro)\b/.test(haystack);
}

function toTrack(raw, requestedBy = null, extra = {}) {
  const info = raw?.info || {};
  const url = String(info.uri || extra.url || "");
  const source = extra.source || normalizeSourceName(info.sourceName, url);
  const encoded = String(raw?.encoded || raw?.track || "").trim();
  return {
    encoded,
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

  if (track.source === "youtube") score += 14;
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

function normalizeLoadTypeValue(loadType) {
  const raw = String(loadType || "").trim();
  if (!raw) return "";
  const compact = raw.toLowerCase().replace(/[\s_-]/g, "");
  if (compact === "track" || compact === "trackloaded") return "track";
  if (compact === "playlist" || compact === "playlistloaded") return "playlist";
  if (compact === "search" || compact === "searchresult" || compact === "searchresults") return "search";
  if (compact === "empty" || compact === "nomatches") return "empty";
  if (compact === "error" || compact === "loadfailed") return "error";
  return compact;
}

function getConnectedNode(manager) {
  if (!manager?.nodes?.size) return null;
  return Array.from(manager.nodes.values()).find((node) => node.state === Constants.State.CONNECTED) || Array.from(manager.nodes.values())[0] || null;
}

function waitForNodeReady(manager, timeoutMs = 20000) {
  const node = getConnectedNode(manager);
  if (node && node.state === Constants.State.CONNECTED) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Lavalink node connection timeout")), timeoutMs);
    manager.once("ready", () => {
      clearTimeout(t);
      resolve();
    });
    manager.once("error", (_, err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

function cleanExternalTitle(title) {
  return String(title || "")
    .replace(/\[[^\]]*(official|video|audio|lyrics?|visualizer)[^\]]*\]/gi, " ")
    .replace(/\([^)]*(official|video|audio|lyrics?|visualizer)[^)]*\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDeezerUrlParts(url) {
  const match = String(url || "").match(/deezer\.com\/(?:[a-z]+\/)?(track|album|playlist)\/(\d+)/i);
  return match ? { type: String(match[1]).toLowerCase(), id: String(match[2]) } : null;
}

async function fetchSpotifyOembedQuery(url) {
  const r = await axios.get("https://open.spotify.com/oembed", { timeout: 10_000, params: { url: String(url || "").trim() } }).catch(() => null);
  const t = String(r?.data?.title || "").trim();
  return t || null;
}

async function fetchDeezerMetadataFromUrl(url) {
  const parts = extractDeezerUrlParts(url);
  if (!parts?.id) return null;
  const base = "https://api.deezer.com";
  if (parts.type === "track") {
    const response = await axios.get(`${base}/track/${parts.id}`, { timeout: 12_000 }).catch(() => null);
    const item = response?.data;
    if (!item?.title) return null;
    return {
      query: `${item.title || ""} ${item.artist?.name || ""}`.trim(),
      source: "deezer",
    };
  }
  if (parts.type === "album") {
    const response = await axios.get(`${base}/album/${parts.id}`, { timeout: 12_000 }).catch(() => null);
    const data = response?.data;
    const tracks = Array.isArray(data?.tracks?.data) ? data.tracks.data : [];
    const first = tracks[0];
    if (!first?.title) return null;
    return {
      query: `${first.title || ""} ${first.artist?.name || ""}`.trim(),
      source: "deezer",
      playlistQueries: tracks.slice(0, 100).map((t) => `${t.title || ""} ${t.artist?.name || ""}`.trim()).filter(Boolean),
    };
  }
  if (parts.type === "playlist") {
    const response = await axios.get(`${base}/playlist/${parts.id}`, { timeout: 12_000 }).catch(() => null);
    const data = response?.data;
    const tracks = Array.isArray(data?.tracks?.data) ? data.tracks.data : [];
    const first = tracks[0];
    if (!first?.title) return null;
    return {
      query: `${first.title || ""} ${first.artist?.name || ""}`.trim(),
      source: "deezer",
      playlistQueries: tracks.slice(0, 100).map((t) => `${t.title || ""} ${t.artist?.name || ""}`.trim()).filter(Boolean),
    };
  }
  return null;
}

async function runYoutubeSearch(manager, query, requestedBy) {
  const node = getConnectedNode(manager);
  const nodeExtra = { nodeName: node?.name, nodeState: node?.state };
  const q = String(query || "").trim();
  if (!q) return [];
  const ytId = `ytsearch:${q}`;
  const result = await resolveIdentifier(manager, ytId).catch(() => null);
  const parsed = tracksFromLavalinkResponse(result, requestedBy, { resolverInput: ytId, originalQuery: q, source: "youtube", ...nodeExtra });
  const tracks = (parsed.tracks || []).map((t) => {
    t.source = "youtube";
    t.score = scoreTrackCandidate(t, q);
    return t;
  }).filter((t) => !isLikelyPodcast(t));
  const out = dedupeTracks(tracks).sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  logMusic("search_youtube", { query: q, resolvedCount: out.length });
  return out;
}

async function resolveIdentifier(manager, identifier) {
  let node = getConnectedNode(manager);
  if (!node) throw new Error("No Lavalink node available");
  if (node.state !== Constants.State.CONNECTED) {
    await waitForNodeReady(manager, 5000).catch(() => {});
    node = getConnectedNode(manager);
  }
  if (!node) throw new Error("No Lavalink node available");
  return node.rest.resolve(identifier);
}

function tracksFromLavalinkResponse(result, requestedBy, extra = {}) {
  if (!result) {
    const now = Date.now();
    if (now - lastLavalinkNullLogAt >= LAVALINK_NULL_LOG_THROTTLE_MS) {
      lastLavalinkNullLogAt = now;
      const host = String(process.env.LAVALINK_HOST || "127.0.0.1:2333").trim();
      const hint = extra?.nodeState !== "CONNECTED"
        ? "WebSocket not connected. Check LAVALINK_PASSWORD matches application.yml and pm2 logs lavalink."
        : "REST resolve failed or node unreachable. Check: Lavalink running? LAVALINK_HOST correct? Firewall?";
      logMusic("lavalink_resolve_null", {
        hint,
        host,
        ...(extra?.nodeName != null && { nodeName: extra.nodeName }),
        ...(extra?.nodeState != null && { nodeState: extra.nodeState }),
      });
    }
    return { tracks: [], playlist: null };
  }
  const rawLoadType = result.loadType ?? result.load_type ?? result.type ?? result.resultType ?? "";
  const loadType = normalizeLoadTypeValue(rawLoadType);

  if (loadType === "track" && result.data) {
    return { tracks: [toTrack(result.data, requestedBy, extra)], playlist: null };
  }
  if (loadType === "playlist" && result.data) {
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
  if (loadType === "search") {
    const searchTracks = Array.isArray(result.data)
      ? result.data
      : Array.isArray(result.data?.tracks)
        ? result.data.tracks
        : [];
    if (searchTracks.length === 0 && result.data != null) {
      logMusic("lavalink_search_empty_structure", {
        dataKeys: typeof result.data === "object" ? Object.keys(result.data) : [],
      });
    }
    return {
      tracks: searchTracks.map((item) => toTrack(item, requestedBy, extra)),
      playlist: null,
    };
  }
  if (loadType === "empty" || loadType === "error") {
    logMusic("lavalink_zero_tracks", { loadType, rawLoadType: String(rawLoadType) });
  } else {
    logMusic("lavalink_unhandled_response", { rawLoadType: String(rawLoadType), hasData: Boolean(result.data) });
  }
  return { tracks: [], playlist: null };
}

async function runCatalogSearch(manager, query, requestedBy) {
  return runYoutubeSearch(manager, query, requestedBy);
}

function parseLyricsPayload(item) {
  const plainLyrics = String(item?.plainLyrics || item?.syncedLyrics || item?.lyrics || "",).trim();
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
  const response = await axios.get("https://lrclib.net/api/search", { timeout: 12_000, params: { q: normalizedQuery }, headers: { "User-Agent": "ViniliCaffeBot/1.0" }, }).catch(() => null);
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
  await channel.send({ embeds: [embed] }).catch(() => { });
}

async function scheduleInactivityLeave(queue) {
  const guildId = String(queue?.guildId || "");
  if (!guildId) return;
  clearTimer(inactivityTimers, guildId);
  const timer = setTimeout(async () => { const current = queues.get(guildId); if (!current) return; if (current.currentTrack) return; if (current.tracks.length > 0) return; const embed = new EmbedBuilder().setColor("#ED4245").setDescription("No tracks have been playing for the past 3 minutes, leaving \uD83D\uDC4B"); const channel = current.metadata?.channel; if (channel?.isTextBased?.()) await channel.send({ embeds: [embed] }).catch(() => { }); await destroyQueue(guildId, { manual: true }); }, INACTIVITY_MS); timer.unref?.(); inactivityTimers.set(guildId, timer);
}

async function scheduleEmptyVoiceLeave(queue) {
  const guildId = String(queue?.guildId || "");
  if (!guildId) return;
  clearTimer(emptyVoiceTimers, guildId);
  const timer = setTimeout(async () => { const current = queues.get(guildId); if (!current) return; const guild = current.guild; const channel = guild?.channels?.cache?.get(current.voiceChannelId) || (current.voiceChannelId ? await guild?.channels?.fetch?.(current.voiceChannelId).catch(() => null) : null); const humans = channel?.members ? Array.from(channel.members.values()).filter((m) => !m.user?.bot) : []; if (humans.length > 0) return; const embed = new EmbedBuilder().setColor("#ED4245").setDescription("No one has been listening for the past 3 minutes, leaving \uD83D\uDC4B"); if (current.metadata?.channel?.isTextBased?.()) { await current.metadata.channel.send({ embeds: [embed] }).catch(() => { }); } await destroyQueue(guildId, { manual: true }); }, EMPTY_VOICE_MS); timer.unref?.(); emptyVoiceTimers.set(guildId, timer);
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
      if (queue.player) await queue.player.setGlobalVolume(queue.volume).catch(() => { });
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
  await queue.player.setGlobalVolume(queue.volume).catch(() => { });
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
  queue._lastPositionWrite = 0;
  queue.player.on("update", (data) => {
    const now = Date.now();
    if (now - (queue._lastPositionWrite || 0) < 1500) return;
    queue._lastPositionWrite = now;
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
    await playNext(queue).catch(() => { });
  });
  queue.player.on("stuck", async () => {
    global.logger?.warn?.("[MUSIC] player stuck:", queue.guildId, queue.currentTrack?.title || "unknown");
    await playNext(queue).catch(() => { });
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
    const isIpDiscoveryError = (err) => {
      const msg = String(err?.message || "").toLowerCase();
      return msg.includes("ip discovery") || msg.includes("socket closed");
    };
    let player = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        player = await manager.joinVoiceChannel({ guildId, channelId: String(voiceChannel.id), shardId: Number(guild?.shardId || 0), deaf: false, mute: false, });
        break;
      } catch (err) {
        if (isIpDiscoveryError(err) && attempt === 1) {
          global.logger?.warn?.("[MUSIC] IP discovery / socket closed, retry in 2s:", err?.message || err);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw err;
      }
    }
    if (!player) throw new Error("Impossibile entrare nel canale vocale (IP discovery fallita). Controlla firewall/UDP porte 45000-60000.");
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
  const voiceChannelId = queue.voiceChannelId || null;
  queues.delete(key);
  queue.manualDisconnect = Boolean(manual);
  queue.tracks = [];
  queue.currentTrack = null;
  await queue.player.destroy().catch(() => { });
  if (voiceChannelId) setTtsLockedChannel(key, voiceChannelId);
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
  const manager = new Shoukaku(new Connectors.DiscordJS(client), [{ name, url: host, auth, secure }], { resume: true, resumeTimeout: 30, reconnectTries: 5, reconnectInterval: 5, restTimeout: 60, voiceConnectionTimeout: 15, },);

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
  const query = cleanQuery(input);
  if (!query) return { ok: false, reason: "empty_query" };
  const node = getConnectedNode(manager);
  const nodeExtra = { nodeName: node?.name, nodeState: node?.state };

  if (isSoundCloudUrl(query)) return { ok: false, reason: "blocked_source", source: "soundcloud" };
  if (isAppleMusicUrl(query)) return { ok: false, reason: "blocked_source", source: "apple" };

  if (/youtu\.be|youtube\.com/i.test(query)) {
    const direct = await resolveIdentifier(manager, query).catch(() => null);
    const parsed = tracksFromLavalinkResponse(direct, requestedBy, { resolverInput: query, originalQuery: input, source: "youtube", ...nodeExtra });
    const playable = parsed.tracks.filter((t) => PLAYABLE_SOURCE_KEYS.has(t.source) || t.source === "youtube");
    if (playable.length) {
      playable.forEach((t) => { t.source = "youtube"; });
      return {
        ok: true,
        player,
        resolved: { query, translated: false, youtubeConvertible: false },
        searchResult: { tracks: playable, playlist: parsed.playlist },
      };
    }
    return { ok: false, reason: "not_found" };
  }

  if (/^https?:\/\//i.test(query) && !isSpotifyUrl(query) && !isDeezerUrl(query)) {
    const playableUrl = await resolvePlayableRadioUrl(query).catch(() => "");
    const targetUrl = playableUrl || query;
    const r = await resolveIdentifier(manager, targetUrl).catch(() => null);
    const parsed = tracksFromLavalinkResponse(r, requestedBy, { resolverInput: targetUrl, originalQuery: input, source: "radio", url: targetUrl, ...nodeExtra });
    const t = parsed.tracks[0];
    if (t) {
      t.source = "radio";
      return { ok: true, player, resolved: { query: targetUrl, translated: false, youtubeConvertible: false }, searchResult: { tracks: [t], playlist: null } };
    }
    return { ok: false, reason: "not_found" };
  }

  if (isSpotifyUrl(query)) {
    const oembed = await fetchSpotifyOembedQuery(query);
    const line = oembed || query;
    const tracks = await runYoutubeSearch(manager, line, requestedBy);
    if (tracks.length) return { ok: true, player, resolved: { query: line, translated: true, youtubeConvertible: false }, searchResult: { tracks, playlist: null } };
    return { ok: false, reason: "not_found" };
  }

  if (isDeezerUrl(query)) {
    const meta = await fetchDeezerMetadataFromUrl(query);
    if (!meta?.query) return { ok: false, reason: "not_found" };
    if (meta.playlistQueries?.length) {
      const tracks = [];
      for (const line of meta.playlistQueries.slice(0, 25)) {
        const ytId = `ytsearch:${line}`;
        const r = await resolveIdentifier(manager, ytId).catch(() => null);
        const p = tracksFromLavalinkResponse(r, requestedBy, { resolverInput: ytId, originalQuery: input, source: "youtube", ...nodeExtra });
        const t = p.tracks?.[0];
        if (t && !isLikelyPodcast(t)) {
          t.source = "youtube";
          tracks.push(t);
        }
      }
      if (tracks.length) return { ok: true, player, resolved: { query: meta.query, translated: true, youtubeConvertible: false }, searchResult: { tracks, playlist: null } };
    }
    const tracks = await runYoutubeSearch(manager, meta.query, requestedBy);
    if (tracks.length) return { ok: true, player, resolved: { query: meta.query, translated: true, youtubeConvertible: false }, searchResult: { tracks, playlist: null } };
    return { ok: false, reason: "not_found" };
  }

  const tracks = await runCatalogSearch(manager, query, requestedBy);
  if (!tracks.length) return { ok: false, reason: "not_found" };
  return { ok: true, player, resolved: { query, translated: false, youtubeConvertible: false }, searchResult: { tracks, playlist: null } };
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
  logMusic("radio_resolve", {
    station: station?.name,
    originalUrl: station?.streamUrl,
    playableUrl,
    targetUrl,
  });
  const result = await resolveIdentifier(manager, targetUrl).catch(() => null);
  logMusic("radio_result", {
    station: station?.name,
    targetUrl,
    loadType: result?.loadType || "none",
  });
  const parsed = tracksFromLavalinkResponse(result, null, { resolverInput: targetUrl, originalQuery: station.name, source: "radio", station, url: targetUrl, });
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