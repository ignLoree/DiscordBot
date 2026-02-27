const axios = require("axios");
const { EmbedBuilder } = require("discord.js");

try {
  const opusscriptPath = require.resolve("opusscript");
  const BaseOpusScript = require(opusscriptPath);
  const originalEncode = BaseOpusScript.prototype?.encode;
  const originalDecode = BaseOpusScript.prototype?.decode;
  if (typeof originalEncode === "function") {
    BaseOpusScript.prototype.encode = function patchedOpusScriptEncode(buffer, frameSize) {
      const safeChannels = Math.max(1, Number(this?.channels || 2));
      const fallbackFrameSize = Math.max(
        1,
        Math.floor(Math.max(0, Number(buffer?.length || 0)) / (safeChannels * 2)),
      );
      return originalEncode.call(this, buffer, Number(frameSize || 0) > 0 ? frameSize : fallbackFrameSize);
    };
  }
  if (typeof originalDecode === "function") {
    BaseOpusScript.prototype.decode = function patchedOpusScriptDecode(buffer, frameSize) {
      const safeFrameSize = Number(frameSize || 0) > 0 ? frameSize : 960;
      return originalDecode.call(this, buffer, safeFrameSize);
    };
  }
  function PatchedOpusScript(samplingRate, channels, application, options) {
    const safeOptions = {
      ...(options && typeof options === "object" ? options : {}),
      wasm: false,
    };
    return new BaseOpusScript(samplingRate, channels, application, safeOptions);
  }
  Object.assign(PatchedOpusScript, BaseOpusScript);
  require.cache[opusscriptPath].exports = PatchedOpusScript;
} catch {}

try {
  const opusModule = require("@discord-player/opus");
  const PatchedOpusScript = require("opusscript");
  class SafeOpusEncoder {
    constructor(rate, channels, application) {
      this.rate = rate;
      this.channels = channels;
      this.application = application;
      this.encoder = new PatchedOpusScript(rate, channels, application, { wasm: false });
    }

    encode(buffer) {
      const safeChannels = Math.max(1, Number(this.channels || 2));
      const frameSize = Math.max(
        1,
        Math.floor(Math.max(0, Number(buffer?.length || 0)) / (safeChannels * 2)),
      );
      return this.encoder.encode(buffer, frameSize);
    }

    decode(buffer) {
      return this.encoder.decode(buffer, 960);
    }

    applyEncoderCTL(ctl, value) {
      if (typeof this.encoder?.encoderCTL === "function") {
        this.encoder.encoderCTL(ctl, value);
      }
    }

    delete() {
      if (typeof this.encoder?.delete === "function") {
        this.encoder.delete();
      }
      this.encoder = null;
    }
  }

  opusModule.setLibopusProvider(SafeOpusEncoder, "safe-opusscript");
} catch {}

const { Player, QueryType } = require("discord-player");
const { DefaultExtractors } = require("@discord-player/extractor");
const { leaveTtsGuild } = require("../TTS/ttsService");
const { getVoiceSession, setVoiceSession, clearVoiceSession } = require("../Voice/voiceSessionService");

let playerInitPromise = null;
const lastEmptyQueueAtByGuild = new Map();
const lastQueueNoticeAtByGuild = new Map();
const lastPlayerStartAtByGuild = new Map();
const lastPlayerErrorAtByGuild = new Map();
const lastTrackSessionByGuild = new Map();
const finishRetryCountByGuild = new Map();
const recoveryInFlightByGuild = new Map();
const recoveryAttemptsByGuild = new Map();
const playbackWatchdogsByGuild = new Map();
const noisyLogTimestamps = new Map();
const manualLeaveAtByGuild = new Map();
const inactivityTimersByGuild = new Map();
const emptyVoiceTimersByGuild = new Map();
const INACTIVITY_MS = 3 * 60 * 1000;
const EMPTY_VOICE_MS = 3 * 60 * 1000;
const DEFAULT_MUSIC_VOLUME = 5;
const MAX_TRACK_RECOVERY_ATTEMPTS = 2;
const SEARCH_SOURCE_ENGINES = [
  { engine: QueryType.SPOTIFY_SEARCH, key: "spotify", bias: 16 },
  { engine: QueryType.APPLE_MUSIC_SEARCH, key: "apple", bias: 14 },
];
const DEEZER_SEARCH_SOURCE = { engine: QueryType.AUTO, key: "deezer", bias: 15 };
const NON_YOUTUBE_SOURCE_KEYS = new Set(["spotify", "apple", "deezer"]);
const SUPPORTED_PLAYBACK_SOURCE_KEYS = new Set(["spotify", "apple", "deezer"]);
let spotifyApiTokenCache = null;

function logMusic(event, payload = {}) {
  const logger = global.logger;
  if (!logger?.warn && !logger?.info && !logger?.error) return;
  const entries = Object.entries(payload)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
  const line = `[MUSIC][${event}]${entries.length ? ` ${entries.join(" | ")}` : ""}`;
  if (logger.info) logger.info(line);
  else if (logger.warn) logger.warn(line);
}

function logMusicThrottled(event, guildId, payload = {}, windowMs = 15_000) {
  const key = `${String(guildId || "global")}:${String(event || "")}`;
  const now = Date.now();
  const lastAt = Number(noisyLogTimestamps.get(key) || 0);
  if (lastAt && now - lastAt < windowMs) return;
  noisyLogTimestamps.set(key, now);
  logMusic(event, payload);
}

function getTrackDebugMeta(track) {
  return {
    title: String(track?.title || "unknown"),
    author: String(track?.author || "unknown"),
    source: sourceKeyFromTrack(track),
    durationMs: Number(track?.durationMS || 0),
    url: String(track?.url || ""),
  };
}

async function sendQueueNotice(queue, content) {
  const textChannel = queue?.metadata?.channel;
  if (!textChannel?.isTextBased?.()) return;
  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setDescription(String(content || ""));
  await textChannel.send({ embeds: [embed] }).catch(() => { });
}

async function sendQueueEmbed(queue, embed) {
  const textChannel = queue?.metadata?.channel;
  if (!textChannel?.isTextBased?.()) return;
  await textChannel.send({ embeds: [embed] }).catch(() => { });
}

function clearInactivityTimer(guildId) {
  const key = String(guildId || "");
  if (!key) return;
  const timer = inactivityTimersByGuild.get(key);
  if (timer) clearTimeout(timer);
  inactivityTimersByGuild.delete(key);
}

function clearEmptyVoiceTimer(guildId) {
  const key = String(guildId || "");
  if (!key) return;
  const timer = emptyVoiceTimersByGuild.get(key);
  if (timer) clearTimeout(timer);
  emptyVoiceTimersByGuild.delete(key);
}

function clearPlaybackWatchdog(guildId) {
  const key = String(guildId || "");
  if (!key) return;
  const timer = playbackWatchdogsByGuild.get(key);
  if (timer) clearInterval(timer);
  playbackWatchdogsByGuild.delete(key);
}

async function notifyQueueEnded(queue) {
  const guildId = String(queue?.guild?.id || "");
  if (guildId && recoveryInFlightByGuild.get(guildId)) return;
  const now = Date.now();
  const lastNoticeAt = guildId ? Number(lastQueueNoticeAtByGuild.get(guildId) || 0) : 0;
  if (lastNoticeAt && now - lastNoticeAt < 10_000) return;
  if (guildId) {
    lastEmptyQueueAtByGuild.set(guildId, now);
    lastQueueNoticeAtByGuild.set(guildId, now);
  }
  logMusic("queue_end", {
    guildId,
    currentTrack: queue?.currentTrack?.title,
    pendingTracks: Number(queue?.tracks?.size || 0),
  });
  await sendQueueNotice(queue, "There are no more tracks");
  scheduleInactivityLeave(queue);
}

async function fetchYouTubeOEmbed(url) {
  const response = await axios.get("https://www.youtube.com/oembed", {
    params: {
      url,
      format: "json",
    },
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
    params: {
      url,
      format: "json",
    },
    timeout: 12000,
  }).catch(() => null);
  const data = response?.data;
  if (!data?.title) return null;
  return {
    title: String(data.title || "").trim(),
    author: String(data.author_name || "").trim(),
  };
}

