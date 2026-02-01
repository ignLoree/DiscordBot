const axios = require("axios");
let canvasModule = null;
try {
  canvasModule = require("canvas");
} catch {
  canvasModule = null;
}

const { registerCanvasFonts, fontStack } = require("./canvasFonts");

const EMOJI_BASE_URL = "https://cdn.discordapp.com/emojis/";

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

async function loadImageFromUrl(url) {
  if (!canvasModule || !url) return null;
  const { loadImage } = canvasModule;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer" });
    return await loadImage(Buffer.from(res.data));
  } catch {
    try {
      return await loadImage(url);
    } catch {
      return null;
    }
  }
}

function getEmojiUrl(id) {
  return `${EMOJI_BASE_URL}${id}.png?size=64&quality=lossless`;
}

function drawEmojiImage(ctx, image, x, y, size) {
  if (!image) return;
  ctx.save();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

function drawEmojiCentered(ctx, image, cx, cy, size) {
  if (!image) return;
  const half = size / 2;
  drawEmojiImage(ctx, image, cx - half, cy - half, size);
}

function formatCompact(value) {
  if (value == null) return "0";
  const num = Number(value) || 0;
  if (num < 1000) return String(Math.round(num));
  if (num < 1000000) {
    const out = (num / 1000).toFixed(num < 10000 ? 2 : 1);
    return out.replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1") + "k";
  }
  const out = (num / 1000000).toFixed(num < 10000000 ? 2 : 1);
  return out.replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1") + "m";
}

function formatHours(seconds) {
  const hours = (Number(seconds) || 0) / 3600;
  const out = hours.toFixed(2);
  return out.replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
}

function formatDateLabel(date) {
  if (!date) return "-";
  try {
    return new Date(date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return "-";
  }
}

function splitValue(value) {
  const text = String(value || "").trim();
  const parts = text.split(" ");
  if (parts.length <= 1) {
    return { number: text, unit: "" };
  }
  return { number: parts[0], unit: parts.slice(1).join(" ") };
}

function drawHashIcon(ctx, x, y, size) {
  ctx.save();
  ctx.strokeStyle = "#D0D4DA";
  ctx.lineWidth = 3;
  const s = size;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.35, y);
  ctx.lineTo(x + s * 0.2, y + s);
  ctx.moveTo(x + s * 0.7, y);
  ctx.lineTo(x + s * 0.55, y + s);
  ctx.moveTo(x, y + s * 0.35);
  ctx.lineTo(x + s, y + s * 0.35);
  ctx.moveTo(x, y + s * 0.7);
  ctx.lineTo(x + s, y + s * 0.7);
  ctx.stroke();
  ctx.restore();
}

function drawSpeakerIcon(ctx, x, y, size) {
  ctx.save();
  ctx.strokeStyle = "#D0D4DA";
  ctx.lineWidth = 3;
  ctx.fillStyle = "#D0D4DA";
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.35);
  ctx.lineTo(x + size * 0.28, y + size * 0.35);
  ctx.lineTo(x + size * 0.55, y + size * 0.15);
  ctx.lineTo(x + size * 0.55, y + size * 0.85);
  ctx.lineTo(x + size * 0.28, y + size * 0.65);
  ctx.lineTo(x, y + size * 0.65);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + size * 0.7, y + size * 0.5, size * 0.18, -0.6, 0.6);
  ctx.stroke();
  ctx.restore();
}

function drawUserIcon(ctx, x, y, size) {
  ctx.save();
  ctx.fillStyle = "#D0D4DA";
  ctx.beginPath();
  ctx.arc(x + size * 0.5, y + size * 0.32, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x + size * 0.15, y + size * 0.55, size * 0.7, size * 0.35, size * 0.18);
  ctx.fill();
  ctx.restore();
}

function drawChevron(ctx, x, y, size) {
  ctx.save();
  ctx.strokeStyle = "#D0D4DA";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size * 0.5, y + size * 0.6);
  ctx.lineTo(x + size, y);
  ctx.stroke();
  ctx.restore();
}

function drawOverviewIcon(ctx, x, y, size) {
  ctx.save();
  ctx.fillStyle = "#C7CBD2";
  const w = size;
  const h = size * 0.9;
  drawRoundedRect(ctx, x, y, w * 0.2, h * 0.7, 2);
  ctx.fill();
  drawRoundedRect(ctx, x + w * 0.3, y + h * 0.15, w * 0.2, h * 0.55, 2);
  ctx.fill();
  drawRoundedRect(ctx, x + w * 0.6, y + h * 0.3, w * 0.2, h * 0.4, 2);
  ctx.fill();
  ctx.restore();
}

