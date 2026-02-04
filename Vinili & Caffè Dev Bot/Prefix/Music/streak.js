const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, buildArtistUrl, buildAlbumUrl, buildTrackUrl } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm } = require("../../Utils/Music/lastfmPrefix");
const { getRecentTracks, getTrackDate } = require("../../Utils/Music/lastfmStats");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const LastFmStreak = require("../../Schemas/LastFm/streakSchema");

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function getTrackIdentity(track) {
  const artist = track.artist?.["#text"] || track.artist?.name || "";
  const title = track.name || "";
  const album = track.album?.["#text"] || track.album?.name || track.album || "Senza album";
  return { artist, title, album };
}

function buildStreaks(tracks) {
  if (!tracks.length) return null;
  const first = getTrackIdentity(tracks[0]);
  const artistKey = normalize(first.artist);
  const albumKey = normalize(`${first.artist}||${first.album}`);
  const trackKey = normalize(`${first.artist}||${first.title}`);

  let artistCount = 0;
  let albumCount = 0;
  let trackCount = 0;
  let artistDone = false;
  let albumDone = false;
  let trackDone = false;
  let trackStartDate = null;
  let trackLastDate = null;

  for (const track of tracks) {
    const current = getTrackIdentity(track);
    if (!artistDone && normalize(current.artist) === artistKey) {
      artistCount += 1;
    } else {
      artistDone = true;
    }
    if (!albumDone && normalize(`${current.artist}||${current.album}`) === albumKey) {
      albumCount += 1;
    } else {
      albumDone = true;
    }
    if (!trackDone && normalize(`${current.artist}||${current.title}`) === trackKey) {
      trackCount += 1;
      const date = getTrackDate(track);
      if (date) {
        trackStartDate = date;
        if (!trackLastDate) trackLastDate = date;
      }
    } else {
      trackDone = true;
    }
    if (artistDone && albumDone && trackDone) break;
  }

  return {
    artist: { name: first.artist, plays: artistCount, url: buildArtistUrl(first.artist) },
    album: { name: first.album, artist: first.artist, plays: albumCount, url: buildAlbumUrl(first.artist, first.album) },
    track: { name: first.title, artist: first.artist, plays: trackCount, url: buildTrackUrl(first.artist, first.title) },
    startedAt: trackStartDate,
    lastPlayedAt: trackLastDate
  };
}

function hasActiveStreak(streaks) {
  if (!streaks) return false;
  return Math.max(streaks.artist.plays, streaks.album.plays, streaks.track.plays) >= 2;
}

function hasSavedStreak(streaks) {
  if (!streaks) return false;
  return streaks.track.plays >= 25;
}

function buildStreakEmbed({ displayName, avatarUrl, streaks }) {
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setAuthor({ name: `${displayName}'s streak overview`, iconURL: avatarUrl });

  if (!streaks || !hasActiveStreak(streaks)) {
    embed.setDescription(
      "No active streak found.\nTry scrobbling multiple of the same artist, album or track in a row to get started."
    );
    return embed;
  }

  const playsLabel = (count) => (count === 1 ? "play" : "plays");
  const lines = [
    `\`Artist:\` **[${streaks.artist.name}](${streaks.artist.url})** - ${streaks.artist.plays} ${playsLabel(streaks.artist.plays)}`,
    `\`Album:\` **[${streaks.album.name}](${streaks.album.url})** - ${streaks.album.plays} ${playsLabel(streaks.album.plays)}`,
    `\`Track:\` **[${streaks.track.name}](${streaks.track.url})** - ${streaks.track.plays} ${playsLabel(streaks.track.plays)}`
  ];
  const started = streaks.startedAt ? `<t:${Math.floor(new Date(streaks.startedAt).getTime() / 1000)}:R>` : "poco fa";
  lines.push("", `Streak started ${started}.`);
  embed.setDescription(lines.join("\n"));
  embed.setFooter({
    text: hasSavedStreak(streaks)
      ? "Streak has been saved!"
      : "Only streaks with 25 plays or higher are saved."
  });
  return embed;
}

module.exports = {
  skipPrefix: false,
  name: "streak",
  aliases: ["str"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, lastfm } = extractTargetUserWithLastfm(message, args);
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;
    const member = message.guild?.members.cache.get(target.id);
    const displayName = member?.displayName || target.username;
    try {
      const tracks = await getRecentTracks(user.lastFmUsername, 200);
      const streaks = buildStreaks(tracks);
      const embed = buildStreakEmbed({
        displayName,
        avatarUrl: target.displayAvatarURL(),
        streaks
      });
      if (streaks && hasSavedStreak(streaks) && streaks.startedAt && streaks.lastPlayedAt) {
        const trackKey = normalize(`${streaks.track.artist}||${streaks.track.name}`);
        await LastFmStreak.updateOne(
          { userId: target.id, trackKey, startedAt: streaks.startedAt },
          {
            $setOnInsert: {
              userId: target.id,
              lastFmUsername: user.lastFmUsername,
              trackKey,
              startedAt: streaks.startedAt,
              lastPlayedAt: streaks.lastPlayedAt,
              artistName: streaks.artist.name,
              albumName: streaks.album.name,
              trackName: streaks.track.name,
              artistPlays: streaks.artist.plays,
              albumPlays: streaks.album.plays,
              trackPlays: streaks.track.plays
            }
          },
          { upsert: true }
        );
      }
      return safeChannelSend(message.channel, { embeds: [embed] });
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante il calcolo della streak.")
        ]
      });
    }
  }
};