async function getSpotifyApiToken() {
  const clientId = String(process.env.SPOTIFY_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.SPOTIFY_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (
    spotifyApiTokenCache?.accessToken &&
    Number(spotifyApiTokenCache.expiresAt || 0) - now > 60_000
  ) {
    return spotifyApiTokenCache.accessToken;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 12000,
    },
  ).catch(() => null);

  const token = String(response?.data?.access_token || "").trim();
  const expiresIn = Math.max(0, Number(response?.data?.expires_in || 0));
  if (!token || !expiresIn) return null;

  spotifyApiTokenCache = {
    accessToken: token,
    expiresAt: now + expiresIn * 1000,
  };
  return token;
}

function shouldTreatAsEarlyFinish(track, startedAt) {
  const durationMs = Math.max(0, Number(track?.durationMS || 0));
  if (durationMs < 30_000) return false;
  const elapsed = Math.max(0, Date.now() - Number(startedAt || 0));
  const minExpected = Math.max(15_000, Math.floor(durationMs * 0.35));
  return elapsed > 0 && elapsed < minExpected;
}

function queueTracksToArray(queue) {
  if (!queue?.tracks) return [];
  if (typeof queue.tracks.toArray === "function") {
    try {
      return queue.tracks.toArray();
    } catch {
      return [];
    }
  }
  if (Array.isArray(queue.tracks)) return queue.tracks;
  if (Array.isArray(queue.tracks.data)) return queue.tracks.data;
  return [];
}

function stampTrackMetadata(track, requestedBy, extra = {}) {
  if (!track || typeof track.setMetadata !== "function") return;
  const existing = track.metadata && typeof track.metadata === "object"
    ? track.metadata
    : {};
  track.setMetadata({
    ...existing,
    requestedAt: Date.now(),
    requestedById: String(requestedBy?.id || ""),
    recoveryQuery: String(extra.recoveryQuery || existing.recoveryQuery || "").trim(),
    failedSources: Array.isArray(extra.failedSources)
      ? [...new Set(extra.failedSources.map((item) => String(item || "").trim()).filter(Boolean))]
      : Array.isArray(existing.failedSources)
        ? existing.failedSources
        : [],
  });
}

function scheduleInactivityLeave(queue) {
  const guildId = String(queue?.guild?.id || "");
  if (!guildId) return;
  clearInactivityTimer(guildId);

  const timer = setTimeout(async () => {
    try {
      if (queue.deleted) return;
      if (queue.isPlaying()) return;
      if (Number(queue?.tracks?.size || 0) > 0) return;

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription(
          [
            "No tracks have been playing for the past 3 minutes, leaving 👋",
          ].join("\n"),
        );
      await sendQueueEmbed(queue, embed);
      manualLeaveAtByGuild.set(guildId, Date.now());
      queue.delete();
    } catch (error) {
      global.logger?.error?.("[MUSIC] inactivity leave failed:", error?.message || error);
    } finally {
      inactivityTimersByGuild.delete(guildId);
    }
  }, INACTIVITY_MS);

  inactivityTimersByGuild.set(guildId, timer);
}

function scheduleEmptyVoiceLeave(queue) {
  const guildId = String(queue?.guild?.id || "");
  if (!guildId) return;
  clearEmptyVoiceTimer(guildId);

  const timer = setTimeout(async () => {
    try {
      if (queue.deleted) return;
      const voiceChannel = queue.channel;
      if (!voiceChannel?.members?.size) return;

      const listeners = Array.from(voiceChannel.members.values()).filter(
        (m) => !m.user?.bot,
      );
      if (listeners.length > 0) return;

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription(
          [
            "No one has been listening for the past 3 minutes, leaving 👋",
          ].join("\n"),
        );
      await sendQueueEmbed(queue, embed);
      manualLeaveAtByGuild.set(guildId, Date.now());
      queue.delete();
    } catch (error) {
      global.logger?.error?.("[MUSIC] empty-voice leave failed:", error?.message || error);
    } finally {
      emptyVoiceTimersByGuild.delete(guildId);
    }
  }, EMPTY_VOICE_MS);

  emptyVoiceTimersByGuild.set(guildId, timer);
}

function cleanQuery(raw) {
  return String(raw || "")
    .trim()
    .replace(/^<|>$/g, "");
}

