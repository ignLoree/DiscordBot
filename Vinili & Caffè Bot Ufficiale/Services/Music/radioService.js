const axios = require("axios");

const RADIO_API =
  "https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/IT";
const CACHE_TTL_MS = 10 * 60 * 1000;

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
  const city = normalizeStationName(row?.state || row?.city || "");
  const streamUrl = String(row?.url_resolved || row?.url || "").trim();
  if (!name || !streamUrl) return null;
  if (!/^https?:\/\//i.test(streamUrl)) return null;
  return {
    id: String(row?.stationuuid || ""),
    name,
    city,
    streamUrl,
    homepage: String(row?.homepage || "").trim(),
    favicon: String(row?.favicon || "").trim(),
    codec: String(row?.codec || "").trim(),
    bitrate: Number(row?.bitrate || 0),
    votes: Number(row?.votes || 0),
  };
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
  for (const row of rows) {
    const station = normalizeStation(row);
    if (!station) continue;
    out.push(station);
  }
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

module.exports = {
  getItalianStations,
};

