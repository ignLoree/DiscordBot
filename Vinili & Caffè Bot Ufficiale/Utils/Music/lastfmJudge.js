const { EmbedBuilder } = require("discord.js");
const { lastFmRequest, DEFAULT_EMBED_COLOR, formatNumber } = require("./lastfm");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeScore(artists, tracks) {
  const artistCount = artists.length || 1;
  const trackCount = tracks.length || 1;
  const artistPlays = artists.reduce((sum, a) => sum + Number(a.playcount || 0), 0);
  const trackPlays = tracks.reduce((sum, t) => sum + Number(t.playcount || 0), 0);
  const variety = clamp(Math.round((artistCount + trackCount) * 2.5), 10, 100);
  const intensity = clamp(Math.round(((artistPlays + trackPlays) / (artistCount + trackCount)) / 10), 10, 100);
  const balance = clamp(Math.round((variety * 0.6) + (intensity * 0.4)), 10, 100);
  return { variety, intensity, balance };
}

function buildVerdict({ mode, score, displayName, topArtist, topTrack }) {
  const intro = mode === "roast"
    ? `Ok ${displayName}, qui si fa sul serio…`
    : mode === "compliment"
      ? `Bella selezione, ${displayName}!`
      : `Ecco il verdetto per ${displayName}.`;
  const artistLine = topArtist ? `Artista #1: **${topArtist.name}**` : "Artista #1: n/d";
  const trackLine = topTrack ? `Traccia #1: **${topTrack.name}**` : "Traccia #1: n/d";
  let flavor;
  if (mode === "roast") {
    flavor = score.balance >= 70
      ? "Troppa coerenza: sembra una playlist in loop… ma funziona."
      : "Varietà curiosa: a volte spiazza, ma non annoia.";
  } else if (mode === "compliment") {
    flavor = score.balance >= 70
      ? "Gusto solido e coerente. Si sente che sai cosa ti piace."
      : "Mix interessante: scopri cose e non ti fossilizzi.";
  } else {
    flavor = score.balance >= 70
      ? "Profilo stabile e ben definito."
      : "Profilo dinamico, con tocchi di esplorazione.";
  }
  return [intro, "", artistLine, trackLine, "", flavor].join("\n");
}

async function buildJudgePayload({ lastFmUsername, displayName, period, mode, numberFormat }) {
  const [artistsData, tracksData] = await Promise.all([
    lastFmRequest("user.gettopartists", { user: lastFmUsername, period, limit: 10 }),
    lastFmRequest("user.gettoptracks", { user: lastFmUsername, period, limit: 10 })
  ]);
  const artists = artistsData?.topartists?.artist || [];
  const tracks = tracksData?.toptracks?.track || [];
  if (!artists.length && !tracks.length) {
    return { error: "<:vegax:1443934876440068179> Non ho trovato dati sufficienti per giudicare questo periodo." };
  }
  const score = computeScore(artists, tracks);
  const verdict = buildVerdict({
    mode,
    score,
    displayName,
    topArtist: artists[0],
    topTrack: tracks[0]
  });
  const topArtistsText = artists.slice(0, 5)
    .map((a, i) => `${i + 1}. ${a.name} (${formatNumber(a.playcount || 0, numberFormat)})`)
    .join("\n") || "<:vegax:1443934876440068179> Nessun dato";
  const topTracksText = tracks.slice(0, 5)
    .map((t, i) => `${i + 1}. ${t.name} (${formatNumber(t.playcount || 0, numberFormat)})`)
    .join("\n") || "<:vegax:1443934876440068179> Nessun dato";
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle("Judge")
    .setDescription(verdict)
    .addFields(
      { name: "Varietà", value: `${score.variety}/100`, inline: true },
      { name: "Intensità", value: `${score.intensity}/100`, inline: true },
      { name: "Bilanciamento", value: `${score.balance}/100`, inline: true },
      { name: "Top artisti", value: topArtistsText, inline: false },
      { name: "Top tracce", value: topTracksText, inline: false }
    )
    .setFooter({ text: `Periodo: ${period}` });
  return { embed };
}

module.exports = { buildJudgePayload };