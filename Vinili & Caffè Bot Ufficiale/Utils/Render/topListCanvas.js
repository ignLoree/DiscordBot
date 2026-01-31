const axios = require("axios");
let canvasModule = null;
try {
  canvasModule = require("canvas");
} catch {
  canvasModule = null;
}
const { registerCanvasFonts, fontStack } = require("./canvasFonts");

const MAX_IMAGE_CACHE = 100;
const imageCache = new Map();

function buildCoverCandidates(url) {
  if (!url) return [];
  const cleaned = String(url).trim();
  if (!cleaned) return [];
  let normalized = cleaned.startsWith("//") ? "https:" + cleaned : cleaned;
  if (normalized.startsWith("http://")) {
    normalized = "https://" + normalized.slice("http://".length);
  }
  if (normalized.includes("lastfm")) {
    const match = normalized.match(/\/i\/u\/([^/]+)\//);
    if (match && match[1]) {
      const size = match[1];
      if (size !== "770x770") {
        normalized = normalized.replace(`/i/u/${size}/`, "/i/u/770x770/");
      }
      const original = normalized.replace(/\/i\/u\/[^/]+\//, "/i/u/original/");
      return [normalized, original, cleaned.startsWith("//") ? "https:" + cleaned : cleaned];
    }
  }
  return [normalized];
}

async function loadArtwork(url) {
  if (!canvasModule) return null;
  const { loadImage } = canvasModule;
  const candidates = buildCoverCandidates(url);
  if (!candidates.length) return null;
  for (const candidate of candidates) {
    if (imageCache.has(candidate)) {
      const cached = imageCache.get(candidate);
      imageCache.delete(candidate);
      imageCache.set(candidate, cached);
      try {
        return await loadImage(cached);
      } catch {
      }
    }
    try {
      const response = await axios.get(candidate, {
        responseType: "arraybuffer",
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      const buffer = Buffer.from(response.data);
      imageCache.set(candidate, buffer);
      if (imageCache.size > MAX_IMAGE_CACHE) {
        const oldest = imageCache.keys().next().value;
        if (oldest) imageCache.delete(oldest);
      }
      return await loadImage(buffer);
    } catch {
      try {
        return await loadImage(candidate);
      } catch {
      }
    }
  }
  return null;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (!text) return "";
  const cleaned = String(text);
  if (ctx.measureText(cleaned).width <= maxWidth) return cleaned;
  const ellipsis = "...";
  let left = 0;
  let right = cleaned.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const slice = cleaned.slice(0, mid) + ellipsis;
    if (ctx.measureText(slice).width <= maxWidth) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  return cleaned.slice(0, Math.max(0, right - 1)) + ellipsis;
}

module.exports = async function renderTopListCanvas({
  title,
  displayName,
  periodLabel,
  rows,
  footerLeft,
  footerRight,
  coverUrl
}) {
  if (!canvasModule) return null;
  registerCanvasFonts(canvasModule);
  const { createCanvas } = canvasModule;
  const width = 720;
  const headerHeight = 104;
  const rowHeight = 42;
  const listPadding = 24;
  const footerHeight = 22;
  const listHeight = listPadding * 2 + rows.length * rowHeight + footerHeight + 6;
  const height = headerHeight + listHeight + 32;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#0f2d3a");
  bg.addColorStop(0.45, "#0b1e27");
  bg.addColorStop(1, "#0a141c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const artwork = await loadArtwork(coverUrl);
  if (artwork) {
    const scale = Math.max(width / artwork.width, height / artwork.height);
    const drawWidth = artwork.width * scale;
    const drawHeight = artwork.height * scale;
    const dx = Math.round((width - drawWidth) / 2);
    const dy = Math.round((height - drawHeight) / 2);
    ctx.drawImage(artwork, dx, dy, drawWidth, drawHeight);
  }
  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, "rgba(6,12,16,0.7)");
  overlay.addColorStop(1, "rgba(6,12,16,0.85)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  const headerX = 40;
  const headerY = 24;
  const headerW = width - 80;
  const headerH = 72;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "rgba(38,42,48,0.92)";
  drawRoundedRect(ctx, headerX, headerY, headerW, headerH, 16);
  ctx.fill();
  ctx.restore();

  ctx.font = fontStack(28, "bold");
  ctx.fillStyle = "#F4F4F4";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title || "Top List", width / 2, headerY + headerH / 2);
  ctx.textAlign = "left";

  const pillY = headerY - 10;
  ctx.font = fontStack(14, "bold");
  ctx.textBaseline = "middle";

  if (displayName) {
    const pillText = fitText(ctx, displayName, 190);
    const pillWidth = ctx.measureText(pillText).width + 20;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "rgba(22,25,30,0.95)";
    drawRoundedRect(ctx, headerX, pillY, pillWidth, 28, 9);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#ECECEC";
    ctx.fillText(pillText, headerX + 10, pillY + 14);
  }

  if (periodLabel) {
    const text = fitText(ctx, periodLabel, 220);
    const textWidth = ctx.measureText(text).width + 20;
    const pillX = width - headerX - textWidth;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "rgba(22,25,30,0.95)";
    drawRoundedRect(ctx, pillX, pillY, textWidth, 28, 9);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#ECECEC";
    ctx.textAlign = "center";
    ctx.fillText(text, pillX + textWidth / 2, pillY + 14);
    ctx.textAlign = "left";
  }

  const panelX = 56;
  const panelY = headerY + headerH + 22;
  const panelW = width - 112;
  const panelH = listHeight;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "rgba(40,44,50,0.9)";
  drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 16);
  ctx.fill();
  ctx.restore();

  const numberX = panelX + listPadding;
  const nameX = numberX + 30;
  const playsX = panelX + panelW - listPadding;
  let y = panelY + listPadding + 8;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const lineY = y + i * rowHeight;
    ctx.font = fontStack(17, "bold");
    ctx.fillStyle = "#C6CAD0";
    ctx.fillText(String(row.rank) + ".", numberX, lineY);
    ctx.font = fontStack(19);
    ctx.fillStyle = "#F1F3F5";
    const maxNameWidth = playsX - nameX - 70;
    const safeName = fitText(ctx, row.label || "", maxNameWidth);
    ctx.fillText(safeName, nameX, lineY);
    ctx.font = fontStack(17, "bold");
    ctx.fillStyle = "#F1F3F5";
    ctx.textAlign = "right";
    ctx.fillText(String(row.plays || ""), playsX, lineY);
    ctx.textAlign = "left";
  }

  ctx.font = fontStack(12);
  ctx.fillStyle = "#B6BCC3";
  const footerY = panelY + panelH - listPadding + 2;
  if (footerLeft) {
    ctx.fillText(footerLeft, panelX + listPadding, footerY);
  }
  if (footerRight) {
    ctx.textAlign = "right";
    ctx.fillText(footerRight, panelX + panelW - listPadding, footerY);
    ctx.textAlign = "left";
  }
  ctx.font = fontStack(12);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText("powered by Vinili & Caffè Bot", panelX, height - 8);
  return canvas.toBuffer("image/png");
};
