const canvasModule = require("canvas");
const { registerCanvasFonts, fontStack, drawTextWithSpecialFallback } = require("./canvasFonts");
const { createCanvas, loadImage } = canvasModule;

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = String(text || "").split(/\r?\n/);
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const width = ctx.measureText(test).width;
      if (width <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        if (ctx.measureText(word).width <= maxWidth) {
          line = word;
        } else {
          let chunk = "";
          for (const ch of word) {
            const attempt = `${chunk}${ch}`;
            if (ctx.measureText(attempt).width > maxWidth) {
              if (chunk) lines.push(chunk);
              chunk = ch;
            } else {
              chunk = attempt;
            }
          }
          line = chunk;
        }
      }
    }
    if (line) lines.push(line);
    lines.push("");
  }
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
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

module.exports = async function renderQuoteCanvas({ avatarUrl, message, username }) {
  if (!canvasModule) {
    throw new Error("Canvas module not available");
  }
  registerCanvasFonts(canvasModule);
  const width = 1024;
  const height = 512;
  const leftWidth = 512;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0f0f12";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#141316";
  ctx.fillRect(leftWidth, 0, width - leftWidth, height);

  const avatar = await loadImage(avatarUrl);
  drawImageCover(ctx, avatar, 0, 0, leftWidth, height);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(leftWidth, 0, width - leftWidth, height);

  const padding = 40;
  const textX = leftWidth + padding;
  const maxTextWidth = width - leftWidth - padding * 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.font = fontStack(20, "italic");
  drawTextWithSpecialFallback(ctx, username || "", textX, 36, {
    size: 20,
    weight: "italic",
    color: "rgba(255,255,255,0.7)"
  });

  ctx.font = fontStack(32, "700");
  const lines = wrapLines(ctx, message || "", maxTextWidth);
  const lineHeight = 38;
  let y = 80;
  for (const line of lines) {
    if (y + lineHeight > height - 36) break;
    drawTextWithSpecialFallback(ctx, line, textX, y, {
      size: 32,
      weight: "700",
      color: "#f3f3f3"
    });
    y += lineHeight;
  }

  return canvas.toBuffer("image/png");
};
