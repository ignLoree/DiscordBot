const axios = require("axios");
const { lastFmRequest } = require("./lastfm");
const { getSpotifyAlbumImageSmart } = require("./spotify");
const { registerCanvasFonts, fontStack, drawTextWithSpecialFallback } = require("../Render/canvasFonts");

const PERIOD_ALIASES = {
  weekly: "7day",
  w: "7day",
  monthly: "1month",
  m: "1month",
  quarterly: "3month",
  q: "3month",
  half: "6month",
  h: "6month",
  yearly: "12month",
  y: "12month",
  alltime: "overall",
  a: "overall",
  overall: "overall"
};
const PERIOD_LABELS = {
  "7day": "weekly",
  "1month": "monthly",
  "3month": "quarterly",
  "6month": "half",
  "12month": "yearly",
  overall: "alltime"
};
let canvasModule = null;
try {
  canvasModule = require("canvas");
} catch (error) {
  canvasModule = null;
}
function hasCanvas() {
  return Boolean(canvasModule);
}
function resolveChartPeriod(token, fallback = "7day") {
  if (!token) return fallback;
  const value = String(token).toLowerCase();
  if (PERIOD_LABELS[value]) return value;
  const normalized = PERIOD_ALIASES[value];
  return normalized || fallback;
}
function getChartPeriodLabel(period) {
  return PERIOD_LABELS[period] || period;
}
function parseYear(text) {
  if (!text) return null;
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}
async function getDeezerAlbumReleaseYear(artistName, albumName) {
  if (!albumName) return null;
  const query = artistName ? `${albumName} ${artistName}` : albumName;
  try {
    const search = await axios.get("https://api.deezer.com/search/album", {
      params: { q: query, limit: 5 }
    });
    const pick = (search.data?.data || [])[0];
    const albumId = pick?.id;
    if (!albumId) return null;
    const info = await axios.get(`https://api.deezer.com/album/${albumId}`);
    const releaseDate = info.data?.release_date;
    return releaseDate ? parseYear(String(releaseDate)) : null;
  } catch {
    return null;
  }
}

async function getItunesAlbumReleaseYear(artistName, albumName) {
  if (!albumName) return null;
  const query = artistName ? `${albumName} ${artistName}` : albumName;
  try {
    const search = await axios.get("https://itunes.apple.com/search", {
      params: { term: query, entity: "album", limit: 5 }
    });
    const pick = (search.data?.results || [])[0];
    const releaseDate = pick?.releaseDate;
    return releaseDate ? parseYear(String(releaseDate)) : null;
  } catch {
    return null;
  }
}
async function fetchChartAlbums({
  lfmUsername,
  sizeX,
  sizeY,
  period,
  releaseYear,
  releaseDecade,
  skipEmptyImages,
  sfw
}) {
  const limit = sizeX * sizeY;
  const fetchLimit = Math.min(200, Math.max(limit * 3, limit + 10));
  const results = [];
  const decadeRange = parseDecadeRange(releaseDecade);
  let page = 1;
  let exhausted = false;

  while (results.length < limit && !exhausted && page <= 5) {
    const data = await lastFmRequest("user.gettopalbums", {
      user: lfmUsername,
      period,
      limit: fetchLimit,
      page
    });
    const albums = data?.topalbums?.album || [];
    if (!albums.length) break;

    for (const album of albums) {
      if (results.length >= limit) break;
      const artist = album.artist?.name || "Sconosciuto";
      const title = album.name || "Sconosciuto";
      let image = album.image?.find(img => img.size === "extralarge")?.["#text"]
        || album.image?.find(img => img.size === "large")?.["#text"]
        || null;
      if (!image) {
        image = await getSpotifyAlbumImageSmart(artist, title);
      }
      if (skipEmptyImages && !image) continue;
      if (releaseYear || decadeRange || sfw) {
        let info = null;
        try {
          const data = await lastFmRequest("album.getinfo", {
            artist,
            album: title,
            username: lfmUsername
          });
          info = data?.album || null;
        } catch {
          info = null;
        }

        if (releaseYear || decadeRange) {
          let year = parseYear(info?.wiki?.published || info?.releasedate || "");
          if (!year) {
            year = await getDeezerAlbumReleaseYear(artist, title);
          }
          if (!year) {
            year = await getItunesAlbumReleaseYear(artist, title);
          }
          if (releaseYear && (!year || year !== releaseYear)) continue;
          if (decadeRange && (!year || year < decadeRange.start || year > decadeRange.end)) continue;
        }

        if (sfw) {
          if (!info) continue;
          const tags = info?.toptags?.tag || [];
          const list = Array.isArray(tags) ? tags : [tags];
          const tagNames = list.map(t => String(t?.name || "").toLowerCase());
          if (isNsfwByTags(tagNames)) continue;
        }
      }

      if (skipEmptyImages && image) {
        const ok = await canFetchImage(image);
        if (!ok) continue;
      }

      results.push({
        artist,
        title,
        image,
        url: album.url
      });
    }

    exhausted = albums.length < fetchLimit;
    page += 1;
  }
  return results;
}

