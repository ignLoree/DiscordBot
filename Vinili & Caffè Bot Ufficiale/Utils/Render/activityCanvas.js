const canvasModule = require('canvas');
const { createCanvas, loadImage } = canvasModule;
const { registerCanvasFonts, drawTextWithSpecialFallback } = require('./canvasFonts');

function roundRect(ctx, x, y, w, h, r = 14) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function formatHours(seconds) {
  return (Number(seconds || 0) / 3600).toFixed(2);
}

function compactNumber(value) {
  const n = Number(value || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`;
  return `${n}`;
}

function fitText(ctx, text, maxWidth) {
  const value = String(text || '');
  if (!value) return '-';
  if (ctx.measureText(value).width <= maxWidth) return value;
  const ellipsis = '...';
  let out = value;
  while (out.length > 1 && ctx.measureText(`${out}${ellipsis}`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}${ellipsis}`;
}

function drawLabel(ctx, text, x, y, size = 18, color = '#c4c9d1', weight = '600', align = 'left', normalizeCompatibility = true) {
  drawTextWithSpecialFallback(ctx, text, x, y, {
    size,
    weight,
    color,
    align,
    baseline: 'middle',
    normalizeCompatibility
  });
}

function drawTopChip(ctx, label, value, unit, x, y, w, h) {
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = '#171c23';
  ctx.fill();
  const safeLabel = String(label || '-').trim() || '-';
  drawLabel(ctx, fitText(ctx, safeLabel, w - 220), x + 16, y + (h / 2), 18, '#d8dbe1', '700');
  drawLabel(ctx, `${value} ${unit || ''}`.trim(), x + w - 16, y + (h / 2), 16, '#cfd3db', '600', 'right');
}

function drawMetricPanel(ctx, title, rows, x, y, w, h) {
  roundRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = '#2f343d';
  ctx.fill();
  drawLabel(ctx, title, x + 16, y + 24, 22, '#d9dde3', '700');

  const rowHeight = 56;
  const startY = y + 44;
  for (let i = 0; i < rows.length; i += 1) {
    const ry = startY + (i * rowHeight);
    roundRect(ctx, x + 14, ry, w - 28, 50, 10);
    ctx.fillStyle = '#1d2229';
    ctx.fill();

    roundRect(ctx, x + 14, ry, 98, 50, 10);
    ctx.fillStyle = '#13181f';
    ctx.fill();

    drawLabel(ctx, rows[i].label, x + 63, ry + 25, 16, '#dce0e6', '700', 'center');
    drawLabel(ctx, rows[i].value, x + 126, ry + 25, 16, '#dce0e6', '600');
  }
}

function drawChart(ctx, chart, x, y, w, h) {
  roundRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = '#2f343d';
  ctx.fill();
  drawLabel(ctx, 'Charts', x + 16, y + 24, 22, '#d9dde3', '700');
  drawLabel(ctx, 'Message', x + w - 200, y + 24, 16, '#3ec455', '700');
  drawLabel(ctx, 'Voice', x + w - 74, y + 24, 16, '#d95095', '700');

  const px = x + 16;
  const py = y + 44;
  const pw = w - 32;
  const ph = h - 60;
  roundRect(ctx, px, py, pw, ph, 12);
  ctx.fillStyle = '#20252d';
  ctx.fill();

  const points = Array.isArray(chart) ? chart : [];
  if (points.length < 2) return;

  const msgValues = points.map((p) => Number(p?.text || 0));
  const voiceValues = points.map((p) => Number(p?.voiceSeconds || 0) / 3600);
  const maxV = Math.max(1, ...msgValues, ...voiceValues);

  const projectX = (idx) => px + (idx * (pw / (points.length - 1)));
  const projectY = (value) => py + ph - ((value / maxV) * (ph - 10)) - 5;

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3ec455';
  ctx.beginPath();
  msgValues.forEach((v, i) => {
    const cx = projectX(i);
    const cy = projectY(v);
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.stroke();

  ctx.strokeStyle = '#d95095';
  ctx.beginPath();
  voiceValues.forEach((v, i) => {
    const cx = projectX(i);
    const cy = projectY(v);
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.stroke();
}

async function drawAvatarCircle(ctx, avatarUrl, x, y, size) {
  if (!avatarUrl) return;
  const image = await loadImage(avatarUrl).catch(() => null);
  if (!image) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + (size / 2), y + (size / 2), size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x + (size / 2), y + (size / 2), size / 2, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.stroke();
}

function drawDateBadge(ctx, title, value, x, y, w = 300, h = 72) {
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = '#31363f';
  ctx.fill();
  roundRect(ctx, x + 10, y - 8, w - 20, 30, 9);
  ctx.fillStyle = '#4a515c';
  ctx.fill();
  drawLabel(ctx, title, x + 20, y + 6, 14, '#dbe0e8', '700');
  drawLabel(ctx, value, x + 20, y + 42, 18, '#e8ecf2', '600');
}

function dateText(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

async function renderUserActivityCanvas({
  guildName,
  userTag,
  displayName,
  avatarUrl,
  createdOn,
  joinedOn,
  lookbackDays,
  windows,
  ranks,
  topChannelsText,
  topChannelsVoice,
  chart
}) {
  registerCanvasFonts(canvasModule);
  const width = 1280;
  const height = 700;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1f242c';
  ctx.fillRect(0, 0, width, height);
  roundRect(ctx, 0, 0, width, height, 28);
  ctx.clip();

  await drawAvatarCircle(ctx, avatarUrl, 22, 20, 90);
  drawLabel(ctx, fitText(ctx, `${displayName || userTag}`, 540), 124, 52, 48, '#dfe4eb', '700');
  drawLabel(ctx, fitText(ctx, `${guildName || 'Server'} - My Activity`, 540), 124, 90, 22, '#b9c0ca', '600');

  drawDateBadge(ctx, 'Created On', dateText(createdOn), 700, 22, 250, 78);
  drawDateBadge(ctx, 'Joined On', dateText(joinedOn), 960, 22, 290, 78);

  drawMetricPanel(ctx, 'Server Ranks', [
    { label: 'Text', value: `#${ranks?.text || '-'}` },
    { label: 'Voice', value: `#${ranks?.voice || '-'}` }
  ], 20, 132, 400, 236);

  drawMetricPanel(ctx, 'Messages', [
    { label: '1d', value: `${compactNumber(windows?.d1?.text)} messages` },
    { label: '7d', value: `${compactNumber(windows?.d7?.text)} messages` },
    { label: '14d', value: `${compactNumber(windows?.d14?.text)} messages` }
  ], 440, 132, 400, 236);

  drawMetricPanel(ctx, 'Voice Activity', [
    { label: '1d', value: `${formatHours(windows?.d1?.voiceSeconds)} hours` },
    { label: '7d', value: `${formatHours(windows?.d7?.voiceSeconds)} hours` },
    { label: '14d', value: `${formatHours(windows?.d14?.voiceSeconds)} hours` }
  ], 860, 132, 400, 236);

  roundRect(ctx, 20, 392, 610, 242, 18);
  ctx.fillStyle = '#2f343d';
  ctx.fill();
  drawLabel(ctx, 'Top Channels & Applications', 34, 422, 22, '#d9dde3', '700');
  drawTopChip(ctx, topChannelsText?.[0]?.label || '#-', `${compactNumber(topChannelsText?.[0]?.value || 0)}`, 'messages', 34, 442, 582, 60);
  drawTopChip(ctx, topChannelsVoice?.[0]?.label || '#-', `${formatHours(topChannelsVoice?.[0]?.value || 0)}`, 'hours', 34, 510, 582, 60);

  drawChart(ctx, chart, 650, 392, 610, 242);
  drawLabel(ctx, `Server Lookback: Last ${lookbackDays || 14} days`, 24, 670, 16, '#cdd2da', '700');

  return canvas.toBuffer('image/png');
}

async function renderServerActivityCanvas({
  guildName,
  guildIconUrl,
  createdOn,
  invitedBotOn,
  lookbackDays,
  windows,
  topUsersText,
  topUsersVoice,
  topChannelsText,
  topChannelsVoice,
  chart
}) {
  registerCanvasFonts(canvasModule);
  const width = 1280;
  const height = 910;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1f242c';
  ctx.fillRect(0, 0, width, height);
  roundRect(ctx, 0, 0, width, height, 28);
  ctx.clip();

  await drawAvatarCircle(ctx, guildIconUrl, 26, 20, 90);
  drawLabel(ctx, fitText(ctx, guildName || 'Server', 500), 124, 52, 48, '#dfe4eb', '700');
  drawLabel(ctx, 'Server Overview', 124, 90, 22, '#b9c0ca', '600');

  drawDateBadge(ctx, 'Created On', dateText(createdOn), 650, 22, 270, 80);
  drawDateBadge(ctx, 'Invited Bot On', dateText(invitedBotOn), 940, 22, 300, 80);

  drawMetricPanel(ctx, 'Messages', [
    { label: '1d', value: `${compactNumber(windows?.d1?.text)} messages` },
    { label: '7d', value: `${compactNumber(windows?.d7?.text)} messages` },
    { label: '14d', value: `${compactNumber(windows?.d14?.text)} messages` }
  ], 20, 132, 400, 220);

  drawMetricPanel(ctx, 'Voice Activity', [
    { label: '1d', value: `${formatHours(windows?.d1?.voiceSeconds)} hours` },
    { label: '7d', value: `${formatHours(windows?.d7?.voiceSeconds)} hours` },
    { label: '14d', value: `${formatHours(windows?.d14?.voiceSeconds)} hours` }
  ], 440, 132, 400, 220);

  drawMetricPanel(ctx, 'Contributors', [
    { label: '1d', value: `${Number(windows?.d1?.contributors || 0)} members` },
    { label: '7d', value: `${Number(windows?.d7?.contributors || 0)} members` },
    { label: '14d', value: `${Number(windows?.d14?.contributors || 0)} members` }
  ], 860, 132, 400, 220);

  roundRect(ctx, 20, 370, 600, 220, 18);
  ctx.fillStyle = '#2f343d';
  ctx.fill();
  drawLabel(ctx, 'Top Members', 34, 402, 24, '#d9dde3', '700');
  drawTopChip(ctx, topUsersText?.[0]?.label || '-', `${compactNumber(topUsersText?.[0]?.value || 0)}`, 'messages', 34, 424, 572, 72);
  drawTopChip(ctx, topUsersVoice?.[0]?.label || '-', `${formatHours(topUsersVoice?.[0]?.value || 0)}`, 'hours', 34, 506, 572, 72);

  roundRect(ctx, 640, 370, 620, 220, 18);
  ctx.fillStyle = '#2f343d';
  ctx.fill();
  drawLabel(ctx, 'Top Channels', 654, 402, 24, '#d9dde3', '700');
  drawTopChip(ctx, topChannelsText?.[0]?.label || '#-', `${compactNumber(topChannelsText?.[0]?.value || 0)}`, 'messages', 654, 424, 592, 72);
  drawTopChip(ctx, topChannelsVoice?.[0]?.label || '#-', `${formatHours(topChannelsVoice?.[0]?.value || 0)}`, 'hours', 654, 506, 592, 72);

  drawChart(ctx, chart, 20, 610, 1240, 240);
  drawLabel(ctx, `Server Lookback: Last ${lookbackDays} days`, 28, 878, 16, '#cdd2da', '700');

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderUserActivityCanvas,
  renderServerActivityCanvas
};