function isYouTubeVideoUrl(value) {
  const input = String(value || "");
  if (!/^https?:\/\//i.test(input)) return false;
  if (!/youtu\.be|youtube\.com/i.test(input)) return false;
  if (/[?&]list=/i.test(input) || /\/playlist/i.test(input)) return false;
  return /(?:watch\?v=|youtu\.be\/|\/shorts\/)/i.test(input);
}

function isSoundCloudUrl(value) {
  return /soundcloud\.com/i.test(String(value || ""));
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

function tokenizeText(value) {
  return normalizeText(value)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanYouTubeTrackTitle(title) {
  return String(title || "")
    .replace(/\[[^\]]*(official|video|audio|lyrics?|lyric|hd|4k|mv)[^\]]*\]/gi, " ")
    .replace(/\([^\)]*(official|video|audio|lyrics?|lyric|hd|4k|mv)[^\)]*\)/gi, " ")
    .replace(/\b(official video|official audio|official lyric video|lyric video|lyrics video|visualizer|audio ufficiale|video ufficiale)\b/gi, " ")
    .replace(/\b(prod\.?\s+by\b.*)$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceKeyFromTrack(track) {
  const source = String(track?.source || track?.queryType || "").toLowerCase();
  const url = String(track?.url || "").toLowerCase();

  if (source.includes("spotify") || /spotify\.com/.test(url)) return "spotify";
  if (source.includes("apple") || /music\.apple\.com|itunes\.apple\.com/.test(url)) return "apple";
  if (source.includes("soundcloud") || /soundcloud\.com/.test(url)) return "soundcloud";
  if (source.includes("deezer") || /deezer\.com/.test(url)) return "deezer";
  if (source.includes("youtube") || /youtu\.be|youtube\.com/.test(url)) return "youtube";
  return "unknown";
}

function buildTrackIdentity(track) {
  const normalizedUrl = String(track?.url || "").trim().toLowerCase();
  if (normalizedUrl) return `url:${normalizedUrl}`;
  return [
    "meta",
    normalizeText(track?.title),
    normalizeText(track?.author),
    String(Math.round(Number(track?.durationMS || 0) / 1000) || 0),
  ].join("|");
}

function getTrackRecoveryKey(track) {
  if (!track) return "";
  const metadata = track?.metadata && typeof track.metadata === "object"
    ? track.metadata
    : {};
  const recoveryQuery = normalizeText(metadata?.recoveryQuery);
  if (recoveryQuery) return `rq:${recoveryQuery}`;
  return buildTrackIdentity(track);
}

function getGuildRecoveryAttempts(guildId) {
  const key = String(guildId || "");
  if (!key) return null;
  if (!recoveryAttemptsByGuild.has(key)) {
    recoveryAttemptsByGuild.set(key, new Map());
  }
  return recoveryAttemptsByGuild.get(key);
}

function getTrackRecoveryAttempts(guildId, track) {
  const bucket = getGuildRecoveryAttempts(guildId);
  const recoveryKey = getTrackRecoveryKey(track);
  if (!bucket || !recoveryKey) return 0;
  return Number(bucket.get(recoveryKey) || 0);
}

function incrementTrackRecoveryAttempts(guildId, track) {
  const bucket = getGuildRecoveryAttempts(guildId);
  const recoveryKey = getTrackRecoveryKey(track);
  if (!bucket || !recoveryKey) return 0;
  const next = Number(bucket.get(recoveryKey) || 0) + 1;
  bucket.set(recoveryKey, next);
  return next;
}

function clearGuildRecoveryAttempts(guildId) {
  const key = String(guildId || "");
  if (!key) return;
  recoveryAttemptsByGuild.delete(key);
}

function isPodcastLikeTrack(track) {
  const haystack = [
    track?.title,
    track?.author,
    track?.description,
    track?.url,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");

  if (!haystack) return false;
  return /\b(podcast|episodio|episode|puntata|show|intervista integrale|audiolibro|audiobook)\b/.test(haystack);
}

function isLikelyPreviewTrack(track) {
  const source = sourceKeyFromTrack(track);
  const durationMs = Number(track?.durationMS || 0);
  if (source === "soundcloud" && durationMs > 0 && durationMs <= 31_000) {
    return true;
  }
  return false;
}

function isSupportedPlaybackTrack(track) {
  const source = sourceKeyFromTrack(track);
  return SUPPORTED_PLAYBACK_SOURCE_KEYS.has(source);
}

function filterPlayableTracks(tracks = []) {
  return tracks.filter(
    (track) =>
      isSupportedPlaybackTrack(track) &&
      !isPodcastLikeTrack(track) &&
      !isLikelyPreviewTrack(track),
  );
}

function scoreTrackCandidate(track, query, searchSource) {
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenizeText(query);
  const title = normalizeText(track?.title);
  const author = normalizeText(track?.author);
  const combined = [title, author].filter(Boolean).join(" ");
  const source = sourceKeyFromTrack(track);
  let score = Number(searchSource?.bias || 0);

  if (!normalizedQuery) return score;
  if (combined === normalizedQuery) score += 140;
  if (title === normalizedQuery) score += 120;
  if (author === normalizedQuery) score += 45;
  if (combined.includes(normalizedQuery)) score += 55;
  if (title.includes(normalizedQuery)) score += 40;
  if (author && normalizedQuery.includes(author)) score += 18;

  let titleMatches = 0;
  let authorMatches = 0;
  for (const token of queryTokens) {
    if (title.includes(token)) titleMatches += 1;
    if (author.includes(token)) authorMatches += 1;
  }

  score += titleMatches * 12;
  score += authorMatches * 7;

  if (queryTokens.length > 0 && titleMatches === queryTokens.length) score += 25;
  if (queryTokens.length > 1 && titleMatches + authorMatches === queryTokens.length) score += 20;

  const penalizedTerms = ["live", "remix", "sped up", "nightcore", "slowed", "karaoke", "instrumental"];
  for (const term of penalizedTerms) {
    if (combined.includes(term) && !normalizedQuery.includes(term)) score -= 10;
  }

  if (source === "youtube" && /official audio|official video|topic/.test(combined)) score += 6;
  if (source === "soundcloud" && /remix|bootleg|flip/.test(combined) && !/remix|bootleg|flip/.test(normalizedQuery)) score -= 8;

  return score;
}

function isStrictTitleMatch(track, query) {
  const normalizedQuery = normalizeText(query);
  const normalizedTitle = normalizeText(track?.title);
  if (!normalizedQuery || !normalizedTitle) return false;
  return normalizedTitle === normalizedQuery;
}

function isNearTitleMatch(track, query) {
  const normalizedQuery = normalizeText(query);
  const normalizedTitle = normalizeText(track?.title);
  if (!normalizedQuery || !normalizedTitle) return false;
  return normalizedTitle.startsWith(`${normalizedQuery} `) || normalizedTitle.includes(` ${normalizedQuery}`);
}

async function searchExactTitleCandidates(player, query, requestedBy) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const settled = await Promise.allSettled([
    axios.get("https://api.deezer.com/search", {
      params: { q: `track:"${query}"`, limit: 10 },
      timeout: 12000,
    }),
    axios.get("https://itunes.apple.com/search", {
      params: {
        term: query,
        entity: "song",
        attribute: "songTerm",
        limit: 10,
      },
      timeout: 12000,
    }),
    player.search(query, {
      requestedBy,
      searchEngine: QueryType.SPOTIFY_SEARCH,
    }),
  ]);

  const deezerRows = settled[0]?.status === "fulfilled" && Array.isArray(settled[0]?.value?.data?.data)
    ? settled[0].value.data.data
    : [];
  const itunesRows = settled[1]?.status === "fulfilled" && Array.isArray(settled[1]?.value?.data?.results)
    ? settled[1].value.data.results
    : [];
  const spotifyRows = settled[2]?.status === "fulfilled" && Array.isArray(settled[2]?.value?.tracks)
    ? settled[2].value.tracks
    : [];

  const candidateRequests = [
    ...deezerRows.map((row) => ({
      type: "deezer",
      query: String(row?.link || "").trim(),
    })),
    ...itunesRows.map((row) => ({
      type: "apple",
      query: `${String(row?.trackName || "").trim()} ${String(row?.artistName || "").trim()}`.trim(),
    })),
    ...spotifyRows
      .filter((track) => isStrictTitleMatch(track, query))
      .map((track) => ({
        type: "spotify-track",
        track,
      })),
  ].filter((item) => item.query || item.track);

  const resolved = await Promise.allSettled(
    candidateRequests.map(async (item) => {
      if (item.type === "spotify-track" && item.track) {
        return item.track;
      }
      const result = await player.search(item.query, {
        requestedBy,
        searchEngine: item.type === "apple" ? QueryType.APPLE_MUSIC_SEARCH : QueryType.AUTO,
      });
      const firstTrack = Array.isArray(result?.tracks) ? result.tracks[0] : null;
      return firstTrack || null;
    }),
  );

  return filterPlayableTracks(
    resolved
      .filter((item) => item.status === "fulfilled" && item.value)
      .map((item) => item.value),
  ).filter((track) => isStrictTitleMatch(track, query));
}

function shouldAggregateSearch(resolved) {
  const query = String(resolved?.query || "");
  if (!query) return false;
  if (/^https?:\/\//i.test(query)) return false;
  return resolved?.engine === QueryType.AUTO_SEARCH;
}

async function searchBestMatches(player, query, requestedBy, options = {}) {
  const allowYoutube = options.allowYoutube !== false;
  const avoidSources = new Set(
    Array.isArray(options.avoidSources)
      ? options.avoidSources.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : [],
  );
  const primarySources = allowYoutube
    ? SEARCH_SOURCE_ENGINES
    : SEARCH_SOURCE_ENGINES.filter((item) => item.key !== "youtube");
  const settled = await Promise.allSettled([
    ...primarySources.map(async (source) => {
      const result = await player.search(query, {
        requestedBy,
        searchEngine: source.engine,
      });
      const tracks = filterPlayableTracks(Array.isArray(result?.tracks) ? result.tracks.slice(0, 20) : []);
      return { source, tracks };
    }),
    (async () => {
      const response = await axios.get("https://api.deezer.com/search", {
        params: { q: query, limit: 5 },
        timeout: 12000,
      });
      const deezerRows = Array.isArray(response?.data?.data) ? response.data.data : [];
      const deezerSettled = await Promise.allSettled(
        deezerRows.map(async (row) => {
          const deezerUrl = String(row?.link || "").trim();
          if (!deezerUrl) return null;
          const playable = await player.search(deezerUrl, {
            requestedBy,
            searchEngine: QueryType.AUTO,
          });
          const firstTrack = Array.isArray(playable?.tracks) ? playable.tracks[0] : null;
          return firstTrack || null;
        }),
      );
      const tracks = filterPlayableTracks(deezerSettled
        .filter((item) => item.status === "fulfilled" && item.value)
        .map((item) => item.value)
        .slice(0, 5));
      return { source: DEEZER_SEARCH_SOURCE, tracks };
    })(),
  ]);

  const seen = new Set();
  const ranked = [];

  for (const item of settled) {
    if (item.status !== "fulfilled") continue;
    const { source, tracks } = item.value || {};
    for (const track of tracks || []) {
      const trackSource = sourceKeyFromTrack(track);
      if (avoidSources.has(trackSource)) continue;
      const identity = buildTrackIdentity(track);
      if (seen.has(identity)) continue;
      seen.add(identity);
      ranked.push({
        track,
        score: scoreTrackCandidate(track, query, source),
        sourceKey: trackSource || source?.key || "unknown",
      });
    }
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const durationDiff = Number(b.track?.durationMS || 0) - Number(a.track?.durationMS || 0);
    if (durationDiff !== 0) return durationDiff;
    return String(a.track?.title || "").localeCompare(String(b.track?.title || ""));
  });

  let strictMatches = ranked.filter((item) => isStrictTitleMatch(item.track, query));
  if (strictMatches.length === 0) {
    const exactCandidates = await searchExactTitleCandidates(player, query, requestedBy).catch(() => []);
    if (exactCandidates.length > 0) {
      strictMatches = exactCandidates.map((track) => ({
        track,
        score: scoreTrackCandidate(track, query, { key: sourceKeyFromTrack(track), bias: 18 }),
        sourceKey: sourceKeyFromTrack(track),
      }));
    }
  }
  if (strictMatches.length > 0) {
    strictMatches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.track?.author || "").localeCompare(String(b.track?.author || ""));
    });
    logMusic("search_strict_title_match", {
      query,
      count: strictMatches.length,
      top: strictMatches.slice(0, 5).map((item) => ({
        title: item.track?.title || "unknown",
        author: item.track?.author || "unknown",
        source: item.sourceKey,
        score: item.score,
      })),
    });
    return {
      tracks: strictMatches.map((item) => item.track),
      playlist: null,
    };
  }

  const nearMatches = ranked.filter((item) => isNearTitleMatch(item.track, query));
  if (nearMatches.length > 0) {
    nearMatches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.track?.author || "").localeCompare(String(b.track?.author || ""));
    });
    logMusic("search_near_title_match", {
      query,
      count: nearMatches.length,
      top: nearMatches.slice(0, 5).map((item) => ({
        title: item.track?.title || "unknown",
        author: item.track?.author || "unknown",
        source: item.sourceKey,
        score: item.score,
      })),
    });
    return {
      tracks: nearMatches.map((item) => item.track),
      playlist: null,
    };
  }

  logMusic("search_ranked", {
    query,
    requestedBy: requestedBy?.id || requestedBy?.user?.id || "",
    avoidSources: Array.from(avoidSources),
    count: ranked.length,
    top: ranked.slice(0, 5).map((item) => ({
      title: item.track?.title || "unknown",
      author: item.track?.author || "unknown",
      source: item.sourceKey,
      score: item.score,
    })),
  });

  return {
    tracks: ranked.map((item) => item.track),
    playlist: null,
  };
}

