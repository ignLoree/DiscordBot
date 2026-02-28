const axios = require("axios");

const RADIO_API =
  "https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/IT";
const CACHE_TTL_MS = 10 * 60 * 1000;
const SUPPORTED_CODECS = new Set(["mp3", "aac", "aac+", "ogg", "opus", "flac", "mpeg"]);
const PLAYLIST_MIME_RE = /(mpegurl|x-mpegurl|scpls|pls|playlist|mpegurl)/i;
const AUDIO_MIME_RE = /^(audio\/|application\/(ogg|octet-stream)|video\/mp2t)/i;

let cache = {
  at: 0,
  stations: [],
};

function normalizeStationName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStation(row) {
  const name = normalizeStationName(row?.name || row?.stationuuid || "Radio");
  const state = normalizeStationName(row?.state || "");
  const city = normalizeStationName(row?.city || "");
  const streamUrl = String(row?.url_resolved || row?.url || "").trim();
  const codec = String(row?.codec || "").trim().toLowerCase();
  if (!name || !streamUrl) return null;
  if (!/^https?:\/\//i.test(streamUrl)) return null;
  if (codec && !SUPPORTED_CODECS.has(codec)) return null;
  return {
    id: String(row?.stationuuid || ""),
    name,
    state,
    city,
    streamUrl,
    homepage: String(row?.homepage || "").trim(),
    favicon: String(row?.favicon || "").trim(),
    codec,
    bitrate: Number(row?.bitrate || 0),
    votes: Number(row?.votes || 0),
    clickCount: Number(row?.clickcount || 0),
  };
}

function buildStationIdentity(station) {
  return [
    normalizeStationName(station?.name).toLowerCase(),
    normalizeStationName(station?.state).toLowerCase(),
    normalizeStationName(station?.city).toLowerCase(),
  ].join("|");
}

function compareStations(a, b) {
  const byState = String(a?.state || "").localeCompare(String(b?.state || ""), "it", { sensitivity: "base" });
  if (byState !== 0) return byState;
  const byName = String(a?.name || "").localeCompare(String(b?.name || ""), "it", { sensitivity: "base" });
  if (byName !== 0) return byName;
  const byCity = String(a?.city || "").localeCompare(String(b?.city || ""), "it", { sensitivity: "base" });
  if (byCity !== 0) return byCity;
  return Number(b?.votes || 0) - Number(a?.votes || 0);
}

async function fetchItalianStations() {
  const response = await axios.get(RADIO_API, {
    timeout: 20_000,
    params: {
      hidebroken: "true",
      order: "votes",
      reverse: "true",
    },
  });
  const rows = Array.isArray(response?.data) ? response.data : [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const station = normalizeStation(row);
    if (!station) continue;
    if (Number(row?.lastcheckok || 1) === 0) continue;
    const identity = buildStationIdentity(station);
    if (seen.has(identity)) continue;
    seen.add(identity);
    out.push(station);
  }
  out.sort(compareStations);
  return out;
}

async function getItalianStations({ force = false } = {}) {
  const now = Date.now();
  if (
    !force &&
    cache.at &&
    now - cache.at < CACHE_TTL_MS &&
    Array.isArray(cache.stations) &&
    cache.stations.length
  ) {
    return cache.stations;
  }
  const stations = await fetchItalianStations();
  cache = { at: now, stations };
  return stations;
}

function extractStreamUrlFromPlaylistBody(body = "") {
  const text = String(body || "");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("#")) continue;
    if (/^file\d+=/i.test(line)) {
      const value = line.split("=").slice(1).join("=").trim();
      if (/^https?:\/\//i.test(value)) return value;
    }
    if (/^https?:\/\//i.test(line)) return line;
  }
  return "";
}

async function resolvePlayableRadioUrl(url, depth = 0) {
  const target = String(url || "").trim();
  if (!/^https?:\/\//i.test(target) || depth > 2) return "";

  const response = await axios.get(target, {
    timeout: 12_000,
    maxRedirects: 5,
    responseType: "text",
    validateStatus: (status) => status >= 200 && status < 400,
    headers: {
      "User-Agent": "ViniliCaffeBot/1.0",
      Accept: "*/*",
      Range: "bytes=0-4096",
      "Icy-MetaData": "1",
    },
  }).catch(() => null);

  const finalUrl = String(response?.request?.res?.responseUrl || target).trim();
  const contentType = String(response?.headers?.["content-type"] || "").toLowerCase();

  if (AUDIO_MIME_RE.test(contentType) && finalUrl) {
    return finalUrl;
  }

  if (PLAYLIST_MIME_RE.test(contentType) || /\.m3u8?(?:$|\?)/i.test(finalUrl) || /\.pls(?:$|\?)/i.test(finalUrl)) {
    const nestedUrl = extractStreamUrlFromPlaylistBody(response?.data || "");
    if (!nestedUrl || nestedUrl === target) return "";
    return resolvePlayableRadioUrl(nestedUrl, depth + 1);
  }

  if (finalUrl && /\.(mp3|aac|ogg|opus|flac)(?:$|\?)/i.test(finalUrl)) {
    return finalUrl;
  }

  if (finalUrl && !/text\/html/i.test(contentType) && !contentType.includes("json")) {
    return finalUrl;
  }

  return "";
}

module.exports = {
  getItalianStations,
  resolvePlayableRadioUrl,
};
