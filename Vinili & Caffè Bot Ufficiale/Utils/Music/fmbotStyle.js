const background = "#0E0E10";
const frame = "#1F1F23";
const primary = "#BA0000";
const text = "#EDEDED";
const muted = "#9CA3AF";
const crownBg = "#2A2200";
const colors = {
  background,
  frame,
  primary,
  text,
  muted,
  crownBg
};
const fonts = {
  title: "bold 32px Inter",
  subtitle: "16px Inter",
  row: "18px Inter",
  footer: "14px Inter"
};
const FMBOT_COLORS = {
  lastfmRed: "#BA0000",
  warningOrange: "#FFAE42",
  successGreen: "#32CD32",
  infoBlue: "#448AFF",
  spotifyGreen: "#1ED761",
  appleMusicRed: "#F9576B",
  gold: "#F1C40F"
};
const FMBOT_EMOJIS = {
  pagesFirst: "883825508633182208",
  pagesPrevious: "883825508507336704",
  pagesNext: "883825508087922739",
  pagesLast: "883825508482183258",
  pagesGoTo: "1138849626234036264",
  info: "1183840696457777153",
  lastfm: "882227627287515166",
  loading: "821676038102056991"
};

function drawGradientOverlay(ctx, x, y, w, h) {
  const gradient = ctx.createLinearGradient(x, y, x + w, y);
  gradient.addColorStop(0, "rgba(0,0,0,0.15)");
  gradient.addColorStop(0.7, "rgba(0,0,0,0.55)");
  gradient.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
}
function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function customEmoji(id, fallback = "") {
  return id ? `<:${fallback || "e"}:${id}>` : "";
}

module.exports = { colors, fonts, FMBOT_COLORS, FMBOT_EMOJIS, customEmoji, drawGradientOverlay, drawRoundedRect };