const axios = require("axios");
const canvasModule = require("canvas");
const { registerCanvasFonts, fontStack } = require("./canvasFonts");
const CONFIG = require("../../config");
const ART_BASE_WIDTH = 350;
const ART_MIN_WIDTH = 280;
const ART_MAX_WIDTH = 520;
const ART_HEIGHT = 410;
const PADDING = 28;
const MIN_PANEL_WIDTH = 580;
const MAX_PANEL_WIDTH = 1600;
const MIN_HEIGHT = 820;
const MAX_IMAGE_CACHE = Math.max(0, Number(CONFIG?.render?.whoknowsImageCache ?? 100) || 0);
const imageCache = new Map();
registerCanvasFonts(canvasModule);
const { createCanvas, loadImage } = canvasModule;
const colors = {
  background: "#0b0f14",
  panel: "rgba(40,44,50,0.92)",
  panelSoft: "rgba(40,44,50,0.82)",
  primary: "#BA0000",
  text: "#F1F3F5",
  muted: "#B8BCC2",
  crown: "#F1C40F"
};
const CROWN_URL = "https://twemoji.maxcdn.com/v/latest/72x72/1f451.png";
const GLOBE_URL = "https://twemoji.maxcdn.com/v/latest/72x72/1f310.png";
let crownImage = null;
let globeImage = null;
async function loadCrownImage() {
  if (crownImage) return crownImage;
  try {
    const response = await axios.get(CROWN_URL, { responseType: "arraybuffer" });
    crownImage = await loadImage(Buffer.from(response.data));
  } catch {
    crownImage = null;
  }
  return crownImage;
}
async function loadGlobeImage() {
  if (globeImage) return globeImage;
  try {
    const response = await axios.get(GLOBE_URL, { responseType: "arraybuffer" });
    globeImage = await loadImage(Buffer.from(response.data));
  } catch {
    globeImage = null;
  }
  return globeImage;
}
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
function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (!line || ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
function extractServerLabel(subtitle, overrideLabel) {
  if (overrideLabel) return String(overrideLabel);
  if (!subtitle) return null;
  const match = String(subtitle).match(/in\s+Server\s+di\s+(.+)$/i);
  if (match && match[1]) return `in Server di ${match[1]}`;
  const simple = String(subtitle).match(/in\s+(.+)$/i);
  if (simple && simple[1]) return `in ${simple[1]}`;
  return null;
}

function extractStats(footer) {
  if (!footer) return null;
  const cleaned = String(footer);
  const match = cleaned.match(/([0-9.,]+)\s+listeners?.*?([0-9.,]+)\s+plays?.*?([0-9.,]+)\s+avg/i);
  if (!match) return null;
  return {
    listeners: match[1],
    plays: match[2],
    avg: match[3]
  };
}

function extractCrownText(footer) {
  if (!footer) return null;
  const match = String(footer).match(/Crown claimed by\s+(.+)$/i);
  if (!match || !match[1]) return null;
  return `Crown claimed by ${match[1]}!`;
}
module.exports = async function renderWhoKnows({
  title,
  subtitle,
  coverUrl,
  rows,
  footer,
  badgeText,
  serverLabel,
  showCrown = true,
  poweredByText
}) {
  const width = 1200;
  const headerHeight = 86;
  const topPad = 32;
  const listPad = 28;
  const rowHeight = 46;
  const statsBarHeight = 40;
  const statsGap = 12;
  const crownText = extractCrownText(footer);
  const bannerHeight = crownText ? 56 : 0;
  const bannerGap = crownText ? 18 : 0;
  const baseHeight = topPad + headerHeight + 24 + (rows.length * rowHeight + listPad * 2) + statsGap + statsBarHeight + bannerGap + bannerHeight + 24;
  const height = Math.max(MIN_HEIGHT, baseHeight);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const crownImg = showCrown ? await loadCrownImage() : null;
  const globeImg = await loadGlobeImage();
  const artwork = await loadArtwork(coverUrl);
  const hasArtwork = Boolean(artwork);
  if (hasArtwork) {
    const scale = Math.max(width / artwork.width, height / artwork.height);
    const drawWidth = artwork.width * scale;
    const drawHeight = artwork.height * scale;
    const dx = Math.round((width - drawWidth) / 2);
    const dy = Math.round((height - drawHeight) / 2);
    ctx.drawImage(artwork, dx, dy, drawWidth, drawHeight);
  } else {
    ctx.fillStyle = colors.panel;
    ctx.fillRect(0, 0, width, height);
  }
  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, hasArtwork ? "rgba(10,12,16,0.6)" : "rgba(10,12,16,0.45)");
  overlay.addColorStop(1, hasArtwork ? "rgba(10,12,16,0.85)" : "rgba(10,12,16,0.75)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  const headerX = 40;
  const headerY = topPad;
  const headerW = width - 80;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = colors.panel;
  ctx.beginPath();
  ctx.moveTo(headerX + 14, headerY);
  ctx.lineTo(headerX + headerW - 14, headerY);
  ctx.quadraticCurveTo(headerX + headerW, headerY, headerX + headerW, headerY + 14);
  ctx.lineTo(headerX + headerW, headerY + headerHeight - 14);
  ctx.quadraticCurveTo(headerX + headerW, headerY + headerHeight, headerX + headerW - 14, headerY + headerHeight);
  ctx.lineTo(headerX + 14, headerY + headerHeight);
  ctx.quadraticCurveTo(headerX, headerY + headerHeight, headerX, headerY + headerHeight - 14);
  ctx.lineTo(headerX, headerY + 14);
  ctx.quadraticCurveTo(headerX, headerY, headerX + 14, headerY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const badgeY = headerY - 10;
  ctx.font = fontStack(16, "bold");
  ctx.fillStyle = colors.panelSoft;
  const badgeLabel = badgeText || "WhoKnows";
  const badgeWidth = ctx.measureText(badgeLabel).width + 24;
  ctx.beginPath();
  ctx.moveTo(headerX + 10, badgeY);
  ctx.lineTo(headerX + 10 + badgeWidth - 12, badgeY);
  ctx.quadraticCurveTo(headerX + 10 + badgeWidth, badgeY, headerX + 10 + badgeWidth, badgeY + 12);
  ctx.lineTo(headerX + 10 + badgeWidth, badgeY + 32 - 12);
  ctx.quadraticCurveTo(headerX + 10 + badgeWidth, badgeY + 32, headerX + 10 + badgeWidth - 12, badgeY + 32);
  ctx.lineTo(headerX + 10 + 12, badgeY + 32);
  ctx.quadraticCurveTo(headerX + 10, badgeY + 32, headerX + 10, badgeY + 32 - 12);
  ctx.lineTo(headerX + 10, badgeY + 12);
  ctx.quadraticCurveTo(headerX + 10, badgeY, headerX + 10 + 12, badgeY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = colors.text;
  ctx.textBaseline = "middle";
  ctx.fillText(badgeLabel, headerX + 22, badgeY + 16);

  const serverBadge = extractServerLabel(subtitle, serverLabel);

  ctx.font = fontStack(34, "bold");
  ctx.fillStyle = colors.text;
  ctx.textAlign = "center";
  ctx.fillText(title || "", width / 2, headerY + headerHeight / 2 + 2);
  ctx.textAlign = "left";

  const contentY = headerY + headerHeight + 24;
  const leftX = headerX;
  const artPanelWidth = hasArtwork ? ART_BASE_WIDTH : 0;
  const artGap = hasArtwork ? 36 : 0;
  let rightX = leftX + artPanelWidth + artGap;
  const panelHeight = height - contentY - (bannerGap + bannerHeight) - statsGap - statsBarHeight - 24;
  const artHeight = panelHeight;
  let rightWidth = width - rightX - headerX;
  let artWidth = artPanelWidth;
  if (hasArtwork && artwork) {
    const aspect = artwork.width / artwork.height;
    const desired = Math.round(artHeight * aspect);
    const maxAllowed = Math.max(ART_MIN_WIDTH, width - headerX - headerX - artGap - MIN_PANEL_WIDTH);
    artWidth = Math.max(ART_MIN_WIDTH, Math.min(ART_MAX_WIDTH, Math.min(desired, maxAllowed)));
    rightX = leftX + artWidth + artGap;
    rightWidth = width - rightX - headerX;
  }

  if (hasArtwork) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = colors.panel;
    ctx.beginPath();
    ctx.moveTo(leftX + 16, contentY);
    ctx.lineTo(leftX + artWidth - 16, contentY);
    ctx.quadraticCurveTo(leftX + artWidth, contentY, leftX + artWidth, contentY + 16);
    ctx.lineTo(leftX + artWidth, contentY + artHeight - 16);
    ctx.quadraticCurveTo(leftX + artWidth, contentY + artHeight, leftX + artWidth - 16, contentY + artHeight);
    ctx.lineTo(leftX + 16, contentY + artHeight);
    ctx.quadraticCurveTo(leftX, contentY + artHeight, leftX, contentY + artHeight - 16);
    ctx.lineTo(leftX, contentY + 16);
    ctx.quadraticCurveTo(leftX, contentY, leftX + 16, contentY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const scale = Math.min(artWidth / artwork.width, artHeight / artwork.height);
    const drawWidth = artwork.width * scale;
    const drawHeight = artwork.height * scale;
    const dx = leftX + Math.round((artWidth - drawWidth) / 2);
    const dy = contentY + Math.round((artHeight - drawHeight) / 2);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(leftX + 16, contentY);
    ctx.lineTo(leftX + artWidth - 16, contentY);
    ctx.quadraticCurveTo(leftX + artWidth, contentY, leftX + artWidth, contentY + 16);
    ctx.lineTo(leftX + artWidth, contentY + artHeight - 16);
    ctx.quadraticCurveTo(leftX + artWidth, contentY + artHeight, leftX + artWidth - 16, contentY + artHeight);
    ctx.lineTo(leftX + 16, contentY + artHeight);
    ctx.quadraticCurveTo(leftX, contentY + artHeight, leftX, contentY + artHeight - 16);
    ctx.lineTo(leftX, contentY + 16);
    ctx.quadraticCurveTo(leftX, contentY, leftX + 16, contentY);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(artwork, dx, dy, drawWidth, drawHeight);
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = colors.panel;
  ctx.beginPath();
  ctx.moveTo(rightX + 16, contentY);
  ctx.lineTo(rightX + rightWidth - 16, contentY);
  ctx.quadraticCurveTo(rightX + rightWidth, contentY, rightX + rightWidth, contentY + 16);
  ctx.lineTo(rightX + rightWidth, contentY + panelHeight - 16);
  ctx.quadraticCurveTo(rightX + rightWidth, contentY + panelHeight, rightX + rightWidth - 16, contentY + panelHeight);
  ctx.lineTo(rightX + 16, contentY + panelHeight);
  ctx.quadraticCurveTo(rightX, contentY + panelHeight, rightX, contentY + panelHeight - 16);
  ctx.lineTo(rightX, contentY + 16);
  ctx.quadraticCurveTo(rightX, contentY, rightX + 16, contentY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (serverBadge) {
    ctx.font = fontStack(16, "bold");
    const hasGlobe = serverBadge.includes("🌐");
    const labelText = hasGlobe ? serverBadge.replace("🌐", "").trim() : serverBadge;
    const globeSize = hasGlobe ? 18 : 0;
    const globeGap = hasGlobe ? 6 : 0;
    const labelWidth = ctx.measureText(labelText).width + 24 + globeSize + globeGap;
    const pillX = headerX + headerW - labelWidth - 10;
    const pillY = badgeY;
    ctx.fillStyle = colors.panelSoft;
    ctx.beginPath();
    ctx.moveTo(pillX, pillY);
    ctx.lineTo(pillX + labelWidth - 12, pillY);
    ctx.quadraticCurveTo(pillX + labelWidth, pillY, pillX + labelWidth, pillY + 12);
    ctx.lineTo(pillX + labelWidth, pillY + 32 - 12);
    ctx.quadraticCurveTo(pillX + labelWidth, pillY + 32, pillX + labelWidth - 12, pillY + 32);
    ctx.lineTo(pillX + 12, pillY + 32);
    ctx.quadraticCurveTo(pillX, pillY + 32, pillX, pillY + 32 - 12);
    ctx.lineTo(pillX, pillY + 12);
    ctx.quadraticCurveTo(pillX, pillY, pillX + 12, pillY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colors.text;
    ctx.fillText(labelText, pillX + 12, pillY + 16);
    if (hasGlobe && globeImg) {
      const textWidth = ctx.measureText(labelText).width;
      const globeX = pillX + 12 + textWidth + globeGap;
      ctx.drawImage(globeImg, globeX, pillY + 8, globeSize, globeSize);
    }
  }

  let listY = contentY + listPad;
  const listX = rightX + 24;
  const playsX = rightX + rightWidth - 24;
  ctx.textBaseline = "middle";
  rows.forEach((row, i) => {
    const lineY = listY + i * rowHeight;
    const lineCenter = lineY + rowHeight / 2;
    if (lineY > contentY + panelHeight - 12) return;
    const isHighlight = row.highlight === true;
    const rankValue = Number.isFinite(row.rank) ? row.rank : i + 1;
    const hasCrown = showCrown && rankValue === 1;
    if (!hasCrown) {
      const rankText = `${rankValue}.`;
      ctx.font = fontStack(16, "bold");
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(rankText, listX, lineCenter);
    }
    ctx.font = fontStack(22, isHighlight ? "bold" : undefined);
    ctx.fillStyle = colors.text;
    const nameX = listX + 28;
    if (hasCrown) {
      const crownSize = 20;
      const crownX = listX;
      const crownY = lineCenter - crownSize / 2;
      if (crownImg) {
        ctx.drawImage(crownImg, crownX, crownY, crownSize, crownSize);
      } else {
        ctx.font = fontStack(22, "bold");
        ctx.fillText("👑", crownX, lineCenter);
      }
      ctx.fillText(row.user || "", listX + crownSize + 10, lineCenter);
    } else {
      ctx.fillText(row.user || "", nameX, lineCenter);
    }
    ctx.font = fontStack(22, "bold");
    ctx.textAlign = "right";
    ctx.fillText(String(row.plays), playsX, lineCenter);
    ctx.textAlign = "left";
  });
  ctx.textBaseline = "alphabetic";

  const poweredLabel = poweredByText || "Powered by Vinili & Caffè Bot";
  const poweredY = contentY + artHeight + 12;
  ctx.font = fontStack(14);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(poweredLabel, leftX + 6, poweredY);

  const stats = extractStats(footer);
  const statText = stats
    ? `${stats.listeners} listeners  \u00b7  ${stats.plays} plays  \u00b7  ${stats.avg} avg`
    : String(footer || "");
  const statsX = rightX + 16;
  const statsW = rightWidth - 32;
  const statsY = contentY + panelHeight + statsGap;
  ctx.fillStyle = colors.panelSoft;
  ctx.beginPath();
  ctx.moveTo(statsX + 12, statsY);
  ctx.lineTo(statsX + statsW - 12, statsY);
  ctx.quadraticCurveTo(statsX + statsW, statsY, statsX + statsW, statsY + 12);
  ctx.lineTo(statsX + statsW, statsY + statsBarHeight - 12);
  ctx.quadraticCurveTo(statsX + statsW, statsY + statsBarHeight, statsX + statsW - 12, statsY + statsBarHeight);
  ctx.lineTo(statsX + 12, statsY + statsBarHeight);
  ctx.quadraticCurveTo(statsX, statsY + statsBarHeight, statsX, statsY + statsBarHeight - 12);
  ctx.lineTo(statsX, statsY + 12);
  ctx.quadraticCurveTo(statsX, statsY, statsX + 12, statsY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = colors.text;
  ctx.font = fontStack(16, "bold");
  ctx.textAlign = "center";
  ctx.fillText(statText, statsX + statsW / 2, statsY + statsBarHeight / 2 + 1);
  ctx.textAlign = "left";

  if (crownText) {
    const bannerY = contentY + panelHeight + statsGap + statsBarHeight + bannerGap;
    const bannerX = headerX;
    const bannerW = width - headerX * 2;
    ctx.fillStyle = colors.panel;
    ctx.beginPath();
    ctx.moveTo(bannerX + 14, bannerY);
    ctx.lineTo(bannerX + bannerW - 14, bannerY);
    ctx.quadraticCurveTo(bannerX + bannerW, bannerY, bannerX + bannerW, bannerY + 14);
    ctx.lineTo(bannerX + bannerW, bannerY + 46 - 14);
    ctx.quadraticCurveTo(bannerX + bannerW, bannerY + 46, bannerX + bannerW - 14, bannerY + 46);
    ctx.lineTo(bannerX + 14, bannerY + 46);
    ctx.quadraticCurveTo(bannerX, bannerY + 46, bannerX, bannerY + 46 - 14);
    ctx.lineTo(bannerX, bannerY + 14);
    ctx.quadraticCurveTo(bannerX, bannerY, bannerX + 14, bannerY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colors.text;
    ctx.font = fontStack(18, "bold");
    ctx.textAlign = "center";
    ctx.fillText(crownText, bannerX + bannerW / 2, bannerY + 24);
    ctx.textAlign = "left";
  }
  return canvas.toBuffer("image/png");
};






