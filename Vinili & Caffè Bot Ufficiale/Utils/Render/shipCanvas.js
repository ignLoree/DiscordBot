const canvasModule = require("canvas");
const { createCanvas, loadImage } = canvasModule; const { registerCanvasFonts, drawTextWithSpecialFallback, } = require("./canvasFonts");

function hashSeed(source) {
  let h = 2166136261;
  const text = String(source || "");
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function pickMessage(percent) {
  if (percent >= 90) return "sono perfetti insieme!";
  if (percent >= 70)
    return "sono sulla strada giusta per qualcosa di speciale!";
  if (percent >= 50) return "hanno una buona connessione!";
  if (percent >= 30) return "potrebbero sorprendere!";
  return "forse meglio come amici... per ora!";
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawStars(ctx, width, height, seed) {
  let state = seed || 12345;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const count = 70;
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(next() * width);
    const y = Math.floor(next() * height);
    const r = next() > 0.9 ? 2 : 1;
    const alpha = 0.35 + next() * 0.5;
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFramedImage(ctx, image, x, y, size, rotationDeg) {
  const rot = (rotationDeg * Math.PI) / 180;
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(rot);

  const framePad = 8;
  const frameSize = size + framePad * 2;
  drawRoundedRect(ctx, -frameSize / 2, -frameSize / 2, frameSize, frameSize, 6);
  ctx.fillStyle = "#ff6ecf";
  ctx.shadowColor = "rgba(255, 110, 207, 0.65)";
  ctx.shadowBlur = 14;
  ctx.fill();

  ctx.shadowBlur = 0;
  drawRoundedRect(ctx, -size / 2, -size / 2, size, size, 4);
  ctx.save();
  ctx.clip();
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  ctx.restore();
  ctx.restore();
}

function drawHeartShape(ctx, cx, cy, size) {
  const topCurveHeight = size * 0.32;
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.28);
  ctx.bezierCurveTo(
    cx - size * 0.52,
    cy - topCurveHeight,
    cx - size,
    cy + size * 0.38,
    cx,
    cy + size,
  );
  ctx.bezierCurveTo(
    cx + size,
    cy + size * 0.38,
    cx + size * 0.52,
    cy - topCurveHeight,
    cx,
    cy + size * 0.28,
  );
  ctx.closePath();
}

function drawHeart(ctx, cx, cy, size) {
  ctx.save();

  const glow = ctx.createRadialGradient(
    cx,
    cy + size * 0.35,
    size * 0.2,
    cx,
    cy + size * 0.35,
    size * 1.25,
  );
  glow.addColorStop(0, "rgba(255,120,190,0.55)");
  glow.addColorStop(1, "rgba(255,120,190,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.35, size * 1.25, 0, Math.PI * 2);
  ctx.fill();

  drawHeartShape(ctx, cx, cy, size);
  const fill = ctx.createLinearGradient(
    cx - size,
    cy - size * 0.3,
    cx + size,
    cy + size,
  );
  fill.addColorStop(0, "#ff93d1");
  fill.addColorStop(0.5, "#ff4fa7");
  fill.addColorStop(1, "#db2a85");
  ctx.fillStyle = fill;
  ctx.fill();

  drawHeartShape(ctx, cx, cy, size);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.stroke();

  ctx.restore();
}

function getFittedTitleSize(ctx, text, maxWidth, startSize = 42, minSize = 24) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `700 ${size}px "Noto Sans", Arial, sans-serif`;
    if (ctx.measureText(String(text || "")).width <= maxWidth) break;
    size -= 2;
  }
  return Math.max(minSize, size);
}

module.exports = async function renderShipCanvas({
  leftAvatarUrl,
  rightAvatarUrl,
  leftName,
  rightName,
  leftId,
  rightId,
  percent,
}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  registerCanvasFonts(canvasModule);

  const width = 1000;
  const height = 540;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const finalPercent = Math.max(1, Math.min(100, Number(percent || 1)));
  const topText = pickMessage(finalPercent);

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#5d008f");
  bg.addColorStop(0.52, "#9f0077");
  bg.addColorStop(1, "#1f2c8f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  drawStars(
    ctx,
    width,
    height,
    hashSeed(`${leftId}:${rightId}:${finalPercent}:${Date.now()}`),
  );

  const leftAvatar = await loadImage(leftAvatarUrl);
  const rightAvatar = await loadImage(rightAvatarUrl);

  drawFramedImage(ctx, leftAvatar, 110, 145, 220, -2.8);
  drawFramedImage(ctx, rightAvatar, 670, 145, 220, 3.2);

  const topTitleSize = getFittedTitleSize(ctx, topText, width - 64, 42, 24);
  drawTextWithSpecialFallback(ctx, topText, width / 2, 66, {
    size: topTitleSize,
    weight: "700",
    color: "#ffffff",
    align: "center",
    baseline: "middle",
  });

  drawTextWithSpecialFallback(ctx, leftName, 220, 450, {
    size: 42,
    weight: "700",
    color: "#ffffff",
    align: "center",
    baseline: "middle",
  });

  drawTextWithSpecialFallback(ctx, rightName, 780, 450, {
    size: 42,
    weight: "700",
    color: "#ffffff",
    align: "center",
    baseline: "middle",
  });

  drawHeart(ctx, width / 2, 228, 54);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 44px "Noto Sans", Arial, sans-serif';
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.strokeText(`${finalPercent}%`, width / 2, 300);
  ctx.restore();

  drawTextWithSpecialFallback(ctx, `${finalPercent}%`, width / 2, 300, {
    size: 44,
    weight: "700",
    color: "#5b0d3f",
    align: "center",
    baseline: "middle",
  });

  return canvas.toBuffer("image/png");
};
