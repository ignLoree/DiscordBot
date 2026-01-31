const axios = require("axios");
const MUSICBRAINZ_USER_AGENT = process.env.MUSICBRAINZ_USER_AGENT || "ViniliECaffeBot/1.0 (contact: corvaglialorenzo02@icloud.com)";
const MUSICBRAINZ_RATE_LIMIT_MS = Number(process.env.MUSICBRAINZ_RATE_LIMIT_MS || 1100);
const MUSICBRAINZ_CACHE_TTL_MS = Number(process.env.MUSICBRAINZ_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000);

const cache = new Map();
let chain = Promise.resolve();
let nextAllowedAt = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForRateLimit() {
  if (!MUSICBRAINZ_RATE_LIMIT_MS || MUSICBRAINZ_RATE_LIMIT_MS <= 0) return;
  chain = chain.then(async () => {
    const now = Date.now();
    const scheduledAt = Math.max(now, nextAllowedAt);
    nextAllowedAt = scheduledAt + MUSICBRAINZ_RATE_LIMIT_MS;
    const delay = scheduledAt - now;
    if (delay > 0) await sleep(delay);
  });
  return chain;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function mapCountryCode(code) {
  const upper = String(code || "").toUpperCase();
  if (upper === "US") return "United States";
  if (upper === "GB") return "United Kingdom";
  return null;
}

function isCountryArea(area) {
  return String(area?.type || "").toLowerCase() === "country";
}

async function getMusicBrainzArtistCountry(artistName) {
  const key = normalizeName(artistName);
  if (!key) return null;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  await waitForRateLimit();
  try {
    const query = `artist:"${artistName.replace(/"/g, "")}"`;
    const { data } = await axios.get("https://musicbrainz.org/ws/2/artist", {
      params: { query, limit: 5, fmt: "json" },
      headers: { "User-Agent": MUSICBRAINZ_USER_AGENT }
    });

    const results = Array.isArray(data?.artists) ? data.artists : [];
    if (!results.length) {
      cache.set(key, { value: null, expiresAt: Date.now() + MUSICBRAINZ_CACHE_TTL_MS });
      return null;
    }

    const exact = results.find(item => normalizeName(item.name) === key);
    const best = exact || results[0];
    const mapped = mapCountryCode(best?.country) || null;
    const areaName = isCountryArea(best?.area) ? best?.area?.name : null;
    const resolved = mapped || areaName || null;

    cache.set(key, { value: resolved, expiresAt: Date.now() + MUSICBRAINZ_CACHE_TTL_MS });
    return resolved;
  } catch (error) {
    const logger = global?.logger || console;
    if (logger?.warn) {
      logger.warn("[MUSICBRAINZ ERROR]", { artist: artistName, message: error?.message });
    }
    cache.set(key, { value: null, expiresAt: Date.now() + 10 * 60 * 1000 });
    return null;
  }
}


const detailsCache = new Map();
const linksCache = new Map();
const imageCache = new Map();

function mapGender(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return null;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

async function getMusicBrainzArtistDetails(artistName) {
  const key = normalizeName(artistName);
  if (!key) return null;
  const cached = detailsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  await waitForRateLimit();
  try {
    const query = `artist:"${artistName.replace(/"/g, "")}"`;
    const { data } = await axios.get("https://musicbrainz.org/ws/2/artist", {
      params: { query, limit: 5, fmt: "json" },
      headers: { "User-Agent": MUSICBRAINZ_USER_AGENT }
    });

    const results = Array.isArray(data?.artists) ? data.artists : [];
    if (!results.length) {
      detailsCache.set(key, { value: null, expiresAt: Date.now() + MUSICBRAINZ_CACHE_TTL_MS });
      return null;
    }

    const exact = results.find(item => normalizeName(item.name) === key);
    const best = exact || results[0];
    const details = {
      name: best?.name || null,
      type: best?.type || null,
      gender: mapGender(best?.gender) || null,
      country: mapCountryCode(best?.country) || best?.country || null,
      area: isCountryArea(best?.area) ? best?.area?.name : (best?.area?.name || null),
      begin: best?.["life-span"]?.begin || null
    };

    detailsCache.set(key, { value: details, expiresAt: Date.now() + MUSICBRAINZ_CACHE_TTL_MS });
    return details;
  } catch (error) {
    const logger = global?.logger || console;
    if (logger?.warn) {
      logger.warn("[MUSICBRAINZ ERROR]", { artist: artistName, message: error?.message });
    }
    detailsCache.set(key, { value: null, expiresAt: Date.now() + 10 * 60 * 1000 });
    return null;
  }
}

function normalizeLink(url) {
  const value = String(url || "").trim();
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value.replace(/^\/\//, "")}`;
}

function pickUrl(links, matchers) {
  const found = links.find(link => matchers.some(match => match(link)));
  return found || null;
}

async function getMusicBrainzArtistLinks(artistName) {
  const key = normalizeName(artistName);
  if (!key) return null;
  const cached = linksCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  await waitForRateLimit();
  try {
    const query = `artist:"${artistName.replace(/"/g, "")}"`;
    const search = await axios.get("https://musicbrainz.org/ws/2/artist", {
      params: { query, limit: 5, fmt: "json" },
      headers: { "User-Agent": MUSICBRAINZ_USER_AGENT }
    });
    const results = Array.isArray(search?.data?.artists) ? search.data.artists : [];
    if (!results.length) {
      linksCache.set(key, { value: null, expiresAt: Date.now() + MUSICBRAINZ_CACHE_TTL_MS });
      return null;
    }
    const exact = results.find(item => normalizeName(item.name) === key);
    const best = exact || results[0];
    if (!best?.id) {
      linksCache.set(key, { value: null, expiresAt: Date.now() + MUSICBRAINZ_CACHE_TTL_MS });
      return null;
    }

    await waitForRateLimit();
    const detail = await axios.get(`https://musicbrainz.org/ws/2/artist/${best.id}`, {
      params: { inc: "url-rels", fmt: "json" },
      headers: { "User-Agent": MUSICBRAINZ_USER_AGENT }
    });
    const relations = Array.isArray(detail?.data?.relations) ? detail.data.relations : [];
    const urls = relations
      .map(rel => normalizeLink(rel?.url?.resource))
      .filter(Boolean);

    const spotify = pickUrl(urls, [
      link => link.includes("open.spotify.com/artist/")
    ]);
    const appleMusic = pickUrl(urls, [
      link => link.includes("music.apple.com/"),
      link => link.includes("itunes.apple.com/")
    ]);
    const instagram = pickUrl(urls, [
      link => link.includes("instagram.com/")
    ]);
    const twitter = pickUrl(urls, [
      link => link.includes("twitter.com/"),
      link => link.includes("x.com/")
    ]);

    const value = { spotify, appleMusic, instagram, twitter };
    linksCache.set(key, { value, expiresAt: Date.now() + MUSICBRAINZ_CACHE_TTL_MS });
    return value;
  } catch (error) {
    const logger = global?.logger || console;
    if (logger?.warn) {
      logger.warn("[MUSICBRAINZ ERROR]", { artist: artistName, message: error?.message });
    }
    linksCache.set(key, { value: null, expiresAt: Date.now() + 10 * 60 * 1000 });
    return null;
  }
}

function getCachedImage(key) {
  const cached = imageCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  return null;
}

function setCachedImage(key, value, ttl = MUSICBRAINZ_CACHE_TTL_MS) {
  imageCache.set(key, { value, expiresAt: Date.now() + ttl });
}

function normalizeFilename(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return null;
  return cleaned.replace(/^File:/i, "").replace(/ /g, "_");
}

function buildCommonsImageUrl(filename, width = 1200) {
  const normalized = normalizeFilename(filename);
  if (!normalized) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(normalized)}?width=${width}`;
}

async function fetchBestArtistMatch(artistName) {
  await waitForRateLimit();
  const query = `artist:\"${artistName.replace(/\"/g, "")}\"`;
  const { data } = await axios.get("https://musicbrainz.org/ws/2/artist", {
    params: { query, limit: 5, fmt: "json" },
    headers: { "User-Agent": MUSICBRAINZ_USER_AGENT }
  });
  const results = Array.isArray(data?.artists) ? data.artists : [];
  if (!results.length) return null;
  const key = normalizeName(artistName);
  const exact = results.find(item => normalizeName(item.name) === key);
  return exact || results[0];
}

async function getMusicBrainzArtistImage(artistName) {
  const key = `artist:${normalizeName(artistName)}`;
  if (!key) return null;
  const cached = getCachedImage(key);
  if (cached !== null && cached !== undefined) return cached;
  try {
    const best = await fetchBestArtistMatch(artistName);
    if (!best?.id) {
      setCachedImage(key, null);
      return null;
    }
    await waitForRateLimit();
    const detail = await axios.get(`https://musicbrainz.org/ws/2/artist/${best.id}`, {
      params: { inc: "url-rels", fmt: "json" },
      headers: { "User-Agent": MUSICBRAINZ_USER_AGENT }
    });
    const relations = Array.isArray(detail?.data?.relations) ? detail.data.relations : [];
    const wikidata = relations
      .map(rel => normalizeLink(rel?.url?.resource))
      .find(link => link && link.includes("wikidata.org/wiki/"));
    const wikidataId = wikidata ? (wikidata.match(/wikidata\.org\/wiki\/(Q\d+)/) || [])[1] : null;
    if (!wikidataId) {
      setCachedImage(key, null);
      return null;
    }
    const wiki = await axios.get(`https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`);
    const entity = wiki?.data?.entities?.[wikidataId];
    const claim = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || null;
    const imageUrl = buildCommonsImageUrl(claim);
    setCachedImage(key, imageUrl);
    return imageUrl;
  } catch (error) {
    const logger = global?.logger || console;
    if (logger?.warn) {
      logger.warn("[MUSICBRAINZ IMAGE ERROR]", { artist: artistName, message: error?.message });
    }
    setCachedImage(key, null, 10 * 60 * 1000);
    return null;
  }
}

async function getMusicBrainzAlbumImage(artistName, albumName) {
  const key = `album:${normalizeName(artistName)}:${normalizeName(albumName)}`;
  if (!key) return null;
  const cached = getCachedImage(key);
  if (cached !== null && cached !== undefined) return cached;
  try {
    await waitForRateLimit();
    const query = `releasegroup:\"${albumName.replace(/\"/g, "")}\" AND artist:\"${artistName.replace(/\"/g, "")}\"`;
    const { data } = await axios.get("https://musicbrainz.org/ws/2/release-group", {
      params: { query, limit: 5, fmt: "json" },
      headers: { "User-Agent": MUSICBRAINZ_USER_AGENT }
    });
    const results = Array.isArray(data?.["release-groups"]) ? data["release-groups"] : [];
    if (!results.length) {
      setCachedImage(key, null);
      return null;
    }
    const albumKey = normalizeName(albumName);
    const exact = results.find(item => normalizeName(item.title) === albumKey);
    const best = exact || results[0];
    const imageUrl = best?.id ? `https://coverartarchive.org/release-group/${best.id}/front-500` : null;
    setCachedImage(key, imageUrl);
    return imageUrl;
  } catch (error) {
    const logger = global?.logger || console;
    if (logger?.warn) {
      logger.warn("[MUSICBRAINZ IMAGE ERROR]", { artist: artistName, album: albumName, message: error?.message });
    }
    setCachedImage(key, null, 10 * 60 * 1000);
    return null;
  }
}

async function getMusicBrainzTrackImage(artistName, trackName) {
  const key = `track:${normalizeName(artistName)}:${normalizeName(trackName)}`;
  if (!key) return null;
  const cached = getCachedImage(key);
  if (cached !== null && cached !== undefined) return cached;
  try {
    await waitForRateLimit();
    const query = `recording:\"${trackName.replace(/\"/g, "")}\" AND artist:\"${artistName.replace(/\"/g, "")}\"`;
    const { data } = await axios.get("https://musicbrainz.org/ws/2/recording", {
      params: { query, limit: 5, fmt: "json", inc: "releases" },
      headers: { "User-Agent": MUSICBRAINZ_USER_AGENT }
    });
    const results = Array.isArray(data?.recordings) ? data.recordings : [];
    if (!results.length) {
      setCachedImage(key, null);
      return null;
    }
    const trackKey = normalizeName(trackName);
    const exact = results.find(item => normalizeName(item.title) === trackKey);
    const best = exact || results[0];
    const releaseId = best?.releases?.[0]?.id || null;
    const imageUrl = releaseId ? `https://coverartarchive.org/release/${releaseId}/front-500` : null;
    setCachedImage(key, imageUrl);
    return imageUrl;
  } catch (error) {
    const logger = global?.logger || console;
    if (logger?.warn) {
      logger.warn("[MUSICBRAINZ IMAGE ERROR]", { artist: artistName, track: trackName, message: error?.message });
    }
    setCachedImage(key, null, 10 * 60 * 1000);
    return null;
  }
}

module.exports = {
  getMusicBrainzArtistCountry,
  getMusicBrainzArtistDetails,
  getMusicBrainzArtistLinks,
  getMusicBrainzArtistImage,
  getMusicBrainzAlbumImage,
  getMusicBrainzTrackImage
};
