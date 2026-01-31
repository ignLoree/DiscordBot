const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, buildTrackUrl, formatNumber, lastFmRequest } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm, splitArtistTitle } = require("../../Utils/Music/lastfmPrefix");
const { resolveTrackArtist } = require("../../Utils/Music/lastfmResolvers");
const { handleLastfmError, sendTrackNotFound } = require("../../Utils/Music/lastfmError");
const { getSpotifyTrackDetails, getDeezerTrackMeta, getItunesTrackMeta } = require("../../Utils/Music/spotify");

function formatDurationMs(durationMs) {
  if (!durationMs || Number.isNaN(durationMs)) return null;
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatHoursMinutes(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return null;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} minutes`;
  return `${hours} hours, ${minutes} minutes`;
}

function formatInline(value) {
  return `\`${value}\``;
}

function sanitizeFilename(text) {
  return String(text || "preview")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

module.exports = {
  skipPrefix: false,
  name: "track",
  aliases: ["tr"],
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
    try {
      const resolved = await resolveTrackArtist(user.lastFmUsername, parsed.title, parsed.artist);
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
      const albumName = track?.album?.title || track?.album?.["#text"] || null;
      let albumPlays = null;
      let artistPlays = null;
      let artistTags = [];
      try {
        if (albumName) {
          const albumInfo = await lastFmRequest("album.getinfo", {
            artist: resolved.artist,
            album: albumName,
            username: user.lastFmUsername
          });
          albumPlays = Number(albumInfo?.album?.userplaycount || 0) || null;
        }
      } catch {
      }
      try {
        const artistInfo = await lastFmRequest("artist.getinfo", {
          artist: resolved.artist,
          username: user.lastFmUsername,
          autocorrect: 1
        });
        artistPlays = Number(artistInfo?.artist?.stats?.userplaycount || 0) || null;
        artistTags = (artistInfo?.artist?.tags?.tag || [])
          .map(tag => tag?.name)
          .filter(Boolean);
      } catch {
      }
      const isrc = track?.isrc
        || track?.isrcs?.isrc?.[0]
        || (Array.isArray(track?.isrcs) ? track.isrcs[0] : null);
      const spotifyData = await getSpotifyTrackDetails(resolved.artist, track.name, albumName, isrc);
      const spotifyTrack = spotifyData?.track || null;
      let previewUrl = spotifyTrack?.preview_url || null;
      let durationMs = Number(spotifyTrack?.duration_ms || track?.duration || 0);
      let image = spotifyTrack?.album?.images?.[0]?.url
        || track?.album?.image?.find(img => img.size === "extralarge")?.["#text"]
        || track?.album?.image?.find(img => img.size === "large")?.["#text"]
        || null;
      let fallbackMeta = null;
      if (!previewUrl || !durationMs || !image) {
        fallbackMeta = await getDeezerTrackMeta(resolved.artist, track.name);
      }
      if (!previewUrl && fallbackMeta?.previewUrl) previewUrl = fallbackMeta.previewUrl;
      if (!durationMs && fallbackMeta?.durationMs) durationMs = Number(fallbackMeta.durationMs);
      if (!image && fallbackMeta?.image) image = fallbackMeta.image;
      if (!previewUrl || !durationMs || !image) {
        const itunesMeta = await getItunesTrackMeta(resolved.artist, track.name);
        if (!previewUrl && itunesMeta?.previewUrl) previewUrl = itunesMeta.previewUrl;
        if (!durationMs && itunesMeta?.durationMs) durationMs = Number(itunesMeta.durationMs);
        if (!image && itunesMeta?.image) image = itunesMeta.image;
      }
      const spotifyUrl = spotifyTrack?.external_urls?.spotify
        || `https://open.spotify.com/search/${encodeURIComponent(`${resolved.artist} ${track.name}`)}`;
      const durationText = formatDurationMs(durationMs);
      const playsByYou = Number(track.userplaycount || 0);
      const totalListeners = Number(track.listeners || 0);
      const totalPlays = Number(track.playcount || 0);
      const minutesSpent = durationMs && playsByYou
        ? Math.round((playsByYou * durationMs) / 60000)
        : 0;
      const statsLines = [
        `${formatInline(formatNumber(totalListeners))} listeners`,
        `${formatInline(formatNumber(totalPlays))} global plays`,
        `${formatInline(formatNumber(playsByYou))} plays by you`
      ];
      if (albumPlays !== null) {
        statsLines.push(`${formatInline(formatNumber(albumPlays))} album plays by you`);
      }
      if (artistPlays !== null) {
        statsLines.push(`${formatInline(formatNumber(artistPlays))} artist plays by you`);
      }
      const timeSpentText = formatHoursMinutes(minutesSpent);
      if (timeSpentText) statsLines.push(`${formatInline(timeSpentText)} spent listening`);

      const tagNames = (track?.toptags?.tag || [])
        .map(tag => tag?.name)
        .filter(Boolean);
      const mergedTags = tagNames.length ? tagNames : artistTags;
      const topTags = mergedTags.slice(0, 7);
      const featureLines = topTags.map(tag => formatInline(tag));

      const infoLines = [
        durationText ? `${formatInline(durationText)} duration` : null,
        albumName ? `${formatInline(albumName)} album` : null
      ].filter(Boolean);

      let playPercentLine = null;
      try {
        const userInfo = await lastFmRequest("user.getinfo", {
          user: user.lastFmUsername
        });
        const userTotal = Number(userInfo?.user?.playcount || 0);
        if (userTotal > 0 && playsByYou > 0) {
          const percent = (playsByYou / userTotal) * 100;
          playPercentLine = `${percent.toFixed(2)}% of all your plays are on this track`;
        }
      } catch {
      }

      const displayName = message.guild?.members.cache.get(target.id)?.displayName
        || target.username
        || user.lastFmUsername;
      const title = `Track: ${resolved.artist} - ${track.name} for ${displayName}`;
      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(title)
        .setURL(buildTrackUrl(resolved.artist, track.name))
        .addFields(
          { name: "Top tags", value: featureLines.join("\n") || "No data", inline: true },
          { name: "Stats", value: statsLines.join("\n"), inline: true },
          { name: "Info", value: infoLines.join("\n") || "No data", inline: true }
        );
      if (image) embed.setThumbnail(image);
      if (playPercentLine) embed.setFooter({ text: playPercentLine });
      const sent = await message.channel.send({ embeds: [embed] });
      const rows = [];
      if (previewUrl) {
        const previewButton = new ButtonBuilder()
          .setCustomId(`lfm_track_preview:${sent.id}`)
          .setLabel("Preview")
          .setEmoji({ id: "1462941162393309431" })
          .setStyle(ButtonStyle.Secondary);
        rows.push(new ActionRowBuilder().addComponents(previewButton));
      }
      if (rows.length) {
        await sent.edit({ components: rows });
      }

      if (!message.client.trackPreviewStates) {
        message.client.trackPreviewStates = new Map();
      }
      message.client.trackPreviewStates.set(sent.id, {
        userId: message.author.id,
        previewUrl,
        spotifyUrl,
        trackName: sanitizeFilename(track.name),
        artistName: sanitizeFilename(resolved.artist),
        expiresAt: Date.now() + 10 * 60 * 1000
      });
      return;
    } catch (error) {
      if (String(error?.message || error).includes("Track not found")) {
        return sendTrackNotFound(message, query);
      }
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante il recupero della traccia.")
        ]
      });
    }
  }
};










