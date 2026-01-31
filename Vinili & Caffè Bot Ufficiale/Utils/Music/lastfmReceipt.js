const { EmbedBuilder } = require("discord.js");
const { lastFmRequest, DEFAULT_EMBED_COLOR, formatNumber } = require("./lastfm");

function truncateText(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}
function padRight(text, length) {
  const safe = text || "";
  if (safe.length >= length) return safe;
  return `${safe}${" ".repeat(length - safe.length)}`;
}
function buildReceiptText({ displayName, period, tracks, numberFormat }) {
  const header = [
    "Vinili & Caffè",
    `Cliente: ${displayName}`,
    `Periodo: ${period}`,
    "" 
  ];
  const maxName = 26;
  const lines = tracks.map((track, index) => {
    const artist = track.artist?.name || track.artist || "Sconosciuto";
    const name = track.name || "Senza titolo";
    const plays = formatNumber(track.playcount || 0, numberFormat);
    const label = truncateText(`${artist} - ${name}`, maxName);
    return `${padRight(`${index + 1}. ${label}`, 32)} ${plays}`;
  });
  const totalPlays = tracks.reduce((sum, track) => sum + Number(track.playcount || 0), 0);
  const footer = [
    "",
    "-------------------------------",
    `Totale plays: ${formatNumber(totalPlays, numberFormat)}`,
    "Grazie e buon ascolto!"
  ];
  return [...header, ...lines, ...footer].join("\n");
}
async function buildReceiptPayload({ lastFmUsername, displayName, period, numberFormat }) {
  const data = await lastFmRequest("user.gettoptracks", {
    user: lastFmUsername,
    period,
    limit: 10
  });
  const tracks = data?.toptracks?.track || [];
  if (!tracks.length) {
    return { error: "<:vegax:1443934876440068179> Nessuna traccia trovata per questo periodo." };
  }
  const receipt = buildReceiptText({ displayName, period, tracks, numberFormat });
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle("Receipt")
    .setDescription(`\
\`\`\`\n${receipt}\n\`\`\``);
  return { embed };
}

module.exports = { buildReceiptPayload };