async function tryConvertYoutubeVideo(player, query, requestedBy) {
  if (!isYouTubeVideoUrl(query)) return null;

  const metadata = await fetchYouTubeOEmbed(query).catch(() => null);
  if (!metadata?.title) return null;

  const cleanTitle = cleanYouTubeTrackTitle(metadata.title);
  const author = String(metadata.author || "").replace(/\s*-\s*topic$/i, "").trim();
  const convertedQuery = [cleanTitle, author].filter(Boolean).join(" ").trim();
  if (!convertedQuery) return null;

  const converted = await searchBestMatches(player, convertedQuery, requestedBy, {
    allowYoutube: false,
  }).catch(() => null);
  const convertedTracks = Array.isArray(converted?.tracks) ? converted.tracks : [];
  const bestTrack = convertedTracks.find((track) => NON_YOUTUBE_SOURCE_KEYS.has(sourceKeyFromTrack(track)));

  if (!bestTrack) return null;

  return {
    query: convertedQuery,
    searchResult: {
      tracks: [bestTrack],
      playlist: null,
    },
    converted: true,
  };
}

async function tryConvertSoundCloudTrack(player, query, requestedBy) {
  if (!isSoundCloudUrl(query)) return null;

  const metadata = await fetchSoundCloudOEmbed(query).catch(() => null);
  if (!metadata?.title) return null;

  const cleanTitle = cleanYouTubeTrackTitle(metadata.title);
  const author = String(metadata.author || "").replace(/\s*-\s*topic$/i, "").trim();
  const convertedQuery = [cleanTitle, author].filter(Boolean).join(" ").trim();
  if (!convertedQuery) return null;

  const converted = await searchBestMatches(player, convertedQuery, requestedBy, {
    allowYoutube: false,
    avoidSources: ["soundcloud"],
  }).catch(() => null);
  const convertedTracks = Array.isArray(converted?.tracks) ? converted.tracks : [];
  const bestTrack = convertedTracks.find((track) => NON_YOUTUBE_SOURCE_KEYS.has(sourceKeyFromTrack(track)));
  if (!bestTrack) return null;

  return {
    query: convertedQuery,
    searchResult: {
      tracks: [bestTrack],
      playlist: null,
    },
    converted: true,
  };
}

async function runSearch(player, resolved, requestedBy) {
  logMusic("search_begin", {
    query: resolved?.query,
    engine: resolved?.engine,
    translated: Boolean(resolved?.translated),
    youtubeConvertible: Boolean(resolved?.youtubeConvertible),
    avoidSources: resolved?.avoidSources || [],
    requestedBy: requestedBy?.id || requestedBy?.user?.id || "",
  });
  if (resolved?.youtubeConvertible) {
    const converted = await tryConvertYoutubeVideo(player, resolved.query, requestedBy);
    if (converted?.searchResult?.tracks?.length) {
      logMusic("search_youtube_converted", {
        originalQuery: resolved.query,
        convertedQuery: converted.query,
        chosen: getTrackDebugMeta(converted.searchResult.tracks[0]),
      });
      return converted.searchResult;
    }
    logMusic("search_youtube_converter_miss", {
      originalQuery: resolved.query,
    });
    return { tracks: [], playlist: null };
  }

  if (resolved?.blockedSource === "soundcloud") {
    const converted = await tryConvertSoundCloudTrack(player, resolved.query, requestedBy);
    if (converted?.searchResult?.tracks?.length) {
      logMusic("search_soundcloud_converted", {
        originalQuery: resolved.query,
        convertedQuery: converted.query,
        chosen: getTrackDebugMeta(converted.searchResult.tracks[0]),
      });
      return converted.searchResult;
    }
    logMusic("search_blocked_source", {
      query: resolved?.query,
      blockedSource: "soundcloud",
    });
    return { tracks: [], playlist: null };
  }

  if (shouldAggregateSearch(resolved)) {
    const aggregated = await searchBestMatches(player, resolved.query, requestedBy, {
      avoidSources: resolved?.avoidSources,
    });
    if (Array.isArray(aggregated?.tracks) && aggregated.tracks.length) return aggregated;
  }

  const result = await player.search(resolved.query, {
    requestedBy,
    searchEngine: resolved.engine,
  });
  const originalTracks = Array.isArray(result?.tracks) ? result.tracks : [];
  if (Array.isArray(result?.tracks)) {
    result.tracks = filterPlayableTracks(result.tracks);
  }
  if ((!result?.tracks || result.tracks.length === 0) && originalTracks.length > 0) {
    const previewTrack = originalTracks.find((track) => isLikelyPreviewTrack(track));
    if (previewTrack) {
      const fallbackQuery = `${previewTrack?.title || ""} ${previewTrack?.author || ""}`.trim();
      if (fallbackQuery) {
        logMusic("search_preview_fallback", {
          originalQuery: resolved?.query,
          fallbackQuery,
          preview: getTrackDebugMeta(previewTrack),
        });
        const fallbackResult = await searchBestMatches(player, fallbackQuery, requestedBy, {
          avoidSources: ["soundcloud"],
        });
        if (Array.isArray(fallbackResult?.tracks) && fallbackResult.tracks.length > 0) {
          logMusic("search_preview_fallback_hit", {
            originalQuery: resolved?.query,
            chosen: getTrackDebugMeta(fallbackResult.tracks[0]),
          });
          return fallbackResult;
        }
      }
    }
  }
  logMusic("search_result", {
    query: resolved?.query,
    count: Array.isArray(result?.tracks) ? result.tracks.length : 0,
    playlist: Boolean(result?.playlist),
    first: Array.isArray(result?.tracks) && result.tracks[0] ? getTrackDebugMeta(result.tracks[0]) : null,
  });
  return result;
}

async function resolvePlayableTrackFromCandidate(player, candidate, requestedBy) {
  if (!candidate) return null;
  if (typeof candidate.setMetadata === "function") return candidate;

  const attempts = [
    String(candidate?.resolverInput || "").trim(),
    String(candidate?.url || "").trim(),
    `${String(candidate?.title || "").trim()} ${String(candidate?.author || "").trim()}`.trim(),
  ].filter(Boolean);

  for (const attempt of attempts) {
    const result = await player.search(attempt, {
      requestedBy,
      searchEngine: /^https?:\/\//i.test(attempt) ? QueryType.AUTO : QueryType.AUTO_SEARCH,
    }).catch(() => null);
    const firstTrack = filterPlayableTracks(Array.isArray(result?.tracks) ? result.tracks : [])[0] || null;
    if (firstTrack) return firstTrack;
  }

  return null;
}

async function resolvePlayableSearchResult(player, searchResult, requestedBy) {
  if (!searchResult || !Array.isArray(searchResult.tracks) || searchResult.tracks.length === 0) {
    return searchResult;
  }

  const resolvedTracks = [];
  for (const track of searchResult.tracks) {
    const playable = await resolvePlayableTrackFromCandidate(player, track, requestedBy);
    if (playable) resolvedTracks.push(playable);
  }

  return {
    ...searchResult,
    tracks: resolvedTracks,
  };
}

