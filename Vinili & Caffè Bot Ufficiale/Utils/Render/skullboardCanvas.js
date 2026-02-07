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
  const cardX = 16;
  const cardY = 16;
  const cardW = width - 32;
  const avatarSize = 40;
  const avatarX = cardX + 16;
  const avatarY = cardY + 8;
  const nameX = avatarX + avatarSize + 12;
  const nameYBase = cardY + 8;
  const maxWidth = width - nameX - 24;
  const lineHeight = 20;
  const replyLineHeight = 14;

  const tmpCanvas = createCanvas(width, 10);
  const tmpCtx = tmpCanvas.getContext("2d");
  registerCanvasFonts(canvasModule);
  tmpCtx.textAlign = "left";
  tmpCtx.textBaseline = "top";

  const replyLine = reply?.content
    ? wrapLines(tmpCtx, `${reply.author || "Unknown"}: ${reply.content}`, maxWidth)[0] || ""
    : "";

  tmpCtx.font = fontStack(16, "500");
  const messageLines = wrapLines(tmpCtx, message || "", maxWidth);

  const replyY = nameYBase + 2;
  const nameY = replyLine ? replyY + 12 : nameYBase;
  const messageY = replyLine ? nameY + 18 : nameY + 18;
  const messageHeight = messageLines.length ? messageLines.length * lineHeight : 0;
  const bottomContentY = messageLines.length
    ? messageY + messageHeight
    : (replyLine ? replyY + replyLineHeight : nameY + 18);
  const contentBottom = Math.max(avatarY + avatarSize, bottomContentY) + 6;
  const cardH = Math.max(72, contentBottom - cardY);
  const height = cardH + 32;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#2b2d31";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#313338";
  ctx.fillRect(cardX, cardY, cardW, cardH);

  const avatar = await loadImage(avatarUrl);
  drawCircleImage(ctx, avatar, avatarX, avatarY, avatarSize);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const usernameColor = nameColor || "#f2f3f5";
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

  if (replyLine) {
    const replyStartX = nameX + 18;
    const replyAvatarSize = 14;
    const replyAvatarX = replyStartX;
    const replyAvatarY = replyY - 1;

    ctx.strokeStyle = "#3f4147";
    ctx.lineWidth = 2;
    const connectorStartX = avatarX + avatarSize / 2;
    const connectorStartY = avatarY + avatarSize;
    const connectorEndX = replyStartX - 6;
    const connectorEndY = replyY + 8;
    ctx.beginPath();
    ctx.moveTo(connectorStartX, connectorStartY);
    ctx.lineTo(connectorStartX, connectorEndY);
    ctx.quadraticCurveTo(connectorStartX, connectorEndY + 6, connectorStartX + 6, connectorEndY + 6);
    ctx.lineTo(connectorEndX, connectorEndY + 6);
    ctx.stroke();

    if (reply?.avatarUrl) {
      try {
        const replyAvatar = await loadImage(reply.avatarUrl);
        drawCircleImage(ctx, replyAvatar, replyAvatarX, replyAvatarY, replyAvatarSize);
      } catch {}
    }

    const replyTextX = replyAvatarX + replyAvatarSize + 6;
    ctx.font = fontStack(12, "500");
    const replyName = reply.author || "Unknown";
    const replyNameColor = reply.nameColor || "#f2f3f5";
    drawTextWithSpecialFallback(ctx, replyName, replyTextX, replyY, { size: 12, weight: "600", color: replyNameColor });
    const replyNameWidth = ctx.measureText(replyName).width;

    let afterNameX = replyTextX + replyNameWidth + 4;
    if (reply?.roleIconUrl) {
      try {
        const replyRoleIcon = await loadImage(reply.roleIconUrl);
        const size = 12;
        drawCircleImage(ctx, replyRoleIcon, afterNameX, replyY + 1, size);
        afterNameX += size + 4;
      } catch {}
    }

    const replyContent = reply.content || "";
    drawTextWithSpecialFallback(ctx, replyContent, afterNameX, replyY, { size: 12, weight: "500", color: "#b5bac1" });
  }

  if (messageLines.length) {
    ctx.font = fontStack(16, "500");
    let y = messageY;
    for (const line of messageLines) {
      drawTextWithSpecialFallback(ctx, line, nameX, y, { size: 16, weight: "500", color: "#e6e6e6" });
      y += lineHeight;
    }
  }

  return canvas.toBuffer("image/png");
};
