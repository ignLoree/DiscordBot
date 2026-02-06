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

function formatTimestamp(date) {
  const opts = { hour: "2-digit", minute: "2-digit", hour12: true };
  const time = new Intl.DateTimeFormat("en-US", opts).format(date);
  return `Today at ${time}`;
}

module.exports = async function renderSkullboardCanvas({ avatarUrl, username, message, nameColor, createdAt, reply, roleIconUrl }) {
  if (!canvasModule) throw new Error("Canvas module not available");
  registerCanvasFonts(canvasModule);
  const width = 900;
  const height = 200;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#2b2d31";
  ctx.fillRect(0, 0, width, height);

  // Message card
  const cardX = 16;
  const cardY = 16;
  const cardW = width - 32;
  const cardH = height - 32;
  ctx.fillStyle = "#313338";
  ctx.fillRect(cardX, cardY, cardW, cardH);

  const avatar = await loadImage(avatarUrl);
  drawCircleImage(ctx, avatar, cardX + 16, cardY + 16, 40);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const usernameColor = nameColor || "#f2f3f5";
  const nameX = cardX + 68;
  const nameY = cardY + 8;
  ctx.font = fontStack(16, "600");
  drawTextWithSpecialFallback(ctx, username || "", nameX, nameY, { size: 16, weight: "600", color: usernameColor });

  const tsText = formatTimestamp(createdAt || new Date());
  const nameWidth = ctx.measureText(username || "").width;
  let cursorX = nameX + nameWidth + 10;
  if (roleIconUrl) {
    try {
      const roleIcon = await loadImage(roleIconUrl);
      const size = 14;
      drawCircleImage(ctx, roleIcon, cursorX, nameY + 1, size);
      cursorX += size + 6;
    } catch {}
  }
  drawTextWithSpecialFallback(ctx, tsText, cursorX, nameY + 2, {
    size: 12,
    weight: "500",
    color: "#aeb3b8"
  });

  const textX = nameX;
  let textY = cardY + 32;
  const maxWidth = width - textX - 32;
  const lineHeight = 22;

  if (reply?.content) {
    ctx.font = fontStack(13, "500");
    const replyAuthor = reply.author || "Unknown";
    const replyText = `${replyAuthor}: ${reply.content}`;
    const replyLines = wrapLines(ctx, replyText, maxWidth);
    let ry = textY;
    // left vertical reply bar
    ctx.fillStyle = "#3f4147";
    ctx.fillRect(textX - 10, ry + 2, 2, 14);
    for (const line of replyLines.slice(0, 1)) {
      drawTextWithSpecialFallback(ctx, line, textX, ry, { size: 13, weight: "500", color: "#aeb3b8" });
      ry += 16;
    }
    textY = ry + 4;
  }

  ctx.font = fontStack(18, "500");
  const lines = wrapLines(ctx, message || "", maxWidth);
  let y = textY;
  for (const line of lines) {
    if (y + lineHeight > height - 32) break;
    drawTextWithSpecialFallback(ctx, line, textX, y, { size: 18, weight: "500", color: "#e6e6e6" });
    y += lineHeight;
  }

  return canvas.toBuffer("image/png");
};
