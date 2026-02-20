const canvasModule = require("canvas");
const { registerCanvasFonts, fontStack, drawTextWithSpecialFallback, } = require("./canvasFonts");
const { createCanvas, loadImage } = canvasModule;

function wrapLines(ctx, text, maxWidth, maxLines = Infinity) {
  const lines = [];
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean);
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.slice(0, maxLines);
}

function drawImageCover(ctx, image, x, y, w, h) {
  const { width, height } = image;
  const scale = Math.max(w / width, h / height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (width - sw) / 2;
  const sy = (height - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

module.exports = async function renderQuoteCanvas({
  avatarUrl,
  message,
  username,
  footerText,
}) {
  if (!canvasModule) {
    throw new Error("Canvas module not available");
  }
  registerCanvasFonts(canvasModule);
  const width = 1024;
  const height = 512;
  const leftWidth = 512;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#070707";
  ctx.fillRect(0, 0, width, height);

  const avatar = await loadImage(avatarUrl);
  drawImageCover(ctx, avatar, 0, 0, leftWidth, height);

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, leftWidth, height);

  const gradientStart = leftWidth - 40;
  const gradientEnd = leftWidth + 180;
  const gradient = ctx.createLinearGradient(gradientStart, 0, gradientEnd, 0);
  gradient.addColorStop(0, "rgba(0,0,0,0.0)");
  gradient.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = gradient;
  ctx.fillRect(gradientStart, 0, width - gradientStart, height);

  const padding = 48;
  const textX = leftWidth + (width - leftWidth) / 2;
  const maxTextWidth = width - leftWidth - padding * 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const mainText = String(message || "").toUpperCase();
  let fontSize = 30;
  let lines = [];
  let lineHeight = 36;
  const topMargin = 100;
  const bottomMargin = 80;
  const maxBlockHeight = height - topMargin - bottomMargin;
  while (fontSize >= 14) {
    ctx.font = fontStack(fontSize, "600");
    lines = wrapLines(ctx, mainText, maxTextWidth);
    lineHeight = Math.round(fontSize * 1.2);
    const blockHeight = lines.length * lineHeight;
    if (blockHeight <= maxBlockHeight) break;
    fontSize -= 2;
  }
  const blockHeight = lines.length * lineHeight;
  let y = Math.max(topMargin, (height - blockHeight) / 2);

  ctx.font = fontStack(18, "italic");
  drawTextWithSpecialFallback(ctx, username || "", textX, y - 36, {
    size: 18,
    weight: "italic",
    color: "rgba(255,255,255,0.7)",
    normalizeCompatibility: true,
  });

  ctx.font = fontStack(fontSize, "600");
  for (const line of lines) {
    if (y + lineHeight > height - 36) break;
    drawTextWithSpecialFallback(ctx, line, textX, y, {
      size: fontSize,
      weight: "600",
      color: "#f7f7f7",
    });
    y += lineHeight;
  }

  if (footerText) {
    ctx.font = fontStack(20, "700");
    ctx.textAlign = "right";
    drawTextWithSpecialFallback(ctx, footerText, width - 40, height - 40, {
      size: 20,
      weight: "700",
      color: "rgba(255,255,255,0.9)",
    });
  }

  return canvas.toBuffer("image/png");
};
