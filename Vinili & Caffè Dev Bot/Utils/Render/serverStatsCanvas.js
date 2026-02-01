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

function splitValue(value) {
  const text = String(value || "").trim();
  const parts = text.split(" ");
  if (parts.length <= 1) {
    return { number: text, unit: "" };
  }
  return { number: parts[0], unit: parts.slice(1).join(" ") };
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
  bg.addColorStop(0.55, "#24282e");
  bg.addColorStop(1, "#1d2127");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const cardX = 20;
  const cardY = 20;
  const cardW = width - 40;
  const cardH = height - 40;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "rgba(47,51,57,0.98)";
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
  const iconSize = 72;
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
      ctx.save();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(headerX + iconSize / 2, headerY + iconSize / 2, iconSize / 2 - 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      headerOffsetX += iconSize + 14;
    }
  }

  ctx.font = fontStack(34, "bold");
  ctx.fillStyle = "#F4F6F8";
  ctx.textBaseline = "top";
  const serverName = fitText(ctx, data.guildName || "Server Overview", 640);
  ctx.fillText(serverName, headerOffsetX, headerY + 2);

  ctx.font = fontStack(19);
  ctx.fillStyle = "#B2B7BF";
  ctx.fillText("?? Server Overview", headerOffsetX, headerY + 42);

  const pillY = headerY + 6;
  const pillH = 40;
  const createdLabel = "Created On";
  const invitedLabel = "Invited Bot On";
  const createdValue = formatDateLabel(data.createdAt);
  const invitedValue = formatDateLabel(data.joinedAt);
  ctx.font = fontStack(12, "bold");
  const createdW = Math.max(160, ctx.measureText(createdLabel).width + 30);
  const invitedW = Math.max(190, ctx.measureText(invitedLabel).width + 30);
  let pillX = cardX + cardW - createdW - invitedW - 26;

  const drawPill = (x, label, value, widthPill) => {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = "rgba(36,39,44,0.98)";
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

  function drawStatsBox(x, y, w, h, title, rows, icon, mode = "stats") {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.38)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "rgba(44,48,54,0.98)";
    drawRoundedRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 16);
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

    let rowY = y + 50;
    for (const row of rows) {
      ctx.save();
      ctx.fillStyle = "rgba(27,30,35,0.95)";
      drawRoundedRect(ctx, x + 12, rowY - 10, w - 24, 34, 9);
      ctx.fill();
      ctx.restore();

      if (mode === "stats") {
        const { number, unit } = splitValue(row.value);
        ctx.save();
        ctx.fillStyle = "rgba(18,20,24,0.85)";
        drawRoundedRect(ctx, x + 20, rowY - 8, 44, 28, 7);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "#E6E8EC";
        ctx.font = fontStack(14, "bold");
        ctx.fillText(row.label, x + 32, rowY - 2);
        ctx.fillStyle = "#E7EAEE";
        ctx.textAlign = "left";
        ctx.font = fontStack(16, "bold");
        ctx.fillText(number, x + 76, rowY - 4);
        if (unit) {
          ctx.font = fontStack(14);
          ctx.fillStyle = "#BFC4CB";
          ctx.fillText(` ${unit}`, x + 76 + ctx.measureText(number).width + 2, rowY - 2);
        }
      } else {
        ctx.fillStyle = "#E0E3E7";
        const rowIcon = row.icon ? `${row.icon} ` : "";
        ctx.font = fontStack(16, "bold");
        ctx.fillText(`${rowIcon}${row.label}`, x + 24, rowY - 2);
        ctx.fillStyle = "#E7EAEE";
        ctx.textAlign = "right";
        ctx.fillText(row.value, x + w - 24, rowY - 2);
        ctx.textAlign = "left";
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
  ], "#", "stats");
  drawStatsBox(headerX + boxW + gap, statsY, boxW, boxH, "Voice Activity", [
    { label: "1d", value: `${formatHours(data.totals?.voiceSeconds?.d1)} hours` },
    { label: "7d", value: `${formatHours(data.totals?.voiceSeconds?.d7)} hours` },
    { label: "14d", value: `${formatHours(data.totals?.voiceSeconds?.d14)} hours` }
  ], "??", "stats");
  drawStatsBox(headerX + (boxW + gap) * 2, statsY, boxW, boxH, "Contributors", [
    { label: "1d", value: `${formatCompact(data.contributors?.d1)} members` },
    { label: "7d", value: `${formatCompact(data.contributors?.d7)} members` },
    { label: "14d", value: `${formatCompact(data.contributors?.d14)} members` }
  ], "??", "stats");

  const midY = statsY + boxH + 18;
  const midH = 126;
  const midW = (cardW - 52 - gap) / 2;
  drawStatsBox(headerX, midY, midW, midH, "Top Members", [
    {
      icon: "#",
      label: data.top?.messageUser?.label || "-",
      value: `${formatCompact(data.top?.messageUser?.value || 0)} messages`
    },
    {
      icon: "??",
      label: data.top?.voiceUser?.label || "-",
      value: `${formatHours(data.top?.voiceUser?.value || 0)} hours`
    }
  ], "??", "list");
  drawStatsBox(headerX + midW + gap, midY, midW, midH, "Top Channels", [
    {
      icon: "#",
      label: data.top?.messageChannel?.label || "-",
      value: `${formatCompact(data.top?.messageChannel?.value || 0)} messages`
    },
    {
      icon: "??",
      label: data.top?.voiceChannel?.label || "-",
      value: `${formatHours(data.top?.voiceChannel?.value || 0)} hours`
    }
  ], "?", "list");

  const chartX = headerX;
  const chartY = midY + midH + 18;
  const chartW = cardW - 52;
  const chartH = cardH - (chartY - cardY) - 22;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.38)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "rgba(44,48,54,0.98)";
  drawRoundedRect(ctx, chartX, chartY, chartW, chartH, 16);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
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

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
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
    ctx.lineWidth = 2.5;
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
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`Server Lookback: Last 14 days — ${tz}`, chartX + 16, chartY + chartH - 30);
  ctx.textAlign = "right";
  const statbotTextX = chartX + chartW - 16;
  ctx.fillText("Powered by Statbot", statbotTextX, chartY + chartH - 30);
  ctx.textAlign = "left";
  ctx.save();
  ctx.fillStyle = "#2ECC71";
  ctx.beginPath();
  ctx.arc(statbotTextX - 140, chartY + chartH - 26, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return canvas.toBuffer("image/png");
};
