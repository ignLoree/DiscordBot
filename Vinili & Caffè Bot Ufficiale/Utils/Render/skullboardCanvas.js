const canvasModule = require("canvas");
const { registerCanvasFonts, fontStack, drawTextWithSpecialFallback } = require("./canvasFonts");
const { createCanvas, loadImage } = canvasModule;

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCircleImage(ctx, image, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

module.exports = async function renderSkullboardCanvas({ avatarUrl, username, message }) {
  if (!canvasModule) throw new Error("Canvas module not available");
  registerCanvasFonts(canvasModule);
  const width = 900;
  const height = 240;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#2b2f36";
  ctx.fillRect(0, 0, width, height);

  // Message card
  ctx.fillStyle = "#1f2329";
  ctx.fillRect(32, 32, width - 64, height - 64);

  const avatar = await loadImage(avatarUrl);
  drawCircleImage(ctx, avatar, 56, 56, 64);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#c9d1d9";
  ctx.font = fontStack(20, "600");
  drawTextWithSpecialFallback(ctx, username || "", 140, 58, { size: 20, weight: "600", color: "#c9d1d9" });

  const textX = 140;
  const textY = 90;
  const maxWidth = width - textX - 80;
  ctx.font = fontStack(22, "500");
  const lines = wrapLines(ctx, message || "", maxWidth);
  const lineHeight = 28;
  let y = textY;
  for (const line of lines) {
    if (y + lineHeight > height - 32) break;
    drawTextWithSpecialFallback(ctx, line, textX, y, { size: 22, weight: "500", color: "#e6e6e6" });
    y += lineHeight;
  }

  return canvas.toBuffer("image/png");
};
