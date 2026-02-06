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
  const cardX = 24;
  const cardY = 24;
  const cardW = width - 48;
  const cardH = height - 48;
  ctx.fillStyle = "#313338";
  ctx.fillRect(cardX, cardY, cardW, cardH);
  // subtle bottom shadow strip
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(cardX, cardY + cardH - 10, cardW, 10);

  const avatar = await loadImage(avatarUrl);
  drawCircleImage(ctx, avatar, cardX + 20, cardY + 20, 48);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const usernameColor = nameColor || "#f2f3f5";
  ctx.font = fontStack(18, "600");
  drawTextWithSpecialFallback(ctx, username || "", cardX + 84, cardY + 20, { size: 18, weight: "600", color: usernameColor });

  const tsText = formatTimestamp(createdAt || new Date());
  const nameWidth = ctx.measureText(username || "").width;
  let cursorX = cardX + 84 + nameWidth + 12;
  if (roleIconUrl) {
    try {
      const roleIcon = await loadImage(roleIconUrl);
      const size = 16;
      drawCircleImage(ctx, roleIcon, cursorX, cardY + 20, size);
      cursorX += size + 8;
    } catch {}
  }
  drawTextWithSpecialFallback(ctx, tsText, cursorX, cardY + 22, {
    size: 14,
    weight: "500",
    color: "#aeb3b8"
  });

  const textX = cardX + 84;
  let textY = cardY + 48;
  const maxWidth = width - textX - 40;
  const lineHeight = 26;

  if (reply?.content) {
    ctx.font = fontStack(14, "500");
    const replyAuthor = reply.author || "Unknown";
    const replyText = `${replyAuthor}: ${reply.content}`;
    const replyLines = wrapLines(ctx, replyText, maxWidth);
    let ry = textY;
    // left vertical reply bar
    ctx.fillStyle = "#3f4147";
    ctx.fillRect(textX - 12, ry + 2, 3, 16);
    for (const line of replyLines.slice(0, 1)) {
      drawTextWithSpecialFallback(ctx, line, textX, ry, { size: 14, weight: "500", color: "#aeb3b8" });
      ry += 18;
    }
    textY = ry + 4;
  }

  ctx.font = fontStack(20, "500");
  const lines = wrapLines(ctx, message || "", maxWidth);
  let y = textY;
  for (const line of lines) {
    if (y + lineHeight > height - 32) break;
    drawTextWithSpecialFallback(ctx, line, textX, y, { size: 22, weight: "500", color: "#e6e6e6" });
    y += lineHeight;
  }

  return canvas.toBuffer("image/png");
};
