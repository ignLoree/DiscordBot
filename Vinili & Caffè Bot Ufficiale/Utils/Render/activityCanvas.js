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
  return (Number(seconds || 0) / 3600).toFixed(1);
}

function drawCard(ctx, x, y, w, h, title, value, subtitle) {
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();

  drawTextWithSpecialFallback(ctx, title, x + 18, y + 24, {
    size: 20,
    weight: '700',
    color: '#f8f5f0',
    align: 'left',
    baseline: 'middle'
  });
  drawTextWithSpecialFallback(ctx, value, x + 18, y + 62, {
    size: 30,
    weight: '700',
    color: '#ffd6a0',
    align: 'left',
    baseline: 'middle'
  });
  if (subtitle) {
    drawTextWithSpecialFallback(ctx, subtitle, x + 18, y + 92, {
      size: 16,
      weight: '600',
      color: 'rgba(248,245,240,0.8)',
      align: 'left',
      baseline: 'middle'
    });
  }
}

function drawTitle(ctx, text, x, y, size = 38) {
  drawTextWithSpecialFallback(ctx, text, x, y, {
    size,
    weight: '700',
    color: '#ffffff',
    align: 'left',
    baseline: 'middle'
  });
}

function drawSubtitle(ctx, text, x, y) {
  drawTextWithSpecialFallback(ctx, text, x, y, {
    size: 20,
    weight: '600',
    color: 'rgba(255,255,255,0.85)',
    align: 'left',
    baseline: 'middle'
  });
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
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.stroke();
}

function drawTopList(ctx, title, items, x, y, w, h, formatter) {
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  drawTextWithSpecialFallback(ctx, title, x + 16, y + 22, {
    size: 18,
    weight: '700',
    color: '#f8f5f0',
    align: 'left',
    baseline: 'middle'
  });

  if (!Array.isArray(items) || items.length === 0) {
    drawTextWithSpecialFallback(ctx, 'Nessun dato disponibile', x + 16, y + 54, {
      size: 15,
      weight: '600',
      color: 'rgba(248,245,240,0.75)',
      align: 'left',
      baseline: 'middle'
    });
    return;
  }

  let lineY = y + 54;
  items.slice(0, 3).forEach((item, idx) => {
    const text = formatter(item, idx);
    drawTextWithSpecialFallback(ctx, `${idx + 1}. ${text}`, x + 16, lineY, {
      size: 15,
      weight: '600',
      color: '#ffd6a0',
      align: 'left',
      baseline: 'middle'
    });
    lineY += 24;
  });
}

async function renderUserActivityCanvas({
  guildName,
  userTag,
  avatarUrl,
  messages,
  voice
}) {
  registerCanvasFonts(canvasModule);
  const width = 1200;
  const height = 520;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#2f2118');
  bg.addColorStop(1, '#6f4e37');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 18, 18, width - 36, height - 36, 24);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();

  await drawAvatarCircle(ctx, avatarUrl, 44, 42, 130);
  drawTitle(ctx, userTag, 196, 84, 42);
  drawSubtitle(ctx, `${guildName} • My Activity`, 196, 124);

  drawCard(ctx, 44, 206, 356, 120, 'Messaggi giornalieri', `${Number(messages?.daily || 0)}`, null);
  drawCard(ctx, 422, 206, 356, 120, 'Messaggi settimanali', `${Number(messages?.weekly || 0)}`, null);
  drawCard(ctx, 800, 206, 356, 120, 'Messaggi totali', `${Number(messages?.total || 0)}`, null);

  drawCard(ctx, 44, 346, 356, 120, 'Ore vocali giornaliere', `${formatHours(voice?.dailySeconds)}`, null);
  drawCard(ctx, 422, 346, 356, 120, 'Ore vocali settimanali', `${formatHours(voice?.weeklySeconds)}`, null);
  drawCard(ctx, 800, 346, 356, 120, 'Ore vocali totali', `${formatHours(voice?.totalSeconds)}`, null);

  return canvas.toBuffer('image/png');
}

async function renderServerActivityCanvas({
  guildName,
  guildIconUrl,
  days,
  totals,
  topChannelsText,
  topChannelsVoice,
  topUsersText,
  topUsersVoice,
  approximate
}) {
  registerCanvasFonts(canvasModule);
  const width = 1400;
  const height = 760;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#2f2118');
  bg.addColorStop(1, '#6f4e37');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 18, 18, width - 36, height - 36, 24);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();

  await drawAvatarCircle(ctx, guildIconUrl, 44, 40, 100);
  drawTitle(ctx, `${guildName} • Activity`, 168, 78, 44);
  drawSubtitle(ctx, `Finestra: ${days} giorni`, 168, 116);

  drawCard(ctx, 44, 166, 640, 110, 'Messaggi totali', `${Number(totals?.text || 0)}`, null);
  drawCard(ctx, 714, 166, 640, 110, 'Ore vocali totali', `${formatHours(totals?.voiceSeconds)}`, null);

  drawTopList(ctx, 'Top 3 canali text', topChannelsText, 44, 304, 640, 190, (item) => `#${item.id} • ${item.value} msg`);
  drawTopList(ctx, 'Top 3 canali voc', topChannelsVoice, 714, 304, 640, 190, (item) => `#${item.id} • ${formatHours(item.value)} h`);
  drawTopList(ctx, 'Top 3 utenti text', topUsersText, 44, 516, 640, 190, (item) => `@${item.id} • ${item.value} msg`);
  drawTopList(ctx, 'Top 3 utenti voc', topUsersVoice, 714, 516, 640, 190, (item) => `@${item.id} • ${formatHours(item.value)} h`);

  if (approximate) {
    drawTextWithSpecialFallback(ctx, 'Nota: dati retroattivi parziali, top canali disponibili dal nuovo tracking.', 52, 730, {
      size: 15,
      weight: '600',
      color: 'rgba(255,255,255,0.75)',
      align: 'left',
      baseline: 'middle'
    });
  }

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderUserActivityCanvas,
  renderServerActivityCanvas
};