function parseDecadeRange(value) {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();
  const m1 = raw.match(/^\d{2}s$/);
  const m2 = raw.match(/^\d{4}$/);
  const m3 = raw.match(/^\d{4}s$/);
  let start = null;
  if (m1) {
    const two = Number(raw.slice(0, 2));
    start = (two <= 29 ? 2000 : 1900) + two * 10;
  } else if (m2) {
    const year = Number(raw);
    start = year - (year % 10);
  } else if (m3) {
    const year = Number(raw.slice(0, 4));
    start = year - (year % 10);
  }
  if (!Number.isFinite(start)) return null;
  return { start, end: start + 9 };
}

function isNsfwByTags(tagNames) {
  if (!Array.isArray(tagNames) || !tagNames.length) return false;
  const bad = [
    "nsfw",
    "porn",
    "porno",
    "nude",
    "nudity",
    "sex",
    "sexy",
    "erotic",
    "erotica",
    "explicit",
    "adult"
  ];
  return tagNames.some(t => bad.some(b => t.includes(b)));
}

async function canFetchImage(url) {
  try {
    await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 6500,
      maxContentLength: 6 * 1024 * 1024,
      validateStatus: s => s >= 200 && s < 400
    });
    return true;
  } catch {
    return false;
  }
}
async function fetchImageBuffer(url) {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  return response.data;
}
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }
  const workers = [];
  const workerCount = Math.min(limit, items.length);
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
function drawCover(ctx, image, x, y, size) {
  const scale = Math.max(size / image.width, size / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = x - (drawWidth - size) / 2;
  const offsetY = y - (drawHeight - size) / 2;
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}
function fitText(ctx, text, maxWidth) {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 0 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.length ? `${trimmed}...` : "";
}
function drawOverlayText(ctx, item, x, y, size) {
  const overlayHeight = Math.round(size * 0.28);
  const padding = Math.round(size * 0.04);
  const titleFont = Math.max(10, Math.round(size * 0.09));
  const artistFont = Math.max(9, Math.round(size * 0.07));
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(x, y + size - overlayHeight, size, overlayHeight);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.font = fontStack(titleFont, "bold");
  const maxTextWidth = size - padding * 2;
  const title = fitText(ctx, item.title, maxTextWidth);
  drawTextWithSpecialFallback(ctx, title, x + padding, y + size - overlayHeight + padding, {
    size: titleFont,
    weight: "bold",
    align: "left",
    baseline: ctx.textBaseline,
    color: ctx.fillStyle
  });
  ctx.font = fontStack(artistFont);
  const artist = fitText(ctx, item.artist, maxTextWidth);
  drawTextWithSpecialFallback(ctx, artist, x + padding, y + size - overlayHeight + padding + titleFont + 2, {
    size: artistFont,
    align: "left",
    baseline: ctx.textBaseline,
    color: ctx.fillStyle
  });
}
async function renderChartImage({ items, sizeX, sizeY, notitles }) {
  if (!canvasModule) {
    throw new Error("Canvas module not available");
  }
  const { createCanvas, loadImage } = canvasModule;
  registerCanvasFonts(canvasModule);
  const cellSize = 200;
  const gap = 2;
  const width = sizeX * cellSize + (sizeX - 1) * gap;
  const height = sizeY * cellSize + (sizeY - 1) * gap;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, width, height);
  const images = await mapWithConcurrency(
    items,
    6,
    async item => {
      if (!item.image) return null;
      try {
        const buffer = await fetchImageBuffer(item.image);
        return await loadImage(buffer);
      } catch (error) {
        return null;
      }
    }
  );
  const total = sizeX * sizeY;
  for (let index = 0; index < total; index += 1) {
    const row = Math.floor(index / sizeX);
    const col = index % sizeX;
    const x = col * (cellSize + gap);
    const y = row * (cellSize + gap);
    const item = items[index];
    const image = images[index];
    if (image) {
      drawCover(ctx, image, x, y, cellSize);
    } else {
      ctx.fillStyle = "#2b2b2b";
      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.fillStyle = "#d0d0d0";
      ctx.font = fontStack(14);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      drawTextWithSpecialFallback(ctx, item ? "No image" : "No data", x + cellSize / 2, y + cellSize / 2, {
        size: 14,
        align: "center",
        baseline: ctx.textBaseline,
        color: ctx.fillStyle
      });
    }
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
    if (!notitles && item) {
      drawOverlayText(ctx, item, x, y, cellSize);
    }
  }
  return canvas.toBuffer("image/png");
}

module.exports = { PERIOD_ALIASES, resolveChartPeriod, getChartPeriodLabel, fetchChartAlbums, hasCanvas, renderChartImage };

