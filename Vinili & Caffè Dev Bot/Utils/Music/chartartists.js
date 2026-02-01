const axios = require("axios");
const { lastFmRequest } = require("./lastfm");
const { getSpotifyArtistMeta } = require("./spotify");
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
} catch {
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

async function fetchChartArtists({
  lfmUsername,
  sizeX,
  sizeY,
  period,
  skipEmptyImages
}) {
  const limit = sizeX * sizeY;
  const fetchLimit = Math.min(200, Math.max(limit * 3, limit + 10));
  const results = [];
  let page = 1;
  let exhausted = false;

  while (results.length < limit && !exhausted && page <= 5) {
    const data = await lastFmRequest("user.gettopartists", {
      user: lfmUsername,
      period,
      limit: fetchLimit,
      page
    });
    const artists = data?.topartists?.artist || [];
    if (!artists.length) break;

    for (const artist of artists) {
      if (results.length >= limit) break;
      const name = artist?.name || "Sconosciuto";
      let image = artist.image?.find(img => img.size === "extralarge")?.["#text"]
        || artist.image?.find(img => img.size === "large")?.["#text"]
        || null;
      if (!image) {
        const meta = await getSpotifyArtistMeta(name);
        image = meta?.image || null;
      }
      if (skipEmptyImages && !image) continue;
      if (skipEmptyImages && image) {
        const ok = await canFetchImage(image);
        if (!ok) continue;
      }
      results.push({
        name,
        title: name,
        artist: "",
        image
      });
    }

    exhausted = artists.length < fetchLimit;
    page += 1;
  }

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
  const overlayHeight = Math.round(size * 0.25);
  const padding = Math.round(size * 0.04);
  const titleFont = Math.max(10, Math.round(size * 0.09));
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
}

async function renderArtistChartImage({ items, sizeX, sizeY, notitles }) {
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
      } catch {
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
      drawTextWithSpecialFallback(ctx, "Unknown artist image", x + cellSize / 2, y + cellSize / 2 - 8, {
        size: 14,
        align: "center",
        baseline: ctx.textBaseline,
        color: ctx.fillStyle
      });
      drawTextWithSpecialFallback(ctx, "(use 'skip' to skip)", x + cellSize / 2, y + cellSize / 2 + 12, {
        size: 12,
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

module.exports = {
  PERIOD_ALIASES,
  resolveChartPeriod,
  getChartPeriodLabel,
  fetchChartArtists,
  hasCanvas,
  renderArtistChartImage
};
