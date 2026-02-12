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

function drawRoundedImage(ctx, image, x, y, width, height, radius = 6) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();
}

function fitInside(sourceW, sourceH, maxW, maxH) {
  if (!sourceW || !sourceH) return { width: maxW, height: maxH };
  const ratio = Math.min(maxW / sourceW, maxH / sourceH, 1);
  return {
    width: Math.round(sourceW * ratio),
    height: Math.round(sourceH * ratio)
  };
}

function formatTimestamp(date) {
  const opts = { hour: "2-digit", minute: "2-digit", hour12: true };
  const time = new Intl.DateTimeFormat("en-US", opts).format(date);
  return `Today at ${time}`;
}

module.exports = async function renderSkullboardCanvas({
  avatarUrl,
  username,
  message,
  nameColor,
  createdAt,
  reply,
  roleIconUrl,
  mediaUrl,
  hasMedia,
  hasEmbedOnly
}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  registerCanvasFonts(canvasModule);

  const width = 600;
  const outerPad = 16;
  const avatarSize = 40;
  const contentX = outerPad + avatarSize + 12;
  const textMaxWidth = width - contentX - outerPad;
  const topY = outerPad;

  const probe = createCanvas(width, 10).getContext("2d");
  probe.font = fontStack(16, "500");
  const messageLines = hasEmbedOnly ? [] : wrapLines(probe, message || "", textMaxWidth);
  const hasReply = Boolean(reply && (reply.content || reply.author));

  let mediaImage = null;
  if (hasMedia && mediaUrl) {
    mediaImage = await loadImage(mediaUrl).catch(() => null);
  }

  let y = topY;
  const headerY = y;
  const replyY = hasReply ? headerY + 22 : null;
  const messageY = hasReply ? headerY + 44 : headerY + 26;
  const messageH = messageLines.length ? messageLines.length * 20 : 0;
  y = messageY + messageH;

  let mediaLayout = null;
  if (mediaImage) {
    const maxW = Math.min(420, textMaxWidth);
    const maxH = 420;
    const fitted = fitInside(mediaImage.width, mediaImage.height, maxW, maxH);
    mediaLayout = {
      x: contentX,
      y: y + 10,
      width: fitted.width,
      height: fitted.height
    };
    y = mediaLayout.y + mediaLayout.height;
  }

  const height = Math.max(84, y + outerPad);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#313338";
  ctx.fillRect(0, 0, width, height);

  const avatar = await loadImage(avatarUrl);
  drawCircleImage(ctx, avatar, outerPad, topY, avatarSize);

  const userColor = nameColor || "#f2f3f5";
  ctx.textBaseline = "top";
  const usernameSize = 34 / 2;
  const usernameWeight = "600";
  drawTextWithSpecialFallback(ctx, username || "", contentX, headerY, { size: usernameSize, weight: usernameWeight, color: userColor });

  ctx.font = fontStack(usernameSize, usernameWeight);
  let cursorX = contentX + ctx.measureText(username || "").width + 8;
  if (roleIconUrl) {
    const roleIcon = await loadImage(roleIconUrl).catch(() => null);
    if (roleIcon) {
      drawCircleImage(ctx, roleIcon, cursorX, headerY + 1, 14);
      cursorX += 22;
    }
  }
  drawTextWithSpecialFallback(ctx, formatTimestamp(createdAt || new Date()), cursorX, headerY + 1, {
    size: 12,
    weight: "500",
    color: "#b5bac1"
  });

  if (hasReply) {
    const connStartX = outerPad + avatarSize - 3;
    const connStartY = outerPad + avatarSize - 3;
    const connEndX = contentX - 10;
    const connEndY = replyY + 8;
    const radius = 7;

    ctx.strokeStyle = "#4e5058";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(connStartX, connStartY);
    ctx.lineTo(connStartX, connEndY - radius);
    ctx.quadraticCurveTo(connStartX, connEndY, connStartX + radius, connEndY);
    ctx.lineTo(connEndX, connEndY);
    ctx.stroke();

    let rx = contentX;
    if (reply.avatarUrl) {
      const rAvatar = await loadImage(reply.avatarUrl).catch(() => null);
      if (rAvatar) {
        drawCircleImage(ctx, rAvatar, rx, replyY - 1, 14);
        rx += 18;
      }
    }

    const replyName = reply.author || "Unknown";
    const replyNameColor = reply.nameColor || "#b9bbbe";
    drawTextWithSpecialFallback(ctx, replyName, rx, replyY, { size: 12, weight: "600", color: replyNameColor });
    rx += ctx.measureText(replyName).width + 4;

    if (reply.roleIconUrl) {
      const replyIcon = await loadImage(reply.roleIconUrl).catch(() => null);
      if (replyIcon) {
        drawCircleImage(ctx, replyIcon, rx, replyY + 1, 12);
        rx += 16;
      }
    }

    const replyContent = String(reply.content || "").slice(0, 72);
    drawTextWithSpecialFallback(ctx, replyContent, rx, replyY, { size: 12, weight: "500", color: "#b9bbbe" });
  }

  if (messageLines.length) {
    let lineY = messageY;
    for (const line of messageLines) {
      drawTextWithSpecialFallback(ctx, line, contentX, lineY, { size: 33 / 2, weight: "500", color: "#f2f3f5" });
      lineY += 20;
    }
  }

  if (mediaLayout && mediaImage) {
    drawRoundedImage(ctx, mediaImage, mediaLayout.x, mediaLayout.y, mediaLayout.width, mediaLayout.height, 4);
  }

  return canvas.toBuffer("image/png");
};