async function recoverTrackPlayback(queue, finishedTrack, client, avoidSource) {
  const guildId = String(queue?.guild?.id || "");
  if (guildId && recoveryInFlightByGuild.get(guildId)) {
    throw new Error("recovery already in progress");
  }
  if (guildId) recoveryInFlightByGuild.set(guildId, true);
  try {
    const playerRef = queue?.player || client.musicPlayer;
    const metadata = finishedTrack?.metadata && typeof finishedTrack.metadata === "object"
      ? finishedTrack.metadata
      : {};
    const failedSources = [
      ...(Array.isArray(metadata.failedSources) ? metadata.failedSources : []),
      String(avoidSource || sourceKeyFromTrack(finishedTrack) || "").trim(),
    ].filter(Boolean);
    const recoveryQuery = String(
      metadata.recoveryQuery || `${finishedTrack?.title || ""} ${finishedTrack?.author || ""}`,
    ).trim();
    if (!recoveryQuery) throw new Error("missing recovery query");
    logMusicThrottled("recovery_begin", guildId, {
      guildId,
      recoveryQuery,
      failedSources,
      from: getTrackDebugMeta(finishedTrack),
      attempt: getTrackRecoveryAttempts(guildId, finishedTrack),
    }, 5000);

    const recoveredResult = await runSearch(playerRef, {
      query: recoveryQuery,
      engine: QueryType.AUTO_SEARCH,
      translated: true,
      youtubeConvertible: false,
      avoidSources: failedSources,
    }, queue?.guild?.members?.me || null);
    const recoveredTrack = Array.isArray(recoveredResult?.tracks)
      ? recoveredResult.tracks[0]
      : null;
    if (!recoveredTrack) throw new Error("no recovered track");
    stampTrackMetadata(recoveredTrack, null, { recoveryQuery, failedSources });
    await queue.node.play(recoveredTrack);
    logMusic("recovery_success", {
      guildId,
      chosen: getTrackDebugMeta(recoveredTrack),
      failedSources,
      attempt: getTrackRecoveryAttempts(guildId, finishedTrack),
    });
    return recoveredTrack;
  } finally {
    if (guildId) recoveryInFlightByGuild.delete(guildId);
  }
}

function schedulePlaybackWatchdog(queue, client) {
  const guildId = String(queue?.guild?.id || "");
  if (!guildId) return;
  clearPlaybackWatchdog(guildId);

  const timer = setInterval(async () => {
    try {
      if (!queue || queue.deleted) {
        clearPlaybackWatchdog(guildId);
        return;
      }
      if (recoveryInFlightByGuild.get(guildId)) return;
      if (queue.isPlaying?.()) return;
      if (queue.node?.isPaused?.()) return;

      const currentTrack = queue.currentTrack || lastTrackSessionByGuild.get(guildId)?.track || null;
      const startedAt = Number(lastTrackSessionByGuild.get(guildId)?.startedAt || 0);
      if (!currentTrack || !startedAt) return;

      const elapsed = Date.now() - startedAt;
      if (elapsed < 15_000) return;

      const retryCount = getTrackRecoveryAttempts(guildId, currentTrack);
      logMusicThrottled("watchdog_stall", guildId, {
        guildId,
        elapsed,
        track: getTrackDebugMeta(currentTrack),
        pendingTracks: Number(queue?.tracks?.size || 0),
        playing: Boolean(queue.isPlaying?.()),
        retryCount,
      }, 15_000);
      if (retryCount >= MAX_TRACK_RECOVERY_ATTEMPTS) {
        clearPlaybackWatchdog(guildId);
        return;
      }
      incrementTrackRecoveryAttempts(guildId, currentTrack);
      await recoverTrackPlayback(queue, currentTrack, client, sourceKeyFromTrack(currentTrack));
    } catch (error) {
      global.logger?.warn?.("[MUSIC] Watchdog recovery failed:", guildId, error?.message || error);
    }
  }, 5000);

  playbackWatchdogsByGuild.set(guildId, timer);
}

function parseDeezerTrackId(url) {
  const match = String(url || "").match(/deezer\.com\/(?:[a-z]{2}\/)?track\/(\d+)/i);
  return match ? String(match[1]) : null;
}

function parseAppleTrackId(url) {
  const raw = String(url || "");
  const idMatch = raw.match(/\/song\/[^/]+\/(\d+)/i);
  if (idMatch) return String(idMatch[1]);
  const iMatch = raw.match(/[?&]i=(\d+)/i);
  if (iMatch) return String(iMatch[1]);
  return null;
}

function parseSpotifyUrl(url) {
  const raw = String(url || "").trim();
  const match = raw.match(/spotify\.com\/(track|playlist|album)\/([A-Za-z0-9]+)(?:\?|$)/i);
  if (!match) return null;
  return {
    type: String(match[1] || "").toLowerCase(),
    id: String(match[2] || "").trim(),
  };
}

function makeCatalogTrackCandidate(payload = {}) {
  return {
    title: String(payload.title || "").trim(),
    author: String(payload.author || "").trim(),
    url: String(payload.url || "").trim(),
    source: String(payload.source || "").trim(),
    resolverInput: String(payload.resolverInput || payload.url || "").trim(),
    durationMS: Math.max(0, Number(payload.durationMS || 0)),
    thumbnail: String(payload.thumbnail || "").trim(),
    catalogOnly: true,
  };
}

async function deezerToSearchQuery(url) {
  const trackId = parseDeezerTrackId(url);
  if (!trackId) return null;
  const response = await axios
    .get(`https://api.deezer.com/track/${encodeURIComponent(trackId)}`, {
      timeout: 12000,
    })
    .catch(() => null);
  const track = response?.data;
  if (!track?.title) return null;
  const artist = String(track?.artist?.name || "").trim();
  return [track.title, artist].filter(Boolean).join(" ");
}

async function appleMusicToSearchQuery(url) {
  const trackId = parseAppleTrackId(url);
  if (!trackId) return null;
  const response = await axios
    .get("https://itunes.apple.com/lookup", {
      params: { id: trackId, entity: "song" },
      timeout: 12000,
    })
    .catch(() => null);
  const song = Array.isArray(response?.data?.results)
    ? response.data.results.find((item) => item?.kind === "song")
    : null;
  if (!song?.trackName) return null;
  return [song.trackName, song.artistName].filter(Boolean).join(" ");
}

async function appleMusicTrackToCatalog(url) {
  const trackId = parseAppleTrackId(url);
  if (!trackId) return null;
  const response = await axios
    .get("https://itunes.apple.com/lookup", {
      params: { id: trackId, entity: "song" },
      timeout: 12000,
    })
    .catch(() => null);
  const song = Array.isArray(response?.data?.results)
    ? response.data.results.find((item) => item?.kind === "song")
    : null;
  if (!song?.trackName || !song?.artistName) return null;
  return makeCatalogTrackCandidate({
    title: song.trackName,
    author: song.artistName,
    url: song.trackViewUrl || url,
    source: "apple",
    resolverInput: `${String(song.trackName || "").trim()} ${String(song.artistName || "").trim()}`.trim(),
    durationMS: Number(song.trackTimeMillis || 0),
    thumbnail: String(song.artworkUrl100 || "").trim(),
  });
}