function drawBinocularIcon(ctx, x, y, size) {
  ctx.save();
  ctx.fillStyle = "#C7CBD2";
  ctx.strokeStyle = "#9BA2AC";
  ctx.lineWidth = 2;
  const w = size;
  const h = size * 0.9;
  const r = w * 0.22;
  const leftX = x;
  const rightX = x + w * 0.55;
  const topY = y + h * 0.12;
  ctx.beginPath();
  ctx.roundRect(leftX, topY, w * 0.45, h * 0.78, r);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(rightX, topY, w * 0.45, h * 0.78, r);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(x + w * 0.34, y, w * 0.32, h * 0.36, r);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#7E8792";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(leftX + w * 0.22, topY + h * 0.62, w * 0.14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rightX + w * 0.22, topY + h * 0.62, w * 0.14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawHexLogo(ctx, x, y, size) {
  const r = size / 2;
  ctx.save();
  ctx.translate(x + r, y + r);
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "#27C46A";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#0E1A14";
  ctx.font = fontStack(10, "bold");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SB", 0, 1);
  ctx.restore();
}

module.exports = async function renderServerStatsCanvas(data) {
  if (!canvasModule) return null;
  registerCanvasFonts(canvasModule);
  const { createCanvas } = canvasModule;

  const width = 1280;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const emojiHash = await loadImageFromUrl(getEmojiUrl("1443247596922470551"));
  const emojiVoice = await loadImageFromUrl(getEmojiUrl("1467639623735054509"));
  const emojiUser = await loadImageFromUrl(getEmojiUrl("1467639483104231434"));
  const emojiMap = {
    hash: emojiHash,
    speaker: emojiVoice,
    user: emojiUser
  };

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#2b2f35");
  bg.addColorStop(0.55, "#24282e");
  bg.addColorStop(1, "#1d2127");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const cardX = 16;
  const cardY = 16;
  const cardW = width - 32;
  const cardH = height - 32;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#2f3338";
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 26);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1, 26);
  ctx.stroke();
  ctx.restore();

  const headerX = cardX + 26;
  const headerY = cardY + 16;
  const iconSize = 80;
  let headerOffsetX = headerX;
  if (data.guildIconUrl) {
    const icon = await loadImageFromUrl(data.guildIconUrl);
    if (icon) {
      ctx.save();
      ctx.fillStyle = "#1e2228";
      ctx.beginPath();
      ctx.arc(headerX + iconSize / 2, headerY + iconSize / 2, iconSize / 2 + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.arc(headerX + iconSize / 2, headerY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(icon, headerX, headerY, iconSize, iconSize);
      ctx.restore();
      headerOffsetX += iconSize + 16;
    }
  }

  ctx.font = fontStack(32, "bold");
  ctx.fillStyle = "#F4F6F8";
  ctx.textBaseline = "top";
  const serverName = fitText(ctx, data.guildName || "Server Overview", 720);
  ctx.fillText(serverName, headerOffsetX, headerY + 2);

  ctx.font = fontStack(18);
  ctx.fillStyle = "#B8BDC5";
  drawBinocularIcon(ctx, headerOffsetX, headerY + 42, 18);
  ctx.fillText("Server Overview", headerOffsetX + 26, headerY + 40);

  const pillY = headerY + 6;
  const pillH = 40;
  const createdLabel = "Created On";
  const invitedLabel = "Invited Bot On";
  const createdValue = formatDateLabel(data.createdAt);
  const invitedValue = formatDateLabel(data.joinedAt);
  ctx.font = fontStack(12, "bold");
  const createdW = Math.max(170, ctx.measureText(createdLabel).width + 30);
  const invitedW = Math.max(200, ctx.measureText(invitedLabel).width + 30);
  let pillX = cardX + cardW - createdW - invitedW - 26;

  const drawPill = (x, label, value, widthPill) => {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = "#2a2e34";
    drawRoundedRect(ctx, x, pillY, widthPill, pillH, 12);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#C2C6CD";
    ctx.textBaseline = "top";
    ctx.font = fontStack(12, "bold");
    ctx.fillText(label, x + 12, pillY + 6);
    ctx.font = fontStack(16);
    ctx.fillStyle = "#E7EAEE";
    ctx.fillText(value, x + 12, pillY + 20);
  };
  drawPill(pillX, createdLabel, createdValue, createdW);
  drawPill(pillX + createdW + 10, invitedLabel, invitedValue, invitedW);

  function drawStatsBox(x, y, w, h, title, rows, iconType, mode = "stats") {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 7;
    ctx.fillStyle = "#343a41";
    drawRoundedRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 16);
    ctx.stroke();
    ctx.restore();

    ctx.font = fontStack(18, "bold");
    ctx.fillStyle = "#D7DBE2";
    ctx.textBaseline = "top";
    ctx.fillText(title, x + 16, y + 12);

    if (iconType) {
      const centerX = x + w - 22;
      const centerY = y + 24;
      const emoji = emojiMap[iconType];
      if (emoji) {
        drawEmojiCentered(ctx, emoji, centerX, centerY, 18);
      } else {
        const ix = x + w - 30;
        const iy = y + 12;
        if (iconType === "hash") drawHashIcon(ctx, ix, iy, 18);
        if (iconType === "speaker") drawSpeakerIcon(ctx, ix, iy, 18);
        if (iconType === "user") drawUserIcon(ctx, ix, iy, 18);
        if (iconType === "chevron") drawChevron(ctx, ix, iy + 2, 16);
      }
    }

    let rowY = y + 50;
    for (const row of rows) {
      ctx.save();
      ctx.fillStyle = "#1f2328";
      drawRoundedRect(ctx, x + 12, rowY - 10, w - 24, 36, 9);
      ctx.fill();
      ctx.restore();

      if (mode === "stats") {
        const { number, unit } = splitValue(row.value);
        ctx.save();
        ctx.fillStyle = "#171a1f";
        drawRoundedRect(ctx, x + 20, rowY - 8, 46, 28, 7);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "#E6E8EC";
        ctx.font = fontStack(14, "bold");
        ctx.fillText(row.label, x + 33, rowY - 2);
        ctx.fillStyle = "#E7EAEE";
        ctx.textAlign = "left";
        ctx.font = fontStack(18, "bold");
        ctx.fillText(number, x + 78, rowY - 5);
        if (unit) {
          ctx.font = fontStack(15, "italic");
          ctx.fillStyle = "#BFC4CB";
          ctx.fillText(` ${unit}`, x + 78 + ctx.measureText(number).width + 2, rowY - 2);
        }
      } else {
        ctx.fillStyle = "#E0E3E7";
        ctx.font = fontStack(16, "bold");
        ctx.fillText(row.label, x + 48, rowY - 2);
        ctx.fillStyle = "#E7EAEE";
        ctx.textAlign = "right";
        ctx.fillText(row.value, x + w - 24, rowY - 2);
        ctx.textAlign = "left";

        const iconCenterX = x + 30;
        const iconCenterY = rowY + 8;
        const rowEmoji = emojiMap[row.icon];
        if (rowEmoji) {
          drawEmojiCentered(ctx, rowEmoji, iconCenterX, iconCenterY, 20);
        } else {
          const iconX = x + 18;
          const iconY = rowY - 11;
          if (row.icon === "hash") drawHashIcon(ctx, iconX, iconY, 22);
          if (row.icon === "speaker") drawSpeakerIcon(ctx, iconX, iconY + 2, 22);
        }
      }
      rowY += 40;
    }
  }

  const statsY = headerY + 98;
  const boxW = 368;
  const boxH = 154;
  const gap = 16;
  drawStatsBox(headerX, statsY, boxW, boxH, "Messages", [
    { label: "1d", value: `${formatCompact(data.totals?.messages?.d1)} messages` },
    { label: "7d", value: `${formatCompact(data.totals?.messages?.d7)} messages` },
    { label: "14d", value: `${formatCompact(data.totals?.messages?.d14)} messages` }
  ], "hash", "stats");
  drawStatsBox(headerX + boxW + gap, statsY, boxW, boxH, "Voice Activity", [
    { label: "1d", value: `${formatHours(data.totals?.voiceSeconds?.d1)} hours` },
    { label: "7d", value: `${formatHours(data.totals?.voiceSeconds?.d7)} hours` },
    { label: "14d", value: `${formatHours(data.totals?.voiceSeconds?.d14)} hours` }
  ], "speaker", "stats");
  drawStatsBox(headerX + (boxW + gap) * 2, statsY, boxW, boxH, "Contributors", [
    { label: "1d", value: `${formatCompact(data.contributors?.d1)} members` },
    { label: "7d", value: `${formatCompact(data.contributors?.d7)} members` },
    { label: "14d", value: `${formatCompact(data.contributors?.d14)} members` }
  ], "user", "stats");

  const midY = statsY + boxH + 18;
  const midH = 130;
  const midW = (cardW - 52 - gap) / 2;
  drawStatsBox(headerX, midY, midW, midH, "Top Members", [
    {
      icon: "hash",
      label: data.top?.messageUser?.label || "-",
      value: `${formatCompact(data.top?.messageUser?.value || 0)} messages`
    },
    {
      icon: "speaker",
      label: data.top?.voiceUser?.label || "-",
      value: `${formatHours(data.top?.voiceUser?.value || 0)} hours`
    }
  ], "user", "list");
  drawStatsBox(headerX + midW + gap, midY, midW, midH, "Top Channels", [
    {
      icon: "hash",
      label: data.top?.messageChannel?.label || "-",
      value: `${formatCompact(data.top?.messageChannel?.value || 0)} messages`
    },
    {
      icon: "speaker",
      label: data.top?.voiceChannel?.label || "-",
      value: `${formatHours(data.top?.voiceChannel?.value || 0)} hours`
    }
  ], "chevron", "list");

  const chartX = headerX;
  const chartY = midY + midH + 18;
  const chartW = cardW - 52;
  const chartH = cardH - (chartY - cardY) - 52;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 7;
  ctx.fillStyle = "#343a41";
  drawRoundedRect(ctx, chartX, chartY, chartW, chartH, 16);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, chartX + 0.5, chartY + 0.5, chartW - 1, chartH - 1, 16);
  ctx.stroke();
  ctx.restore();

  ctx.font = fontStack(18, "bold");
  ctx.fillStyle = "#D7DBE2";
  ctx.textBaseline = "top";
  ctx.fillText("Charts", chartX + 16, chartY + 12);

  const plotX = chartX + 16;
  const plotY = chartY + 52;
  const plotW = chartW - 32;
  const plotH = chartH - 96;

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = plotY + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX + plotW, y);
    ctx.stroke();
  }

  const messageSeries = Array.isArray(data.series?.message) ? data.series.message : [];
  const voiceSeries = Array.isArray(data.series?.voice) ? data.series.voice : [];
  const maxMsg = Math.max(1, ...messageSeries);
  const maxVoice = Math.max(1, ...voiceSeries);
  const pointCount = Math.max(messageSeries.length, voiceSeries.length, 1);

  const plotLine = (series, maxValue, color) => {
    if (!series.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < series.length; i += 1) {
      const value = series[i] || 0;
      const x = plotX + (plotW / Math.max(1, pointCount - 1)) * i;
      const y = plotY + plotH - (value / maxValue) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  plotLine(messageSeries, maxMsg, "#49C463");
  plotLine(voiceSeries, maxVoice, "#E25598");

  ctx.font = fontStack(15, "bold");
  ctx.fillStyle = "#B8BDC7";
  ctx.textBaseline = "middle";
  const legendY = chartY + 22;
  ctx.fillStyle = "#49C463";
  ctx.beginPath();
  ctx.arc(chartX + chartW - 230, legendY + 3, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#DCE0E4";
  ctx.fillText("Message", chartX + chartW - 214, legendY + 3);
  ctx.fillStyle = "#E25598";
  ctx.beginPath();
  ctx.arc(chartX + chartW - 128, legendY + 3, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#DCE0E4";
  ctx.fillText("Voice", chartX + chartW - 112, legendY + 3);

  const tz = data.timezoneLabel ? `Timezone: ${data.timezoneLabel}` : "Timezone: Local";
  const footerY = chartY + chartH + 24;
  ctx.font = fontStack(14);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`Server Lookback: Last 14 days — ${tz}`, chartX + 16, footerY);
  ctx.textAlign = "right";
  const statbotTextX = chartX + chartW - 16;
  ctx.fillText("Powered by Vinili & Caffè Bot", statbotTextX, footerY);
  ctx.textAlign = "left";
  if (data.botIconUrl) {
    const botIcon = await loadImageFromUrl(data.botIconUrl);
    if (botIcon) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(statbotTextX - 250 + 10, footerY, 10, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(botIcon, statbotTextX - 250, footerY - 10, 20, 20);
      ctx.restore();
    }
  }

  return canvas.toBuffer("image/png");
};
