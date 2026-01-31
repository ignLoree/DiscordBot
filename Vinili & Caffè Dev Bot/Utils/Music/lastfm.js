const axios = require("axios");
const crypto = require("crypto");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || "644ee34af30ba6f1dbfba9b811fddb3c";
const LASTFM_API_SECRET = process.env.LASTFM_API_SECRET || "e4f37b35e4c376db31e3cdb5293d3027";
const LASTFM_RATE_LIMIT_PER_SEC = Number(process.env.LASTFM_RATE_LIMIT_PER_SEC || 4);
const LASTFM_CACHE_TTL_MS = Number(process.env.LASTFM_CACHE_TTL_MS || 30000);
const LASTFM_USER_AGENT = process.env.LASTFM_USER_AGENT || "ViniliECaffeBot/1.0 (Last.fm API)";
const cacheStore = new Map();
let rateLimiterChain = Promise.resolve();
let nextAllowedAt = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function buildCacheKey(method, params) {
  const sortedEntries = Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  return String(method) + "|" + new URLSearchParams(sortedEntries).toString();
}
function getCachedResponse(cacheKey) {
  const cached = cacheStore.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cacheStore.delete(cacheKey);
    return null;
  }
  return cached.data;
}
function setCachedResponse(cacheKey, data, ttlMs) {
  if (!ttlMs || ttlMs <= 0) return;
  cacheStore.set(cacheKey, { data, expiresAt: Date.now() + ttlMs });
}
async function waitForRateLimit() {
  if (!LASTFM_RATE_LIMIT_PER_SEC || LASTFM_RATE_LIMIT_PER_SEC <= 0) return;
  const minIntervalMs = Math.ceil(1000 / LASTFM_RATE_LIMIT_PER_SEC);
  rateLimiterChain = rateLimiterChain.then(async () => {
    const now = Date.now();
    const scheduledAt = Math.max(now, nextAllowedAt);
    nextAllowedAt = scheduledAt + minIntervalMs;
    const delay = scheduledAt - now;
    if (delay > 0) {
      await sleep(delay);
    }
  });
  return rateLimiterChain;
}
const DEFAULT_EMBED_COLOR = "#BA0000";
function buildLastFmUrl(path) {
  return "https://www.last.fm/" + path.replace(/^\/+/, "");
}
function buildUserUrl(username) {
  return buildLastFmUrl("user/" + encodeURIComponent(username));
}
function buildArtistUrl(artist) {
  return buildLastFmUrl("music/" + encodeURIComponent(artist));
}
function buildAlbumUrl(artist, album) {
  return buildLastFmUrl("music/" + encodeURIComponent(artist) + "/" + encodeURIComponent(album));
}
function buildTrackUrl(artist, track) {
  return buildLastFmUrl("music/" + encodeURIComponent(artist) + "/_/" + encodeURIComponent(track));
}
function sanitizeLastFmParams(params) {
  const redacted = new Set(["api_key", "api_sig", "sk", "token", "password", "session", "session_key"]);
  const safe = {};
  for (const [key, value] of Object.entries(params || {})) {
    safe[key] = redacted.has(key) ? "***" : value;
  }
  return safe;
}
function logLastFmError({ context, method, params, status, code, message }) {
  const logger = global?.logger || console;
  const payload = {
    context,
    method,
    params: sanitizeLastFmParams(params),
    status,
    code,
    message
  };
  if (logger?.warn) {
    logger.warn("[LASTFM ERROR]", payload);
  } else {
    console.warn("[LASTFM ERROR]", payload);
  }
}
async function lastFmRequest(method, params = {}, options = {}) {
  if (!LASTFM_API_KEY) {
    throw new Error("Last.fm API key not configured");
  }
  const cacheTtlMs = Number.isFinite(options.cacheTtlMs)
    ? Number(options.cacheTtlMs)
    : LASTFM_CACHE_TTL_MS;
  const cacheKey = buildCacheKey(method, params);
  const cached = getCachedResponse(cacheKey);
  if (cached) return cached;
  const query = new URLSearchParams({
    method,
    api_key: LASTFM_API_KEY,
    format: "json",
    ...params
  });
  const url = "https://ws.audioscrobbler.com/2.0/?" + query.toString();
  await waitForRateLimit();
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": LASTFM_USER_AGENT
      },
      timeout: Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : undefined
    });
    if (data?.error) {
      logLastFmError({
        context: "lastFmRequest",
        method,
        params,
        status: 200,
        code: data.error || "Failure",
        message: data.message || "Failure"
      });
      const err = new Error(data.message || "Last.fm error");
      err.name = "LastFmRequestError";
      err.lastfmCode = data.error || "Failure";
      err.lastfmMessage = data.message || "Failure";
      throw err;
    }
    setCachedResponse(cacheKey, data, cacheTtlMs);
    return data;
  } catch (error) {
    if (error?.name === "LastFmRequestError") throw error;
    logLastFmError({
      context: "lastFmRequest",
      method,
      params,
      status: error?.response?.status,
      code: error?.response?.data?.error || "Failure",
      message: error?.response?.data?.message || error?.message || "Failure"
    });
    const err = new Error("Last.fm request failed");
    err.name = "LastFmRequestError";
    err.lastfmCode = error?.response?.data?.error || "Failure";
    err.lastfmMessage = error?.response?.data?.message || "Failure";
    throw err;
  }
}
function buildApiSignature(params) {
  if (!LASTFM_API_SECRET) return null;
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => String(key) + String(value))
    .join("");
  const signatureBase = String(entries) + String(LASTFM_API_SECRET);
  return crypto.createHash("md5").update(signatureBase).digest("hex");
}
async function lastFmAuthedRequest(method, params = {}) {
  if (!LASTFM_API_KEY) {
    throw new Error("<:vegax:1443934876440068179> Last.fm API key not configured");
  }
  if (!LASTFM_API_SECRET) {
    throw new Error("<:vegax:1443934876440068179> Last.fm API secret not configured");
  }
  const signedParams = {
    ...params,
    method,
    api_key: LASTFM_API_KEY
  };
  const cleanedParams = Object.fromEntries(
    Object.entries(signedParams).filter(([, value]) => value !== undefined && value !== null)
  );
  const apiSig = buildApiSignature(cleanedParams);
  const body = new URLSearchParams({
    ...cleanedParams,
    api_sig: apiSig,
    format: "json"
  });
  await waitForRateLimit();
  try {
    const { data } = await axios.post("https://ws.audioscrobbler.com/2.0/", body.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": LASTFM_USER_AGENT
      }
    });
    if (data?.error) {
      logLastFmError({
        context: "lastFmAuthedRequest",
        method,
        params,
        status: 200,
        code: data.error || "Failure",
        message: data.message || "Failure"
      });
      const err = new Error(data.message || "Last.fm error");
      err.name = "LastFmRequestError";
      err.lastfmCode = data.error || "Failure";
      err.lastfmMessage = data.message || "Failure";
      throw err;
    }
    return data;
  } catch (error) {
    if (error?.name === "LastFmRequestError") throw error;
    logLastFmError({
      context: "lastFmAuthedRequest",
      method,
      params,
      status: error?.response?.status,
      code: error?.response?.data?.error || "Failure",
      message: error?.response?.data?.message || error?.message || "Failure"
    });
    const err = new Error("Last.fm request failed");
    err.name = "LastFmRequestError";
    err.lastfmCode = error?.response?.data?.error || "Failure";
    err.lastfmMessage = error?.response?.data?.message || "Failure";
    throw err;
  }
}
async function getLastFmUserByDiscordId(discordId) {
  return LastFmUser.findOne({ discordId });
}
function formatNumber(value, format) {
  if (value === null || value === undefined) return "0";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  if (format === "compact") {
    return number.toLocaleString("it-IT", { notation: "compact", maximumFractionDigits: 1 });
  }
  return number.toLocaleString("it-IT");
}
function normalizePeriod(period) {
  const allowed = new Set(["7day", "1month", "3month", "6month", "12month", "overall"]);
  return allowed.has(period) ? period : "7day";
}
async function getWhoKnowsArtist(artist) {
  const users = await LastFmUser.find({
    lastFmUsername: { $exists: true, $ne: "" },
    privacyGlobal: true
  }).lean();
  if (!users.length) return [];
  const results = [];
  for (const user of users) {
    try {
      const data = await lastFmRequest("artist.getInfo", {
        artist,
        username: user.lastFmUsername
      });
      const playcount = Number(
        data?.artist?.stats?.userplaycount || 0
      );
      if (playcount > 0) {
        results.push({
          username: user.lastFmUsername,
          plays: playcount,
          image:
            data?.artist?.image?.find(i => i.size === "extralarge")?.["#text"] ||
            null
        });
      }
    } catch {
    }
  }
  results.sort((a, b) => b.plays - a.plays);
  return results;
}

module.exports = { DEFAULT_EMBED_COLOR, LASTFM_API_KEY, LASTFM_API_SECRET, lastFmRequest, lastFmAuthedRequest, buildLastFmUrl, buildUserUrl, buildArtistUrl, buildAlbumUrl, buildTrackUrl, getLastFmUserByDiscordId, formatNumber, normalizePeriod, getWhoKnowsArtist };





