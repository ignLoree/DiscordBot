const canvasModule = require('canvas');
const { createCanvas, loadImage } = canvasModule;
const { registerCanvasFonts, drawTextWithSpecialFallback } = require('./canvasFonts');

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

module.exports = async function renderRankCanvas({
  username,
  avatarUrl,
  level,
  totalExp,
  currentLevelExp,
  nextLevelExp,
  progressPercent,
  weeklyRank,
  allTimeRank
}) {
  registerCanvasFonts(canvasModule);
  const width = 1100;
  const height = 360;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#2f2118');
  bg.addColorStop(1, '#6f4e37');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  roundedRect(ctx, 18, 18, width - 36, height - 36, 26);
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fill();

  const avatar = await loadImage(avatarUrl);
  const avatarSize = 180;
  const avatarX = 52;
  const avatarY = 90;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + (avatarSize / 2), avatarY + (avatarSize / 2), avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(avatarX + (avatarSize / 2), avatarY + (avatarSize / 2), avatarSize / 2, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#e7d6c8';
  ctx.stroke();

  drawTextWithSpecialFallback(ctx, `Rank di ${username}`, 280, 76, {
    size: 44,
    weight: '700',
    color: '#ffffff',
    align: 'left',
    baseline: 'middle'
  });

  drawTextWithSpecialFallback(ctx, `Livello ${level}  •  EXP Totale ${totalExp}`, 280, 126, {
    size: 30,
    weight: '600',
    color: '#f7ede5',
    align: 'left',
    baseline: 'middle'
  });

  const barX = 280;
  const barY = 180;
  const barW = 760;
  const barH = 44;
  roundedRect(ctx, barX, barY, barW, barH, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.fill();

  const pct = Math.max(0, Math.min(100, Number(progressPercent || 0)));
  const fillW = Math.max(10, Math.round((barW * pct) / 100));
  const fill = ctx.createLinearGradient(barX, barY, barX + barW, barY);
  fill.addColorStop(0, '#f1c27d');
  fill.addColorStop(1, '#ff9f43');
  roundedRect(ctx, barX, barY, fillW, barH, 18);
  ctx.fillStyle = fill;
  ctx.fill();

  drawTextWithSpecialFallback(ctx, `${pct}%`, barX + (barW / 2), barY + 22, {
    size: 26,
    weight: '700',
    color: '#2f2118',
    align: 'center',
    baseline: 'middle'
  });

  drawTextWithSpecialFallback(ctx, `${currentLevelExp} EXP`, barX, barY + 72, {
    size: 22,
    weight: '600',
    color: '#f7ede5',
    align: 'left',
    baseline: 'middle'
  });
  drawTextWithSpecialFallback(ctx, `${nextLevelExp} EXP`, barX + barW, barY + 72, {
    size: 22,
    weight: '600',
    color: '#f7ede5',
    align: 'right',
    baseline: 'middle'
  });

  const wr = weeklyRank ? `#${weeklyRank}` : '-';
  const ar = allTimeRank ? `#${allTimeRank}` : '-';
  drawTextWithSpecialFallback(ctx, `Weekly: ${wr}`, 280, 290, {
    size: 28,
    weight: '700',
    color: '#ffffff',
    align: 'left',
    baseline: 'middle'
  });
  drawTextWithSpecialFallback(ctx, `All Time: ${ar}`, 520, 290, {
    size: 28,
    weight: '700',
    color: '#ffffff',
    align: 'left',
    baseline: 'middle'
  });

  return canvas.toBuffer('image/png');
};
