const LastFmCrown = require("../../Schemas/LastFm/crownSchema");

function normalizeArtist(artist) {
  return String(artist || "").trim().toLowerCase();
}
function formatRelative(date) {
  if (!date) return "unknown";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (years > 0) return `${years} anno${years === 1 ? "" : "i"} fa`;
  if (months > 0) return `${months} mese${months === 1 ? "" : "i"} fa`;
  if (days > 0) return `${days} giorno${days === 1 ? "" : "i"} fa`;
  if (hours > 0) return `${hours} ora${hours === 1 ? "" : "e"} fa`;
  if (minutes > 0) return `${minutes} minuto${minutes === 1 ? "" : "i"} fa`;
  return "poco fa";
}
async function updateCrown({ guildId, artistName, holderId, playcount }) {
  if (!guildId || !artistName || !holderId) return null;
  if (playcount < 30) return null;
  const artistKey = normalizeArtist(artistName);
  let crown = await LastFmCrown.findOne({ guildId, artistKey });
  if (!crown) {
    crown = await LastFmCrown.create({
      guildId,
      artistKey,
      artistName,
      holderId,
      playcount,
      claimedAt: new Date(),
      history: [{ discordId: holderId, playcount, claimedAt: new Date() }]
    });
    return crown;
  }
  if (crown.holderId !== holderId) {
    crown.holderId = holderId;
    crown.playcount = playcount;
    crown.claimedAt = new Date();
    crown.history.push({ discordId: holderId, playcount, claimedAt: new Date() });
    crown.artistName = artistName;
    await crown.save();
    return crown;
  }
  if (playcount > crown.playcount) {
    crown.playcount = playcount;
    crown.artistName = artistName;
    await crown.save();
  }
  return crown;
}
async function getCrownByArtist(guildId, artistName) {
  if (!guildId || !artistName) return null;
  const artistKey = normalizeArtist(artistName);
  return LastFmCrown.findOne({ guildId, artistKey });
}
async function getCrownsForUser(guildId, userId) {
  return LastFmCrown.find({ guildId, holderId: userId }).sort({ playcount: -1 });
}

module.exports = { updateCrown, getCrownByArtist, getCrownsForUser, formatRelative };