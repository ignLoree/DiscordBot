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
  bg.addColorStop(0, "#272b30");
  bg.addColorStop(0.55, "#1f2328");
  bg.addColorStop(1, "#1a1d22");
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
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 22);
  ctx.fill();
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

  ctx.font = fontStack(28, "bold");
  ctx.fillStyle = "#F1F3F5";
  ctx.textBaseline = "top";
  const serverName = fitText(ctx, data.guildName || "Server Overview", 520);
  ctx.fillText(serverName, headerOffsetX, headerY + 2);

  ctx.font = fontStack(17);
  ctx.fillStyle = "#B3B8BF";
  ctx.fillText("Server Overview", headerOffsetX, headerY + 36);

  const pillY = headerY + 4;
  const pillH = 30;
  const createdLabel = "Created On";
  const invitedLabel = "Invited Bot On";
  const createdValue = formatDateLabel(data.createdAt);
  const invitedValue = formatDateLabel(data.joinedAt);
  ctx.font = fontStack(13, "bold");
  const createdW = Math.max(150, ctx.measureText(createdLabel).width + 26);
  const invitedW = Math.max(170, ctx.measureText(invitedLabel).width + 26);
  let pillX = cardX + cardW - createdW - invitedW - 24;

  const drawPill = (x, label, value, widthPill) => {
    ctx.save();
    ctx.fillStyle = "rgba(30,33,38,0.95)";
    drawRoundedRect(ctx, x, pillY, widthPill, pillH, 10);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#C9CDD3";
    ctx.textBaseline = "top";
    ctx.font = fontStack(12, "bold");
    ctx.fillText(label, x + 12, pillY + 6);
    ctx.font = fontStack(15);
    ctx.fillStyle = "#E7E9EC";
    ctx.fillText(value, x + 12, pillY + 16);
  };
  drawPill(pillX, createdLabel, createdValue, createdW);
  drawPill(pillX + createdW + 10, invitedLabel, invitedValue, invitedW);

  function drawStatsBox(x, y, w, h, title, rows, icon) {
    ctx.save();
    ctx.fillStyle = "rgba(41,45,51,0.98)";
    drawRoundedRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.restore();
    ctx.font = fontStack(17, "bold");
    ctx.fillStyle = "#D7DBE1";
    ctx.textBaseline = "top";
    ctx.fillText(title, x + 16, y + 12);
    if (icon) {
      ctx.font = fontStack(17, "bold");
      ctx.fillStyle = "#C3C7CD";
      ctx.textAlign = "right";
      ctx.fillText(icon, x + w - 16, y + 12);
      ctx.textAlign = "left";
    }
    ctx.font = fontStack(14, "bold");
    let rowY = y + 44;
    for (const row of rows) {
      ctx.save();
      ctx.fillStyle = "rgba(28,31,36,0.95)";
      drawRoundedRect(ctx, x + 12, rowY - 6, w - 24, 28, 8);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#D5D9DF";
      ctx.fillText(row.label, x + 26, rowY);
      ctx.fillStyle = "#E9ECEF";
      ctx.textAlign = "right";
      ctx.fillText(row.value, x + w - 24, rowY);
      ctx.textAlign = "left";
      rowY += 36;
    }
  }

  const statsY = headerY + 88;
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
  ], "🔊");
  drawStatsBox(headerX + (boxW + gap) * 2, statsY, boxW, boxH, "Contributors", [
    { label: "1d", value: `${formatCompact(data.contributors?.d1)} members` },
    { label: "7d", value: `${formatCompact(data.contributors?.d7)} members` },
    { label: "14d", value: `${formatCompact(data.contributors?.d14)} members` }
  ], "●");

  const midY = statsY + boxH + 18;
  const midH = 120;
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
  ], "●");
  drawStatsBox(headerX + midW + gap, midY, midW, midH, "Top Channels", [
    {
      label: data.top?.messageChannel?.label || "-",
      value: `${formatCompact(data.top?.messageChannel?.value || 0)} messages`
    },
    {
      label: data.top?.voiceChannel?.label || "-",
      value: `${formatHours(data.top?.voiceChannel?.value || 0)} hours`
    }
  ], "⌄");

  const chartX = headerX;
  const chartY = midY + midH + 18;
  const chartW = cardW - 52;
  const chartH = cardH - (chartY - cardY) - 22;
  ctx.save();
  ctx.fillStyle = "rgba(41,45,51,0.98)";
  drawRoundedRect(ctx, chartX, chartY, chartW, chartH, 14);
  ctx.fill();
  ctx.restore();

  ctx.font = fontStack(17, "bold");
  ctx.fillStyle = "#D7DBE1";
  ctx.textBaseline = "top";
  ctx.fillText("Charts", chartX + 16, chartY + 10);

  const plotX = chartX + 16;
  const plotY = chartY + 46;
  const plotW = chartW - 32;
  const plotH = chartH - 86;

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

  ctx.font = fontStack(14, "bold");
  ctx.fillStyle = "#B8BDC7";
  ctx.textBaseline = "middle";
  const legendY = chartY + 24;
  ctx.fillStyle = "#49C463";
  ctx.beginPath();
  ctx.arc(chartX + chartW - 220, legendY + 2, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#DCE0E4";
  ctx.fillText("Message", chartX + chartW - 206, legendY + 2);
  ctx.fillStyle = "#E25598";
  ctx.beginPath();
  ctx.arc(chartX + chartW - 114, legendY + 2, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#DCE0E4";
  ctx.fillText("Voice", chartX + chartW - 100, legendY + 2);

  const tz = data.timezoneLabel ? `Timezone: ${data.timezoneLabel}` : "";
  ctx.font = fontStack(14);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  if (tz) ctx.fillText(`Server Lookback: Last 14 days — ${tz}`, chartX + 16, chartY + chartH - 30);
  ctx.textAlign = "right";
  ctx.fillText("Powered by Vinili & Caffè Bot", chartX + chartW - 16, chartY + chartH - 30);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
};
