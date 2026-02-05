const { safeChannelSend } = require('../../Utils/Moderation/message');
const { lastFmRequest, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm } = require("../../Utils/Music/lastfmPrefix");
const { resolveArtistName } = require("../../Utils/Music/lastfmResolvers");
const { handleLastfmError, sendArtistNotFound } = require("../../Utils/Music/lastfmError");

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getArtistPlaysFromWeeklyChart(chart, artistName) {
  const artists = chart?.weeklyartistchart?.artist || [];
  const list = Array.isArray(artists) ? artists : [artists];
  const target = normalizeName(artistName);
  const match = list.find(item => normalizeName(item?.name || item?.["#text"] || item?.artist || "") === target);
  return Number(match?.playcount || 0);
}

async function getArtistPlaysInRange(lastFmUsername, artistName, from, to) {
  const chart = await lastFmRequest("user.getweeklyartistchart", {
    user: lastFmUsername,
    from,
    to
  });
  return getArtistPlaysFromWeeklyChart(chart, artistName);
}

module.exports = {
  skipPrefix: false,
  name: "artistplays",
  aliases: ["arp"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, args);
    const artistQuery = filteredArgs.join(" ").trim();
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;
    const member = message.guild?.members.cache.get(target.id);
    const displayName = member?.displayName || member?.user?.username || target.username;
    try {
      const artistName = await resolveArtistName(user.lastFmUsername, artistQuery || null);
      if (!artistName) {
        return sendArtistNotFound(message, artistQuery);
      }
      const data = await lastFmRequest("artist.getinfo", {
        artist: artistName,
        username: user.lastFmUsername,
        autocorrect: 1
      });
      const artist = data?.artist;
      if (!artist) throw new Error("Artist not found");
      const now = Math.floor(Date.now() / 1000);
      const lastWeekFrom = now - 7 * 24 * 60 * 60;
      const lastMonthFrom = now - 30 * 24 * 60 * 60;
      const lastWeekPlays = await getArtistPlaysInRange(
        user.lastFmUsername,
        artist.name || artistName,
        lastWeekFrom,
        now
      );
      const lastMonthPlays = await getArtistPlaysInRange(
        user.lastFmUsername,
        artist.name || artistName,
        lastMonthFrom,
        now
      );
      const totalPlays = formatNumber(artist.stats?.userplaycount || 0, user.localization?.numberFormat);
      const displayLabel = displayName.startsWith("!") ? displayName : `! ${displayName}`;
      const lineOne = `**${displayLabel}** has **${totalPlays}** plays for **${artist.name || artistName}**`;
      const lineTwo = `-# ${formatNumber(lastWeekPlays, user.localization?.numberFormat)} plays last week \u2014 ${formatNumber(lastMonthPlays, user.localization?.numberFormat)} plays last month`;
      return safeChannelSend(message.channel, { content: `${lineOne}\n${lineTwo}` });
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        content: "<:vegax:1443934876440068179> Errore durante il recupero dei dati di Last.fm."
      });
    }
  }
};


