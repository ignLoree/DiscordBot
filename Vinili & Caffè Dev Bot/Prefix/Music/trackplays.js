const { lastFmRequest, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { resolveTrackArtist } = require("../../Utils/Music/lastfmResolvers");
const { extractTargetUserWithLastfm, splitArtistTitle } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError, sendTrackNotFound } = require("../../Utils/Music/lastfmError");

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getTrackPlaysFromWeeklyChart(chart, artistName, trackName) {
  const tracks = chart?.weeklytrackchart?.track || [];
  const list = Array.isArray(tracks) ? tracks : [tracks];
  const targetArtist = normalizeName(artistName);
  const targetTrack = normalizeName(trackName);
  const match = list.find(track => {
    const artist = track?.artist?.name || track?.artist?.["#text"] || track?.artist || "";
    return normalizeName(track?.name) === targetTrack
      && normalizeName(artist) === targetArtist;
  });
  return Number(match?.playcount || 0);
}

async function getTrackPlaysInRange(lastFmUsername, artistName, trackName, from, to) {
  const chart = await lastFmRequest("user.getweeklytrackchart", {
    user: lastFmUsername,
    from,
    to
  });
  return getTrackPlaysFromWeeklyChart(chart, artistName, trackName);
}

async function findRecentTrackByArtist(lastFmUsername, artistName) {
  if (!artistName) return null;
  const data = await lastFmRequest("user.getrecenttracks", {
    user: lastFmUsername,
    limit: 200
  });
  const tracks = data?.recenttracks?.track || [];
  const list = Array.isArray(tracks) ? tracks : [tracks];
  const target = normalizeName(artistName);
  const match = list.find(track => {
    const artist = track?.artist?.["#text"] || track?.artist?.name || "";
    return normalizeName(artist) === target;
  });
  if (!match?.name) return null;
  return {
    track: match.name,
    artist: match.artist?.["#text"] || match.artist?.name || artistName
  };
}

module.exports = {
  skipPrefix: false,
  name: "trackplays",
  aliases: ["tp"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, args);
    let parsedArgs = filteredArgs;
    if (parsedArgs.length && parsedArgs[0].toLowerCase() === "track") {
      parsedArgs = parsedArgs.slice(1);
    }
    const query = parsedArgs.join(" ").trim();
    const parsed = splitArtistTitle(query);
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;
    const member = message.guild?.members.cache.get(target.id);
    const displayName = member?.displayName || target.username;
    try {
      let resolved = null;
      const isArtistOnly = query && !parsed.artist && parsed.title
        && !query.includes(" - ")
        && !query.includes("|");
      if (isArtistOnly) {
        resolved = await findRecentTrackByArtist(user.lastFmUsername, parsed.title);
      }
      if (!resolved) {
        resolved = await resolveTrackArtist(user.lastFmUsername, parsed.title, parsed.artist);
      }
      if (!resolved) {
        return sendTrackNotFound(message, query);
      }
      const data = await lastFmRequest("track.getinfo", {
        artist: resolved.artist,
        track: resolved.track,
        username: user.lastFmUsername
      });
      const track = data?.track;
      if (!track) throw new Error("Track not found");
      const now = Math.floor(Date.now() / 1000);
      const lastWeekFrom = now - 7 * 24 * 60 * 60;
      const lastMonthFrom = now - 30 * 24 * 60 * 60;
      const lastWeekPlays = await getTrackPlaysInRange(
        user.lastFmUsername,
        resolved.artist,
        track.name,
        lastWeekFrom,
        now
      );
      const lastMonthPlays = await getTrackPlaysInRange(
        user.lastFmUsername,
        resolved.artist,
        track.name,
        lastMonthFrom,
        now
      );
      const totalPlays = formatNumber(track.userplaycount || 0, user.localization?.numberFormat);
      const displayLabel = displayName.startsWith("!") ? displayName : `! ${displayName}`;
      const lineOne = `**${displayLabel}** has **${totalPlays}** plays for **${track.name}** by **${resolved.artist}**`;
      const lineTwo = `-# *${formatNumber(lastWeekPlays, user.localization?.numberFormat)} plays last week \u2014 ${formatNumber(lastMonthPlays, user.localization?.numberFormat)} plays last month*`;
      return message.channel.send({
        content: `${lineOne}
        ${lineTwo}`
      });
    } catch (error) {
      if (String(error?.message || error).includes("Track not found")) {
        return sendTrackNotFound(message, query);
      }
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        content: "<:vegax:1443934876440068179> Errore durante il recupero dei dati di Last.fm."
      });
    }
  }
};