async function spotifyUrlToCatalog(url) {
  const parsed = parseSpotifyUrl(url);
  if (!parsed?.id || !parsed?.type) return null;
  const token = await getSpotifyApiToken().catch(() => null);
  if (!token) return null;

  const headers = { Authorization: `Bearer ${token}` };
  if (parsed.type === "track") {
    const response = await axios
      .get(`https://api.spotify.com/v1/tracks/${encodeURIComponent(parsed.id)}`, {
        headers,
        params: { market: "IT" },
        timeout: 12000,
      })
      .catch(() => null);
    const row = response?.data;
    if (!row?.name) return null;
    return {
      tracks: [
        makeCatalogTrackCandidate({
          title: row.name,
          author: Array.isArray(row.artists)
            ? row.artists.map((artist) => String(artist?.name || "").trim()).filter(Boolean).join(", ")
            : "",
          url: row?.external_urls?.spotify || url,
          source: "spotify",
          resolverInput: row?.external_urls?.spotify || url,
          durationMS: Number(row?.duration_ms || 0),
          thumbnail: Array.isArray(row?.album?.images) && row.album.images[0]?.url
            ? String(row.album.images[0].url).trim()
            : "",
        }),
      ],
      playlist: null,
    };
  }

  if (parsed.type === "playlist") {
    const response = await axios
      .get(`https://api.spotify.com/v1/playlists/${encodeURIComponent(parsed.id)}`, {
        headers,
        params: {
          market: "IT",
          fields: "name,external_urls,images,tracks.items(track(name,duration_ms,external_urls,artists(name),album(images)))",
        },
        timeout: 15000,
      })
      .catch(() => null);
    const playlist = response?.data;
    const items = Array.isArray(playlist?.tracks?.items) ? playlist.tracks.items : [];
    const tracks = items
      .map((item) => item?.track)
      .filter((row) => row?.name)
      .map((row) =>
        makeCatalogTrackCandidate({
          title: row.name,
          author: Array.isArray(row.artists)
            ? row.artists.map((artist) => String(artist?.name || "").trim()).filter(Boolean).join(", ")
            : "",
          url: row?.external_urls?.spotify || "",
          source: "spotify",
          resolverInput: row?.external_urls?.spotify || "",
          durationMS: Number(row?.duration_ms || 0),
          thumbnail: Array.isArray(row?.album?.images) && row.album.images[0]?.url
            ? String(row.album.images[0].url).trim()
            : "",
        }),
      )
      .filter((track) => track.title && track.author);
    if (!tracks.length) return null;
    return {
      tracks,
      playlist: {
        title: String(playlist?.name || "Spotify Playlist").trim(),
        url: String(playlist?.external_urls?.spotify || url).trim(),
        tracks,
      },
    };
  }

  if (parsed.type === "album") {
    const response = await axios
      .get(`https://api.spotify.com/v1/albums/${encodeURIComponent(parsed.id)}`, {
        headers,
        params: { market: "IT" },
        timeout: 15000,
      })
      .catch(() => null);
    const album = response?.data;
    const items = Array.isArray(album?.tracks?.items) ? album.tracks.items : [];
    const tracks = items
      .map((row) =>
        makeCatalogTrackCandidate({
          title: row?.name,
          author: Array.isArray(row?.artists)
            ? row.artists.map((artist) => String(artist?.name || "").trim()).filter(Boolean).join(", ")
            : "",
          url: row?.external_urls?.spotify || "",
          source: "spotify",
          resolverInput: row?.external_urls?.spotify || `${String(row?.name || "").trim()} ${
            Array.isArray(row?.artists)
              ? row.artists.map((artist) => String(artist?.name || "").trim()).filter(Boolean).join(" ")
              : ""
          }`.trim(),
          durationMS: Number(row?.duration_ms || 0),
          thumbnail: Array.isArray(album?.images) && album.images[0]?.url
            ? String(album.images[0].url).trim()
            : "",
        }),
      )
      .filter((track) => track.title && track.author);
    if (!tracks.length) return null;
    return {
      tracks,
      playlist: {
        title: String(album?.name || "Spotify Album").trim(),
        url: String(album?.external_urls?.spotify || url).trim(),
        tracks,
      },
    };
  }

  return null;
}

