const axios = require("axios");
let canvasModule = null;
try {
  canvasModule = require("canvas");
} catch {
  canvasModule = null;
}

const { registerCanvasFonts, fontStack } = require("./canvasFonts");

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
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return "-";
  }
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

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#2b2f35");
  bg.addColorStop(0.55, "#21252b");
  bg.addColorStop(1, "#1b1f25");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const cardX = 22;
  const cardY = 22;
  const cardW = width - 44;
  const cardH = height - 44;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "rgba(45,49,56,0.98)";
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1, 24);
  ctx.stroke();
  ctx.restore();

  const headerX = cardX + 26;
  const headerY = cardY + 18;
  const iconSize = 64;
  let headerOffsetX = headerX;
  if (data.guildIconUrl) {
    const icon = await loadImageFromUrl(data.guildIconUrl);
    if (icon) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(headerX + iconSize / 2, headerY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(icon, headerX, headerY, iconSize, iconSize);
      ctx.restore();
      headerOffsetX += iconSize + 12;
    }
  }

  ctx.font = fontStack(30, "bold");
  ctx.fillStyle = "#F1F3F5";
  ctx.textBaseline = "top";
  const serverName = fitText(ctx, data.guildName || "Server Overview", 560);
  ctx.fillText(serverName, headerOffsetX, headerY + 2);

  ctx.font = fontStack(18);
  ctx.fillStyle = "#AEB4BC";
  ctx.fillText("Server Overview", headerOffsetX, headerY + 38);

  const pillY = headerY + 4;
  const pillH = 36;
  const createdLabel = "Created On";
  const invitedLabel = "Invited Bot On";
  const createdValue = formatDateLabel(data.createdAt);
  const invitedValue = formatDateLabel(data.joinedAt);
  ctx.font = fontStack(13, "bold");
  const createdW = Math.max(160, ctx.measureText(createdLabel).width + 30);
  const invitedW = Math.max(190, ctx.measureText(invitedLabel).width + 30);
  let pillX = cardX + cardW - createdW - invitedW - 26;

  const drawPill = (x, label, value, widthPill) => {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "rgba(33,36,41,0.98)";
    drawRoundedRect(ctx, x, pillY, widthPill, pillH, 11);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#C9CDD3";
    ctx.textBaseline = "top";
    ctx.font = fontStack(12, "bold");
    ctx.fillText(label, x + 12, pillY + 6);
    ctx.font = fontStack(16);
    ctx.fillStyle = "#E7E9EC";
    ctx.fillText(value, x + 12, pillY + 18);
  };
  drawPill(pillX, createdLabel, createdValue, createdW);
  drawPill(pillX + createdW + 10, invitedLabel, invitedValue, invitedW);

  function drawStatsBox(x, y, w, h, title, rows, icon) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = "rgba(44,48,54,0.98)";
    drawRoundedRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 14);
    ctx.stroke();
    ctx.restore();
    ctx.font = fontStack(18, "bold");
    ctx.fillStyle = "#D7DBE2";
    ctx.textBaseline = "top";
    ctx.fillText(title, x + 16, y + 12);
    if (icon) {
      ctx.font = fontStack(18, "bold");
      ctx.fillStyle = "#BFC4CB";
      ctx.textAlign = "right";
      ctx.fillText(icon, x + w - 16, y + 12);
      ctx.textAlign = "left";
    }
    ctx.font = fontStack(15, "bold");
    let rowY = y + 48;
    for (const row of rows) {
      ctx.save();
      ctx.fillStyle = "rgba(26,29,34,0.95)";
      drawRoundedRect(ctx, x + 12, rowY - 8, w - 24, 32, 8);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#D4D8DE";
      ctx.fillText(row.label, x + 26, rowY - 2);
      ctx.fillStyle = "#E7EAEE";
      ctx.textAlign = "right";
      ctx.fillText(row.value, x + w - 24, rowY - 2);
      ctx.textAlign = "left";
      rowY += 40;
    }
  }

  const statsY = headerY + 96;
  const boxW = 360;
  const boxH = 150;
  const gap = 18;
  drawStatsBox(headerX, statsY, boxW, boxH, "Messages", [
    { label: "1d", value: `${formatCompact(data.totals?.messages?.d1)} messages` },
    { label: "7d", value: `${formatCompact(data.totals?.messages?.d7)} messages` },
    { label: "14d", value: `${formatCompact(data.totals?.messages?.d14)} messages` }
  ], "#");
  drawStatsBox(headerX + boxW + gap, statsY, boxW, boxH, "Voice Activity", [
    { label: "1d", value: `${formatHours(data.totals?.voiceSeconds?.d1)} hours` },
    { label: "7d", value: `${formatHours(data.totals?.voiceSeconds?.d7)} hours` },
    { label: "14d", value: `${formatHours(data.totals?.voiceSeconds?.d14)} hours` }
  ], "V");
  drawStatsBox(headerX + (boxW + gap) * 2, statsY, boxW, boxH, "Contributors", [
    { label: "1d", value: `${formatCompact(data.contributors?.d1)} members` },
    { label: "7d", value: `${formatCompact(data.contributors?.d7)} members` },
    { label: "14d", value: `${formatCompact(data.contributors?.d14)} members` }
  ], "C");

  const midY = statsY + boxH + 18;
  const midH = 122;
  const midW = (cardW - 52 - gap) / 2;
  drawStatsBox(headerX, midY, midW, midH, "Top Members", [
    {
      label: data.top?.messageUser?.label || "-",
      value: `${formatCompact(data.top?.messageUser?.value || 0)} messages`
    },
    {
      label: data.top?.voiceUser?.label || "-",
      value: `${formatHours(data.top?.voiceUser?.value || 0)} hours`
    }
  ], "M");
  drawStatsBox(headerX + midW + gap, midY, midW, midH, "Top Channels", [
    {
      label: data.top?.messageChannel?.label || "-",
      value: `${formatCompact(data.top?.messageChannel?.value || 0)} messages`
    },
    {
      label: data.top?.voiceChannel?.label || "-",
      value: `${formatHours(data.top?.voiceChannel?.value || 0)} hours`
    }
  ], "CH");

  const chartX = headerX;
  const chartY = midY + midH + 18;
  const chartW = cardW - 52;
  const chartH = cardH - (chartY - cardY) - 22;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = "rgba(44,48,54,0.98)";
  drawRoundedRect(ctx, chartX, chartY, chartW, chartH, 14);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, chartX + 0.5, chartY + 0.5, chartW - 1, chartH - 1, 14);
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

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
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
    ctx.lineWidth = 2;
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
  ctx.arc(chartX + chartW - 230, legendY + 3, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#DCE0E4";
  ctx.fillText("Message", chartX + chartW - 214, legendY + 3);
  ctx.fillStyle = "#E25598";
  ctx.beginPath();
  ctx.arc(chartX + chartW - 128, legendY + 3, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#DCE0E4";
  ctx.fillText("Voice", chartX + chartW - 112, legendY + 3);

  const tz = data.timezoneLabel ? `Timezone: ${data.timezoneLabel}` : "Timezone: Local";
  ctx.font = fontStack(14);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText(`Server Lookback: Last 14 days -- ${tz}`, chartX + 16, chartY + chartH - 30);
  ctx.textAlign = "right";
  ctx.fillText("Powered by Statbot", chartX + chartW - 16, chartY + chartH - 30);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
};