const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { lastFmRequest } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { resolveRecentTrack, resolveTrackArtist } = require("../../Utils/Music/lastfmResolvers");
const { extractTargetUserWithLastfm, splitArtistTitle } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { getSpotifyTrackDetails, getDeezerTrackMeta, getItunesTrackMeta } = require("../../Utils/Music/spotify");

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function formatDurationMs(durationMs) {
  if (!durationMs || Number.isNaN(durationMs)) return null;
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatInline(value) {
  return `\`${value}\``;
}

function resolveKeyName(key, mode) {
  if (!Number.isFinite(key) || key < 0) return null;
  const name = KEY_NAMES[key % KEY_NAMES.length] || null;
  if (!name) return null;
  if (mode === 0) return `${name}m`;
  return name;
}

function sanitizeFilename(text) {
  return String(text || "preview")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function joinDetails(parts) {
  const filtered = parts.filter(Boolean);
  if (!filtered.length) return "";
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(", ")} and ${filtered[filtered.length - 1]}`;
}

module.exports = {
  skipPrefix: false,
  name: "trackdetails",
  aliases: ["td"],
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
      let resolved = null;
      if (!query) {
        const recent = await resolveRecentTrack(user.lastFmUsername, { nowPlayingOnly: true });
        if (!recent?.name) {
          return message.channel.send({
            content: "<:vegax:1443934876440068179> Nessuna traccia in ascolto in questo momento."
          });
        }
        resolved = {
          track: recent.name,
          artist: recent.artist?.["#text"] || recent.artist?.name || null
        };
      } else {
        resolved = await resolveTrackArtist(user.lastFmUsername, parsed.title, parsed.artist);
      }
      if (!resolved?.track || !resolved?.artist) {
        return message.channel.send({
          content: "<:vegax:1443934876440068179> Non riesco a trovare una traccia valida."
        });
      }
      const data = await lastFmRequest("track.getinfo", {
        artist: resolved.artist,
        track: resolved.track,
        username: user.lastFmUsername
      });
      const track = data?.track;
      if (!track) throw new Error("Track not found");
      const albumName = track?.album?.title || track?.album?.["#text"] || null;
      const isrc = track?.isrc
        || track?.isrcs?.isrc?.[0]
        || (Array.isArray(track?.isrcs) ? track.isrcs[0] : null);
      const spotifyData = await getSpotifyTrackDetails(resolved.artist, track.name, albumName, isrc);
      const spotifyTrack = spotifyData?.track || null;
      const audioFeatures = spotifyData?.audioFeatures || null;
      let previewUrl = spotifyTrack?.preview_url || null;
      let durationMs = Number(spotifyTrack?.duration_ms || track?.duration || 0);
      let fallbackMeta = null;
      if (!previewUrl || !durationMs) {
        fallbackMeta = await getDeezerTrackMeta(resolved.artist, track.name);
      }
      if (!previewUrl && fallbackMeta?.previewUrl) previewUrl = fallbackMeta.previewUrl;
      if (!durationMs && fallbackMeta?.durationMs) durationMs = Number(fallbackMeta.durationMs);
      if (!previewUrl || !durationMs) {
        const itunesMeta = await getItunesTrackMeta(resolved.artist, track.name);
        if (!previewUrl && itunesMeta?.previewUrl) previewUrl = itunesMeta.previewUrl;
        if (!durationMs && itunesMeta?.durationMs) durationMs = Number(itunesMeta.durationMs);
      }
      const spotifyUrl = spotifyTrack?.external_urls?.spotify
        || `https://open.spotify.com/search/${encodeURIComponent(`${resolved.artist} ${track.name}`)}`;

      const bpmValue = Number(audioFeatures?.tempo || 0);
      const bpmText = bpmValue ? formatInline(bpmValue.toFixed(1)) : null;
      const keyName = resolveKeyName(audioFeatures?.key, audioFeatures?.mode);
      const keyText = keyName ? formatInline(keyName) : null;
      const durationText = formatDurationMs(durationMs);

      const header = `**${track.name}** by **${resolved.artist}**`;
      const details = joinDetails([
        bpmText ? `has ${bpmText} bpm` : null,
        keyText ? `is in key ${keyText}` : null,
        durationText ? `lasts ${formatInline(durationText)}` : null
      ]);
      const content = details ? `${header} ${details}` : header;

      const sent = await message.channel.send({ content });

      if (previewUrl) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`lfm_track_preview:${sent.id}`)
            .setLabel("Preview")
            .setEmoji({ id: "1462941162393309431" })
            .setStyle(ButtonStyle.Secondary)
        );
        await sent.edit({ components: [row] });
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
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        content: "<:vegax:1443934876440068179> Errore durante il recupero dei dati di Last.fm."
      });
    }
  }
};