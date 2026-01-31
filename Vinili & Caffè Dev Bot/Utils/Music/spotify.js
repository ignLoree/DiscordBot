const axios = require("axios");
const CONFIG = require("../../config.js");
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
  || CONFIG?.spotifyClientId
  || "62be99af56be4ea4885b647661fa02da";
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
  || CONFIG?.spotifyClientSecret
  || "45841beeabbc472a88cb6171e5235cfe";
const TRACK_CACHE_TTL_MS = Number(process.env.SPOTIFY_TRACK_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const trackCache = new Map();

async function getSpotifyAccessToken() {
  const tokenUrl = "https://accounts.spotify.com/api/token";
  const credentials = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
    try {
    const response = await axios.post(
      tokenUrl,
      "grant_type=client_credentials",
      {
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );
    return response.data.access_token;
  } catch (error) {
    throw error;
  }
}
async function searchSpotify(query, type = "track", limit = 5) {
  const token = await getSpotifyAccessToken();
  const response = await axios.get("https://api.spotify.com/v1/search", {
    headers: { "Authorization": `Bearer ${token}` },
    params: { q: query, type, limit }
  });
  return response.data?.[`${type}s`]?.items || [];
}

function upscaleItunesArtwork(url) {
  if (!url) return null;
  return String(url).replace(/\/\d+x\d+bb\.(jpg|png)$/i, "/600x600bb.$1");
}

async function searchDeezer(endpoint, params) {
  const response = await axios.get(`https://api.deezer.com/${endpoint}`, { params });
  return response.data?.data || [];
}

async function getDeezerArtistImageSmart(artistName) {
  if (!artistName) return null;
  try {
    const results = await searchDeezer("search/artist", { q: artistName, limit: 5 });
    const pick = results?.[0];
    return pick?.picture_xl || pick?.picture_big || pick?.picture || null;
  } catch {
    return null;
  }
}

async function getDeezerAlbumImageSmart(artistName, albumName) {
  if (!albumName) return null;
  const query = artistName ? `${albumName} ${artistName}` : albumName;
  try {
    const results = await searchDeezer("search/album", { q: query, limit: 5 });
    const pick = results?.[0];
    return pick?.cover_xl || pick?.cover_big || pick?.cover || null;
  } catch {
    return null;
  }
}

async function getDeezerTrackImageSmart(artistName, trackName) {
  if (!trackName) return null;
  const query = artistName ? `${trackName} ${artistName}` : trackName;
  try {
    const results = await searchDeezer("search", { q: query, limit: 5 });
    const pick = results?.[0];
    const album = pick?.album || null;
    return album?.cover_xl || album?.cover_big || album?.cover || null;
  } catch {
    return null;
  }
}

async function getItunesImage(term, entity) {
  if (!term) return null;
  try {
    const response = await axios.get("https://itunes.apple.com/search", {
      params: { term, entity, limit: 5 }
    });
    const results = response.data?.results || [];
    const pick = results?.[0];
    return upscaleItunesArtwork(pick?.artworkUrl100 || pick?.artworkUrl60 || null);
  } catch {
    return null;
  }
}
function getCachedTrack(key) {
  const cached = trackCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt && cached.expiresAt < Date.now()) {
    trackCache.delete(key);
    return null;
  }
  return cached;
}

function setCachedTrack(key, track, audioFeatures) {
  if (!key) return;
  trackCache.set(key, {
    track,
    audioFeatures,
    expiresAt: Date.now() + TRACK_CACHE_TTL_MS
  });
  if (trackCache.size > 1000) {
    const firstKey = trackCache.keys().next().value;
    if (firstKey) trackCache.delete(firstKey);
  }
}

async function getSpotifyTrackById(token, trackId) {
  const response = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  return response.data || null;
}

async function getSpotifyAudioFeatures(token, trackId) {
  const response = await axios.get(`https://api.spotify.com/v1/audio-features/${trackId}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  return response.data || null;
}

async function getDeezerPreview(artistName, trackName) {
  if (!artistName || !trackName) return null;
  const query = `${artistName} ${trackName}`;
  try {
    const response = await axios.get("https://api.deezer.com/search", {
      params: { q: query, limit: 5 }
    });
    const items = response.data?.data || [];
    const first = items[0];
    return first?.preview || null;
  } catch {
    return null;
  }
}

async function getDeezerTrackMeta(artistName, trackName) {
  if (!artistName || !trackName) return null;
  const query = `${artistName} ${trackName}`;
  try {
    const response = await axios.get("https://api.deezer.com/search", {
      params: { q: query, limit: 5 }
    });
    const items = response.data?.data || [];
    const pick = items[0];
    if (!pick) return null;
    const album = pick?.album || null;
    return {
      durationMs: pick?.duration ? pick.duration * 1000 : null,
      previewUrl: pick?.preview || null,
      link: pick?.link || null,
      image: album?.cover_xl || album?.cover_big || album?.cover || null
    };
  } catch {
    return null;
  }
}

async function getItunesTrackMeta(artistName, trackName) {
  if (!trackName) return null;
  const term = artistName ? `${trackName} ${artistName}` : trackName;
  try {
    const response = await axios.get("https://itunes.apple.com/search", {
      params: { term, entity: "song", limit: 5 }
    });
    const results = response.data?.results || [];
    const pick = results[0];
    if (!pick) return null;
    return {
      durationMs: pick?.trackTimeMillis || null,
      previewUrl: pick?.previewUrl || null,
      link: pick?.trackViewUrl || null,
      image: upscaleItunesArtwork(pick?.artworkUrl100 || pick?.artworkUrl60 || null)
    };
  } catch {
    return null;
  }
}
async function getSpotifyArtistImage(artistName) {
  if (!artistName) return null;
  try {
    const results = await searchSpotify(artistName, "artist", 1);
    const artist = results?.[0];
    const images = artist?.images || [];
    return images[0]?.url || null;
  } catch {
    return null;
  }
}

async function getSpotifyArtistImageExact(artistName) {
  if (!artistName) return null;
  try {
    const results = await searchSpotify(artistName, "artist", 5);
    const target = artistName.trim().toLowerCase();
    const exact = results.find(item => String(item?.name || "").trim().toLowerCase() === target);
    if (!exact) return null;
    const images = exact.images || [];
    return images[0]?.url || null;
  } catch {
    return null;
  }
}

function normalizeArtistName(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
async function getSpotifyArtistImageSmart(artistName) {
  if (!artistName) return null;
  try {
    const results = await searchSpotify(artistName, "artist", 5);
    const target = normalizeArtistName(artistName);
    const exact = results.find(item => normalizeArtistName(item?.name) === target);
    const pick = exact || results[0];
    if (!pick) return null;
    const images = pick.images || [];
    const image = images[0]?.url || null;
    if (image) return image;
  } catch {
  }
  const deezerImage = await getDeezerArtistImageSmart(artistName);
  if (deezerImage) return deezerImage;
  return getItunesImage(artistName, "song");
}

async function getSpotifyArtistMeta(artistName) {
  if (!artistName) return null;
  try {
    const results = await searchSpotify(artistName, "artist", 5);
    const target = normalizeArtistName(artistName);
    const exact = results.find(item => normalizeArtistName(item?.name) === target);
    const pick = exact || results[0];
    if (!pick) return null;
    return {
      name: pick?.name || artistName,
      image: pick?.images?.[0]?.url || null,
      url: pick?.external_urls?.spotify || null,
      genres: Array.isArray(pick?.genres) ? pick.genres : []
    };
  } catch {
    return null;
  }
}

async function getSpotifyTrackImageSmart(artistName, trackName) {
  if (!artistName || !trackName) return null;
  const query = `track:${trackName} artist:${artistName}`;
  try {
    const results = await searchSpotify(query, "track", 5);
    const pick = results?.[0];
    const images = pick?.album?.images || [];
    const image = images[0]?.url || null;
    if (image) return image;
  } catch {
  }
  const deezerImage = await getDeezerTrackImageSmart(artistName, trackName);
  if (deezerImage) return deezerImage;
  return getItunesImage(`${trackName} ${artistName}`, "song");
}
async function getSpotifyAlbumImageSmart(artistName, albumName) {
  if (!artistName || !albumName) return null;
  const query = `album:${albumName} artist:${artistName}`;
  try {
    const results = await searchSpotify(query, "album", 5);
    const pick = results?.[0];
    const images = pick?.images || [];
    const image = images[0]?.url || null;
    if (image) return image;
  } catch {
  }
  const deezerImage = await getDeezerAlbumImageSmart(artistName, albumName);
  if (deezerImage) return deezerImage;
  return getItunesImage(`${albumName} ${artistName}`, "album");
}
function normalizeSpotifyText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeTrackName(value) {
  return String(value || "")
    .replace(/\s*[\(\[]\s*(feat\.|ft\.|featuring)\s+.*?[\)\]]\s*/gi, " ")
    .replace(/\s+(feat\.|ft\.|featuring)\s+.*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTrackCacheKey({ artistName, trackName, albumName, isrc }) {
  if (isrc) return `isrc:${String(isrc).trim().toUpperCase()}`;
  const artist = normalizeSpotifyText(artistName);
  const track = normalizeSpotifyText(trackName);
  const album = normalizeSpotifyText(albumName);
  return `track:${artist}|${track}|${album}`;
}

function scoreTrackMatch(track, artistName, trackName) {
  if (!track) return 0;
  const targetArtist = normalizeSpotifyText(artistName);
  const targetTrack = normalizeSpotifyText(trackName);
  const trackArtist = normalizeSpotifyText(track?.artists?.[0]?.name || "");
  const trackTitle = normalizeSpotifyText(track?.name || "");
  let score = 0;
  if (trackTitle === targetTrack) score += 3;
  if (trackTitle.includes(targetTrack) || targetTrack.includes(trackTitle)) score += 1;
  if (trackArtist === targetArtist) score += 3;
  if (trackArtist.includes(targetArtist) || targetArtist.includes(trackArtist)) score += 1;
  if (track?.preview_url) score += 1;
  return score;
}

function pickBestTrack(results, artistName, trackName) {
  if (!Array.isArray(results) || results.length === 0) return null;
  let best = results[0];
  let bestScore = scoreTrackMatch(best, artistName, trackName);
  for (const candidate of results.slice(1)) {
    const score = scoreTrackMatch(candidate, artistName, trackName);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

async function getSpotifyTrackDetails(artistName, trackName, albumName = null, isrc = null) {
  if (!artistName || !trackName) return null;
  const cacheKey = buildTrackCacheKey({ artistName, trackName, albumName, isrc });
  const cached = getCachedTrack(cacheKey);
  if (cached) return { track: cached.track, audioFeatures: cached.audioFeatures };
  const cleanTrack = sanitizeTrackName(trackName);
  const cleanArtist = sanitizeTrackName(artistName);
  const cleanAlbum = sanitizeTrackName(albumName || "");
  const queries = [];
  if (isrc) {
    queries.push(`isrc:${String(isrc).trim()}`);
  }
  if (albumName) {
    queries.push(`track:${trackName} artist:${artistName} album:${albumName}`);
  }
  queries.push(`track:${trackName} artist:${artistName}`);
  queries.push(`${trackName} ${artistName}`);
  queries.push(`${trackName}`);
  if (cleanTrack && cleanTrack !== trackName) {
    if (cleanAlbum) {
      queries.push(`track:${cleanTrack} artist:${cleanArtist || artistName} album:${cleanAlbum}`);
    }
    queries.push(`track:${cleanTrack} artist:${cleanArtist || artistName}`);
    queries.push(`${cleanTrack} ${cleanArtist || artistName}`);
    queries.push(`${cleanTrack}`);
  }
  try {
    let track = null;
    for (const query of queries) {
      const results = await searchSpotify(query, "track", 8);
      const pick = pickBestTrack(results, artistName, trackName);
      if (pick) {
        track = pick;
        break;
      }
    }
    if (!track?.id) return { track: track || null, audioFeatures: null };
    const token = await getSpotifyAccessToken();
    let fullTrack = null;
    let audioFeatures = null;
    try {
      fullTrack = await getSpotifyTrackById(token, track.id);
    } catch (error) {
      fullTrack = null;
    }
    try {
      audioFeatures = await getSpotifyAudioFeatures(token, track.id);
    } catch (error) {
      audioFeatures = null;
    }
    const resolvedTrack = fullTrack || track;
    setCachedTrack(cacheKey, resolvedTrack, audioFeatures);
    return { track: resolvedTrack, audioFeatures };
  } catch {
    return { track: null, audioFeatures: null };
  }
}

module.exports = {
  searchSpotify,
  getSpotifyArtistImage,
  getSpotifyArtistImageExact,
  getSpotifyArtistImageSmart,
  getSpotifyTrackImageSmart,
  getSpotifyAlbumImageSmart,
  getSpotifyTrackDetails,
  getSpotifyArtistMeta,
  getDeezerPreview,
  getDeezerTrackMeta,
  getItunesTrackMeta
};




