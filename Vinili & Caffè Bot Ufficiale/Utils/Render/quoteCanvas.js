const canvasModule = require("canvas");
const { registerCanvasFonts, fontStack, drawTextWithSpecialFallback } = require("./canvasFonts");
const { createCanvas, loadImage } = canvasModule;

function wrapLines(ctx, text, maxWidth, maxLines = 3) {
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
    if (lines.length >= maxLines + 1) break;
  }
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines.length > maxLines) {
    const trimmed = lines.slice(0, maxLines);
    const last = trimmed[maxLines - 1];
    trimmed[maxLines - 1] = last.length > 2 ? `${last.slice(0, -1)}…` : `${last}…`;
    return trimmed;
  }
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

module.exports = async function renderQuoteCanvas({ avatarUrl, message, username, footerText }) {
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
  ctx.fillStyle = "#070707";
  ctx.fillRect(leftWidth, 0, width - leftWidth, height);

  const avatar = await loadImage(avatarUrl);
  drawImageCover(ctx, avatar, 0, 0, leftWidth, height);

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, leftWidth, height);
  ctx.fillStyle = "#070707";
  ctx.fillRect(leftWidth, 0, width - leftWidth, height);

  const gradient = ctx.createLinearGradient(leftWidth - 40, 0, leftWidth + 160, 0);
  gradient.addColorStop(0, "rgba(0,0,0,0.0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = gradient;
  ctx.fillRect(leftWidth - 40, 0, 200, height);

  const padding = 48;
  const textX = leftWidth + (width - leftWidth) / 2;
  const maxTextWidth = width - leftWidth - padding * 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const mainText = String(message || "").toUpperCase();
  ctx.font = fontStack(30, "600");
  const lines = wrapLines(ctx, mainText, maxTextWidth, 3);
  const lineHeight = 38;
  const blockHeight = lines.length * lineHeight;
  let y = Math.max(140, (height - blockHeight) / 2);

  ctx.font = fontStack(18, "italic");
  drawTextWithSpecialFallback(ctx, username || "", textX, y - 36, {
    size: 18,
    weight: "italic",
    color: "rgba(255,255,255,0.7)"
  });
  for (const line of lines) {
    if (y + lineHeight > height - 36) break;
    drawTextWithSpecialFallback(ctx, line, textX, y, {
      size: 30,
      weight: "600",
      color: "#f7f7f7"
    });
    y += lineHeight;
  }

  if (footerText) {
    ctx.font = fontStack(20, "700");
    ctx.textAlign = "right";
    drawTextWithSpecialFallback(ctx, footerText, width - 40, height - 40, {
      size: 20,
      weight: "700",
      color: "rgba(255,255,255,0.9)"
    });
  }

  return canvas.toBuffer("image/png");
};
