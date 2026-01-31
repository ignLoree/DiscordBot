const { EmbedBuilder } = require("discord.js");
const { lastFmRequest, formatNumber, DEFAULT_EMBED_COLOR } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { resolveAlbumArtist } = require("../../Utils/Music/lastfmResolvers");
const { extractTargetUserWithLastfm, splitArtistTitle } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError, sendAlbumNotFound } = require("../../Utils/Music/lastfmError");

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getAlbumPlaysFromWeeklyChart(chart, artistName, albumName) {
  const albums = chart?.weeklyalbumchart?.album || [];
  const list = Array.isArray(albums) ? albums : [albums];
  const targetArtist = normalizeName(artistName);
  const targetAlbum = normalizeName(albumName);
  const match = list.find(album => {
    const artist = album?.artist?.name || album?.artist?.["#text"] || album?.artist || "";
    return normalizeName(album?.name) === targetAlbum
      && normalizeName(artist) === targetArtist;
  });
  return Number(match?.playcount || 0);
}

async function getAlbumPlaysInRange(lastFmUsername, artistName, albumName, from, to) {
  const chart = await lastFmRequest("user.getweeklyalbumchart", {
    user: lastFmUsername,
    from,
    to
  });
  return getAlbumPlaysFromWeeklyChart(chart, artistName, albumName);
}

module.exports = {
  skipPrefix: false,
  name: "albumplays",
  aliases: ["abp"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, args);
    let parsedArgs = filteredArgs;
    if (parsedArgs.length && parsedArgs[0].toLowerCase() === "album") {
      parsedArgs = parsedArgs.slice(1);
    }
    const query = parsedArgs.join(" ").trim();
    const parsed = splitArtistTitle(query);
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;
    const member = message.guild?.members.cache.get(target.id);
    const displayName = member?.displayName || target.username;
    try {
      const resolved = await resolveAlbumArtist(user.lastFmUsername, parsed.title, parsed.artist);
      if (!resolved) {
        return sendAlbumNotFound(message, query);
      }
      const data = await lastFmRequest("album.getinfo", {
        artist: resolved.artist,
        album: resolved.album,
        username: user.lastFmUsername
      });
      const album = data?.album;
      if (!album) throw new Error("Album not found");
      const trackListRaw = album?.tracks?.track || [];
      const trackList = Array.isArray(trackListRaw) ? trackListRaw : [trackListRaw];
      if (!trackList.length || !trackList[0]?.name) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(DEFAULT_EMBED_COLOR)
              .setDescription("Sorry, but neither Last.fm or Spotify know the tracks for " + album.name + " by " + resolved.artist + ".")
          ]
        });
      }
      const now = Math.floor(Date.now() / 1000);
      const lastWeekFrom = now - 7 * 24 * 60 * 60;
      const lastMonthFrom = now - 30 * 24 * 60 * 60;
      const lastWeekPlays = await getAlbumPlaysInRange(
        user.lastFmUsername,
        resolved.artist,
        album.name,
        lastWeekFrom,
        now
      );
      const lastMonthPlays = await getAlbumPlaysInRange(
        user.lastFmUsername,
        resolved.artist,
        album.name,
        lastMonthFrom,
        now
      );
      let totalPlaysRaw = Number(album.userplaycount || 0);
      if (lastMonthPlays > totalPlaysRaw) totalPlaysRaw = lastMonthPlays;
      const totalPlays = formatNumber(totalPlaysRaw, user.localization?.numberFormat);
      const displayLabel = displayName.startsWith("!") ? displayName : `! ${displayName}`;
      const lineOne = `**${displayLabel}** has **${totalPlays}** plays for **${album.name}** by **${resolved.artist}**`;
      const lineTwo = `-# *${formatNumber(lastWeekPlays, user.localization?.numberFormat)} plays last week — ${formatNumber(lastMonthPlays, user.localization?.numberFormat)} plays last month*`;
      return message.channel.send({ content: `${lineOne}\n${lineTwo}` });
    } catch (error) {
      if (String(error?.message || error).includes("Album not found")) {
        return sendAlbumNotFound(message, query);
      }
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        content: "<:vegax:1443934876440068179> Errore durante il recupero dei dati di Last.fm."
      });
    }
  }
};