async function searchPublicCatalogCandidates(query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery || /^https?:\/\//i.test(String(query || ""))) return [];

  const spotifyToken = await getSpotifyApiToken().catch(() => null);
  const settled = await Promise.allSettled([
    axios.get("https://api.deezer.com/search", {
      params: { q: query, limit: 10 },
      timeout: 12000,
    }),
    axios.get("https://itunes.apple.com/search", {
      params: {
        term: query,
        entity: "song",
        limit: 10,
      },
      timeout: 12000,
    }),
    spotifyToken
      ? axios.get("https://api.spotify.com/v1/search", {
          params: {
            q: query,
            type: "track",
            limit: 10,
            market: "IT",
          },
          headers: {
            Authorization: `Bearer ${spotifyToken}`,
          },
          timeout: 12000,
        })
      : Promise.resolve(null),
  ]);

  const deezerRows = settled[0]?.status === "fulfilled" && Array.isArray(settled[0]?.value?.data?.data)
    ? settled[0].value.data.data
    : [];
  const appleRows = settled[1]?.status === "fulfilled" && Array.isArray(settled[1]?.value?.data?.results)
    ? settled[1].value.data.results
    : [];
  const spotifyRows =
    settled[2]?.status === "fulfilled" && Array.isArray(settled[2]?.value?.data?.tracks?.items)
      ? settled[2].value.data.tracks.items
      : [];

  const catalog = [
    ...deezerRows.map((row) => ({
      title: String(row?.title || "").trim(),
      author: String(row?.artist?.name || "").trim(),
      url: String(row?.link || "").trim(),
      source: "deezer",
      resolverInput: String(row?.link || "").trim(),
      durationMS: Math.max(0, Number(row?.duration || 0) * 1000),
      thumbnail: String(row?.album?.cover_medium || row?.album?.cover || "").trim(),
    })),
    ...appleRows.map((row) => ({
      title: String(row?.trackName || "").trim(),
      author: String(row?.artistName || "").trim(),
      url: String(row?.trackViewUrl || "").trim(),
      source: "apple",
      resolverInput: `${String(row?.trackName || "").trim()} ${String(row?.artistName || "").trim()}`.trim(),
      durationMS: Math.max(0, Number(row?.trackTimeMillis || 0)),
      thumbnail: String(row?.artworkUrl100 || "").trim(),
    })),
    ...spotifyRows.map((row) => ({
      title: String(row?.name || "").trim(),
      author: Array.isArray(row?.artists)
        ? row.artists.map((artist) => String(artist?.name || "").trim()).filter(Boolean).join(", ")
        : "",
      url: String(row?.external_urls?.spotify || "").trim(),
      source: "spotify",
      resolverInput: String(row?.external_urls?.spotify || "").trim() ||
        `${String(row?.name || "").trim()} ${
          Array.isArray(row?.artists)
            ? row.artists.map((artist) => String(artist?.name || "").trim()).filter(Boolean).join(" ")
            : ""
        }`.trim(),
      durationMS: Math.max(0, Number(row?.duration_ms || 0)),
      thumbnail: Array.isArray(row?.album?.images) && row.album.images[0]?.url
        ? String(row.album.images[0].url).trim()
        : "",
    })),
  ]
    .filter((item) => item.title && item.author)
    .filter((item) => !isPodcastLikeTrack(item))
    .map((item) => ({
      ...item,
      catalogOnly: true,
      score: scoreTrackCandidate(item, query, { key: item.source, bias: item.source === "deezer" ? 22 : 18 }),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.author || "").localeCompare(String(b.author || ""));
    });

  const seen = new Set();
  return catalog.filter((item) => {
    const identity = `${item.source}:${normalizeText(item.title)}:${normalizeText(item.author)}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

async function resolveSearchInput(input) {
  const query = cleanQuery(input);
  if (!query) return {
    query: "",
    engine: QueryType.AUTO_SEARCH,
    translated: false,
    youtubeConvertible: false,
  };

  if (/spotify\.com\//i.test(query)) {
    const directSpotify = await spotifyUrlToCatalog(query);
    if (directSpotify?.tracks?.length) {
      return {
        query,
        engine: QueryType.AUTO,
        translated: false,
        youtubeConvertible: false,
        directCatalogResult: directSpotify,
      };
    }
  }

  if (/deezer\.com\/(?:[a-z]{2}\/)?track\/\d+/i.test(query)) {
    return { query, engine: QueryType.AUTO, translated: false, youtubeConvertible: false };
  }

  if (/music\.apple\.com\//i.test(query)) {
    const directApple = await appleMusicTrackToCatalog(query);
    if (directApple) {
      return {
        query,
        engine: QueryType.AUTO_SEARCH,
        translated: true,
        youtubeConvertible: false,
        directCatalogResult: {
          tracks: [directApple],
          playlist: null,
        },
      };
    }
    const mapped = await appleMusicToSearchQuery(query);
    if (mapped) {
      return { query: mapped, engine: QueryType.AUTO_SEARCH, translated: true, youtubeConvertible: false };
    }
  }

  if (isSoundCloudUrl(query)) {
    return {
      query,
      engine: QueryType.AUTO,
      translated: false,
      youtubeConvertible: false,
      blockedSource: "soundcloud",
    };
  }

  return {
    query,
    engine: /^https?:\/\//i.test(query) ? QueryType.AUTO : QueryType.AUTO_SEARCH,
    translated: false,
    youtubeConvertible: isYouTubeVideoUrl(query),
  };
}

async function getPlayer(client) {
  if (client.musicPlayer) return client.musicPlayer;

  if (!playerInitPromise) {
    playerInitPromise = (async () => {
      const player = new Player(client, {
        skipFFmpeg: false,
      });
      await player.extractors.loadMulti(DefaultExtractors);

      player.events.on("error", (queue, error) => {
        global.logger?.error?.(
          "[MUSIC] queue error:",
          queue?.guild?.id || "unknown",
          error?.message || error,
        );
      });
      player.events.on("playerError", async (queue, error, track) => {
        const guildId = String(queue?.guild?.id || "");
        if (guildId) lastPlayerErrorAtByGuild.set(guildId, Date.now());
        const session = guildId ? lastTrackSessionByGuild.get(guildId) : null;
        const elapsed = Math.max(0, Date.now() - Number(session?.startedAt || 0));
        global.logger?.error?.(
          "[MUSIC] player error:",
          queue?.guild?.id || "unknown",
          track?.title || "unknown",
          error?.message || error,
        );
        logMusic("player_error", {
          guildId,
          elapsed,
          retryCount: getTrackRecoveryAttempts(guildId, track),
          track: getTrackDebugMeta(track),
          message: error?.message || String(error || ""),
          pendingTracks: Number(queue?.tracks?.size || 0),
        });
        const retryCount = getTrackRecoveryAttempts(guildId, track);
        if (!guildId || !track || retryCount >= MAX_TRACK_RECOVERY_ATTEMPTS || recoveryInFlightByGuild.get(guildId)) return;
        try {
          incrementTrackRecoveryAttempts(guildId, track);
          await recoverTrackPlayback(queue, track, client, sourceKeyFromTrack(track));
        } catch (recoveryError) {
          global.logger?.warn?.("[MUSIC] player error recovery failed:", guildId, recoveryError?.message || recoveryError);
        }
      });
      player.events.on("playerStart", (queue) => {
        queue?.node?.setVolume?.(DEFAULT_MUSIC_VOLUME);
        const guildId = String(queue?.guild?.id || "");
        const previousTrack = guildId ? lastTrackSessionByGuild.get(guildId)?.track : null;
        const previousRecoveryKey = getTrackRecoveryKey(previousTrack);
        const currentRecoveryKey = getTrackRecoveryKey(queue?.currentTrack);
        if (guildId) lastPlayerStartAtByGuild.set(guildId, Date.now());
        if (guildId) recoveryInFlightByGuild.delete(guildId);
        if (guildId && currentRecoveryKey && previousRecoveryKey && currentRecoveryKey !== previousRecoveryKey) {
          finishRetryCountByGuild.delete(guildId);
          clearGuildRecoveryAttempts(guildId);
        }
        if (guildId && queue?.currentTrack) {
          lastTrackSessionByGuild.set(guildId, {
            track: queue.currentTrack,
            startedAt: Date.now(),
          });
        }
        logMusic("player_start", {
          guildId,
          volume: DEFAULT_MUSIC_VOLUME,
          pendingTracks: Number(queue?.tracks?.size || 0),
          track: getTrackDebugMeta(queue?.currentTrack),
        });
        clearInactivityTimer(queue?.guild?.id);
        clearEmptyVoiceTimer(queue?.guild?.id);
        schedulePlaybackWatchdog(queue, client);
      });
      player.events.on("playerFinish", async (queue, track) => {
        const guildId = String(queue?.guild?.id || "");
        if (guildId && recoveryInFlightByGuild.get(guildId)) return;
        const session = guildId ? lastTrackSessionByGuild.get(guildId) : null;
        const finishedTrack = track || session?.track || queue?.currentTrack || null;
        const elapsed = Math.max(0, Date.now() - Number(session?.startedAt || 0));
        logMusic("player_finish", {
          guildId,
          elapsed,
          pendingTracks: Number(queue?.tracks?.size || 0),
          track: getTrackDebugMeta(finishedTrack),
        });
        if (guildId && finishedTrack && shouldTreatAsEarlyFinish(finishedTrack, session?.startedAt)) {
          const retryCount = getTrackRecoveryAttempts(guildId, finishedTrack);
          if (retryCount < MAX_TRACK_RECOVERY_ATTEMPTS) {
            incrementTrackRecoveryAttempts(guildId, finishedTrack);
            global.logger?.warn?.("[MUSIC] Early finish detected, trying fresh recovery once:", guildId, finishedTrack?.title || "unknown");
            logMusicThrottled("player_finish_early", guildId, {
              guildId,
              elapsed,
              retryCount,
              track: getTrackDebugMeta(finishedTrack),
            }, 10_000);
            try {
              await recoverTrackPlayback(queue, finishedTrack, client, sourceKeyFromTrack(finishedTrack));
              return;
            } catch (error) {
              global.logger?.warn?.("[MUSIC] Early finish recovery failed:", guildId, error?.message || error);
            }
          }
        }
        if (guildId) {
          finishRetryCountByGuild.delete(guildId);
          lastTrackSessionByGuild.delete(guildId);
          clearGuildRecoveryAttempts(guildId);
        }
        clearPlaybackWatchdog(guildId);
        const pendingTracks = Number(queue?.tracks?.size || 0);
        if (pendingTracks > 0) return;
        await notifyQueueEnded(queue);
      });
      player.events.on("audioTrackAdd", (queue) => {
        clearInactivityTimer(queue?.guild?.id);
        clearEmptyVoiceTimer(queue?.guild?.id);
      });
      player.events.on("audioTracksAdd", (queue) => {
        clearInactivityTimer(queue?.guild?.id);
        clearEmptyVoiceTimer(queue?.guild?.id);
      });
      player.events.on("emptyQueue", async (queue) => {
        const guildId = String(queue?.guild?.id || "");
        if (!guildId) return;
        if (guildId && recoveryInFlightByGuild.get(guildId)) return;
        const now = Date.now();
        const lastStartAt = guildId ? Number(lastPlayerStartAtByGuild.get(guildId) || 0) : 0;
        const lastPlayerErrorAt = guildId ? Number(lastPlayerErrorAtByGuild.get(guildId) || 0) : 0;
        const session = lastTrackSessionByGuild.get(guildId) || null;
        const elapsed = Math.max(0, Date.now() - Number(session?.startedAt || 0));
        logMusicThrottled("empty_queue", guildId, {
          guildId,
          elapsed,
          pendingTracks: Number(queue?.tracks?.size || 0),
          currentTrack: getTrackDebugMeta(queue?.currentTrack || session?.track || null),
          lastStartDelta: lastStartAt ? now - lastStartAt : null,
          lastPlayerErrorDelta: lastPlayerErrorAt ? now - lastPlayerErrorAt : null,
        }, 15_000);
        if ((lastStartAt && now - lastStartAt < 15_000) || (lastPlayerErrorAt && now - lastPlayerErrorAt < 15_000)) return;
      });
      player.events.on("emptyChannel", (queue) => {
        scheduleEmptyVoiceLeave(queue);
      });
      player.events.on("channelPopulate", (queue) => {
        clearEmptyVoiceTimer(queue?.guild?.id);
      });
      player.events.on("disconnect", async (queue) => {
        const guildId = String(queue?.guild?.id || "");
        clearInactivityTimer(guildId);
        clearEmptyVoiceTimer(guildId);
        clearPlaybackWatchdog(guildId);
        clearVoiceSession(guildId);
        recoveryInFlightByGuild.delete(guildId);
        lastTrackSessionByGuild.delete(guildId);
        finishRetryCountByGuild.delete(guildId);
        clearGuildRecoveryAttempts(guildId);
        const now = Date.now();
        const manualLeaveAt = guildId ? Number(manualLeaveAtByGuild.get(guildId) || 0) : 0;
        if (manualLeaveAt && now - manualLeaveAt < 15_000) return;
        const lastEmptyAt = guildId ? Number(lastEmptyQueueAtByGuild.get(guildId) || 0) : 0;
        if (lastEmptyAt && now - lastEmptyAt < 8000) return;
        await sendQueueNotice(queue, "I have been kicked from the voice channel ☹️");
      });

      client.musicPlayer = player;
      return player;
    })().finally(() => {
      playerInitPromise = null;
    });
  }

  return playerInitPromise;
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
  const player = await getPlayer(client);
  const resolved = preResolved || await resolveSearchInput(input);

  if (!resolved.query) {
    return { ok: false, reason: "empty_query" };
  }
  const rawSearchResult = preSearchResult || await runSearch(player, resolved, requestedBy);
  const searchResult = await resolvePlayableSearchResult(player, rawSearchResult, requestedBy);

  if (!searchResult || !Array.isArray(searchResult.tracks) || !searchResult.tracks.length) {
    if (resolved?.youtubeConvertible) {
      return { ok: false, reason: "youtube_not_supported" };
    }
    if (resolved?.blockedSource === "soundcloud") {
      return { ok: false, reason: "blocked_source", source: "soundcloud" };
    }
    return { ok: false, reason: "not_found" };
  }

  const queue = player.nodes.create(guild, {
    metadata: { channel },
    leaveOnEmpty: false,
    leaveOnEmptyCooldown: 0,
    leaveOnEnd: false,
    leaveOnEndCooldown: 0,
    selfDeaf: true,
    volume: DEFAULT_MUSIC_VOLUME,
    connectionTimeout: 20_000,
  });
  queue.metadata = { ...(queue.metadata || {}), channel };
  queue.node.setVolume(DEFAULT_MUSIC_VOLUME);

  const currentSession = getVoiceSession(guild?.id);
  const shouldLeaveTts =
    currentSession?.mode === "tts" ||
    (!currentSession?.mode && !queue.connection);
  if (shouldLeaveTts) {
    await leaveTtsGuild(guild?.id, client).catch(() => null);
  }
  setVoiceSession(guild?.id, {
    mode: "music",
    channelId: voiceChannel?.id,
  });

  if (!queue.connection) {
    await queue.connect(voiceChannel);
  }

  logMusic("play_request", {
    guildId: guild?.id,
    channelId: channel?.id,
    voiceChannelId: voiceChannel?.id,
    query: input,
    resolvedQuery: resolved?.query,
    translated: Boolean(resolved?.translated),
    searchCount: searchResult?.tracks?.length || 0,
    first: searchResult?.tracks?.[0] ? getTrackDebugMeta(searchResult.tracks[0]) : null,
    hadConnection: Boolean(queue.connection),
    wasPlaying: Boolean(queue.isPlaying()),
  });

  clearInactivityTimer(guild?.id);

  const wasPlaying = queue.isPlaying();
  if (!wasPlaying) {
    if (searchResult.playlist) {
      const [firstTrack, ...restTracks] = searchResult.tracks;
      if (!firstTrack) return { ok: false, reason: "empty_queue" };
      stampTrackMetadata(firstTrack, requestedBy, {
        recoveryQuery: resolved.query,
      });
      for (const track of restTracks) {
        stampTrackMetadata(track, requestedBy, {
          recoveryQuery: `${track?.title || ""} ${track?.author || ""}`.trim(),
        });
      }
      if (restTracks.length) queue.addTrack(restTracks);
      await queue.node.play(firstTrack);
      return {
        ok: true,
        mode: "started",
        track: firstTrack,
        playlist: searchResult.playlist || null,
        translated: resolved.translated,
      };
    }
    const firstTrack = searchResult.tracks[0];
    if (!firstTrack) return { ok: false, reason: "empty_queue" };
    stampTrackMetadata(firstTrack, requestedBy, {
      recoveryQuery: resolved.query,
    });
    await queue.node.play(firstTrack);
    return {
      ok: true,
      mode: "started",
      track: firstTrack,
      playlist: searchResult.playlist || null,
      translated: resolved.translated,
    };
  }

  if (searchResult.playlist) {
    for (const track of searchResult.tracks) {
      stampTrackMetadata(track, requestedBy, {
        recoveryQuery: `${track?.title || ""} ${track?.author || ""}`.trim(),
      });
    }
    queue.addTrack(searchResult.tracks);
  } else {
    const single = searchResult.tracks[0];
    stampTrackMetadata(single, requestedBy, {
      recoveryQuery: resolved.query,
    });
    queue.addTrack(single);
  }

  return {
    ok: true,
    mode: "queued",
    track: searchResult.tracks[0],
    playlist: searchResult.playlist || null,
    translated: resolved.translated,
    queue,
    queueTrackCount: Number(queue?.tracks?.size || 0),
    queueTotalCount:
      Number(queue?.tracks?.size || 0) + (queue?.currentTrack ? 1 : 0),
    queuePosition:
      Number(
        typeof queue?.node?.getTrackPosition === "function"
          ? queue.node.getTrackPosition(searchResult.tracks[0])
          : -1,
      ) + 1,
    etaMs: (() => {
      const list = queueTracksToArray(queue);
      const pos =
        Number(
          typeof queue?.node?.getTrackPosition === "function"
            ? queue.node.getTrackPosition(searchResult.tracks[0])
            : -1,
        ) || 0;
      const currentTs = queue?.node?.getTimestamp?.();
      const currentRemaining =
        queue?.currentTrack
          ? Math.max(
            0,
            Number(currentTs?.total?.value || queue.currentTrack.durationMS || 0) -
            Number(currentTs?.current?.value || 0),
          )
          : 0;
      let wait = currentRemaining;
      for (let i = 0; i < pos; i += 1) {
        const item = list[i];
        wait += Math.max(0, Number(item?.durationMS || 0));
      }
      return wait;
    })(),
  };
}

async function searchPlayable({
  client,
  input,
  requestedBy,
}) {
  const player = await getPlayer(client);
  const resolved = await resolveSearchInput(input);
  if (!resolved.query) return { ok: false, reason: "empty_query" };
  if (resolved?.directCatalogResult?.tracks?.length) {
    logMusic("search_catalog_direct", {
      query: resolved.query,
      count: resolved.directCatalogResult.tracks.length,
      playlist: Boolean(resolved.directCatalogResult.playlist),
      top: resolved.directCatalogResult.tracks.slice(0, 5).map((item) => ({
        title: item.title,
        author: item.author,
        source: item.source,
        resolverInput: item.resolverInput,
      })),
    });
    return {
      ok: true,
      player,
      resolved,
      searchResult: resolved.directCatalogResult,
      catalogOnly: true,
    };
  }
  if (!resolved?.youtubeConvertible && (resolved?.engine === QueryType.AUTO_SEARCH || resolved?.translated)) {
    const catalogCandidates = await searchPublicCatalogCandidates(resolved.query).catch(() => []);
    if (catalogCandidates.length > 0) {
      logMusic("search_catalog_primary", {
        query: resolved.query,
        count: catalogCandidates.length,
        top: catalogCandidates.slice(0, 5).map((item) => ({
          title: item.title,
          author: item.author,
          source: item.source,
          resolverInput: item.resolverInput,
        })),
      });
      return {
        ok: true,
        player,
        resolved,
        searchResult: {
          tracks: catalogCandidates,
          playlist: null,
        },
        catalogOnly: true,
      };
    }
  }
  const searchResult = await runSearch(player, resolved, requestedBy);
  if (!searchResult || !Array.isArray(searchResult.tracks) || !searchResult.tracks.length) {
    if (resolved?.engine === QueryType.AUTO_SEARCH && !resolved?.youtubeConvertible) {
      const catalogCandidates = await searchPublicCatalogCandidates(resolved.query).catch(() => []);
      if (catalogCandidates.length > 0) {
        logMusic("search_catalog_fallback", {
          query: resolved.query,
          count: catalogCandidates.length,
          top: catalogCandidates.slice(0, 5).map((item) => ({
            title: item.title,
            author: item.author,
            source: item.source,
            resolverInput: item.resolverInput,
          })),
        });
        return {
          ok: true,
          player,
          resolved,
          searchResult: {
            tracks: catalogCandidates,
            playlist: null,
          },
          catalogOnly: true,
        };
      }
    }
    if (resolved?.youtubeConvertible) {
      return { ok: false, reason: "youtube_not_supported" };
    }
    if (resolved?.blockedSource === "soundcloud") {
      return { ok: false, reason: "blocked_source", source: "soundcloud" };
    }
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, player, resolved, searchResult };
}

async function touchMusicOutputChannel(client, guildId, channel) {
  const safeGuildId = String(guildId || "");
  if (!client?.musicPlayer || !safeGuildId || !channel) return false;
  const queue = client.musicPlayer.nodes.get(safeGuildId);
  if (!queue) return false;
  queue.metadata = { ...(queue.metadata || {}), channel };
  return true;
}

module.exports = {
  getPlayer,
  searchPlayable,
  touchMusicOutputChannel,
  playRequest,
};
