const { EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { lastFmRequest, DEFAULT_EMBED_COLOR, buildAlbumUrl, buildArtistUrl, formatNumber } = require("./lastfm");

function pickRandom(items) {
  if (!items || !items.length) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}
function getLargestImage(images) {
  if (!Array.isArray(images)) return null;
  const sorted = [...images].reverse();
  const found = sorted.find(img => img?.["#text"]);
  return found?.["#text"] || null;
}
async function fetchCandidates({ scope, guild }) {
  if (scope === "server" && guild) {
    const ids = guild.members.cache.map(member => member.id);
    return LastFmUser.find({ discordId: { $in: ids }, privacyGlobal: true });
  }
  return LastFmUser.find({ privacyGlobal: true });
}
async function buildFeaturedPayload({ scope, period, guild }) {
  const candidates = await fetchCandidates({ scope, guild });
  if (!candidates.length) {
    return { error: "<:vegax:1443934876440068179> Nessun utente disponibile per il featured." };
  }
  let picked = null;
  let topAlbums = null;
  for (let i = 0; i < Math.min(8, candidates.length); i += 1) {
    picked = pickRandom(candidates);
    const data = await lastFmRequest("user.gettopalbums", {
      user: picked.lastFmUsername,
      period,
      limit: 5
    });
    topAlbums = data?.topalbums?.album || [];
    if (topAlbums.length) break;
  }
  if (!picked || !topAlbums || !topAlbums.length) {
    return { error: "<:vegax:1443934876440068179> Non sono riuscito a trovare un album featured." };
  }
  const album = pickRandom(topAlbums);
  const albumName = album.name || "Sconosciuto";
  const artistName = album.artist?.name || "Sconosciuto";
  const albumUrl = buildAlbumUrl(artistName, albumName);
  const artistUrl = buildArtistUrl(artistName);
  const cover = getLargestImage(album.image);
  const displayName = guild?.members?.cache?.get(picked.discordId)?.displayName || picked.lastFmUsername;
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle("Featured album")
    .setURL(albumUrl)
    .setDescription(`**${albumName}**\nby **${artistName}**`)
    .addFields(
      { name: "Artista", value: `[${artistName}](${artistUrl})`, inline: true },
      { name: "Ascolti", value: formatNumber(album.playcount || 0), inline: true },
      { name: "Utente", value: displayName, inline: true }
    )
    .setFooter({ text: `Periodo: ${period} • Scope: ${scope}` });
  if (cover) embed.setThumbnail(cover);
  return { embed };
}

module.exports = { buildFeaturedPayload };