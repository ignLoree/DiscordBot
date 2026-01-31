const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { lastFmRequest, DEFAULT_EMBED_COLOR, buildAlbumUrl, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { resolveAlbumArtist } = require("../../Utils/Music/lastfmResolvers");
const { extractTargetUserWithLastfm, splitArtistTitle } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError, sendAlbumNotFound } = require("../../Utils/Music/lastfmError");

function formatInline(value) {
  return `\`${value}\``;
}

function formatReleaseDate(text) {
  if (!text) return null;
  const raw = String(text).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, " ").replace(/,?\s*\d{1,2}:\d{2}(:\d{2})?/, "");
  let date = new Date(cleaned);
  if (!Number.isFinite(date.getTime())) {
    const match = cleaned.match(/\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/) || cleaned.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (match) {
      date = new Date(match[0]);
    }
  }
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

function parseLabel(text) {
  if (!text) return null;
  const match = text.match(/\bLabel\s*:\s*([^\n\r]+)/i);
  if (!match) return null;
  return String(match[1]).trim();
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }
  const workers = [];
  const workerCount = Math.min(limit, items.length);
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

function formatSecondsToTime(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}:${String(remMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildAlbumTracksEmbed({ artist, album, tracks, displayName, totalTracks, totalDuration, totalPlays, page, totalPages }) {
  const list = Array.isArray(tracks) ? tracks : [];
  const lines = list.map((track, index) => {
    const name = track?.name || "Sconosciuto";
    const plays = Number(track?.userplaycount || track?.playcount || 0);
    const playsLabel = plays === 1 ? "play" : "plays";
    const duration = formatSecondsToTime(Number(track?.duration || 0));
    const parts = [];
    if (plays > 0) parts.push(`${plays} ${playsLabel}`);
    if (duration) parts.push(duration);
    const meta = parts.length ? ` - ${parts.join(" - ")}` : "";
    return `${index + 1}. ${name}${meta}`;
  });
  const pageLine = `Page ${page || 1}/${totalPages || 1} - ${totalTracks || list.length} total tracks - ${totalDuration || "0:00"}`;
  const playsLine = `Album source: Last.fm | ${displayName} has ${totalPlays} total scrobbles on this album`;
  return new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Track playcounts for ${album} by ${artist}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `${pageLine}\n${playsLine}` });
}

module.exports = {
  skipPrefix: false,
  name: "albumtracks",
  aliases: ["abt"],
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

      const releaseRaw = album?.wiki?.published || album?.releasedate || album?.wiki?.summary || album?.wiki?.content || "";
      const releaseDate = formatReleaseDate(releaseRaw) || "No data";
      const label = parseLabel(album?.wiki?.content) || parseLabel(album?.wiki?.summary);
      const listeners = Number(album.listeners || 0);
      const playcount = Number(album.playcount || 0);

      let coverUrl = album.image?.find(img => img.size === "extralarge")?.["#text"]
        || album.image?.find(img => img.size === "large")?.["#text"]
        || null;

      let serverListeners = 0;
      let serverPlays = 0;
      if (message.guild) {
        if (message.guild.members.cache.size < message.guild.memberCount) {
          try {
            await message.guild.members.fetch();
          } catch {}
        }
        const guildIds = message.guild.members.cache.map(member => member.id);
        const allUsers = await LastFmUser.find({
          discordId: { $in: guildIds },
          privacyGlobal: true,
          lastFmUsername: { $exists: true, $nin: ["", "pending"] }
        });
        if (allUsers.length) {
          const results = await mapWithConcurrency(allUsers, 3, async doc => {
            try {
              const info = await lastFmRequest("album.getinfo", {
                artist: resolved.artist,
                album: resolved.album,
                username: doc.lastFmUsername
              });
              const plays = Number(info?.album?.userplaycount || 0);
              return plays;
            } catch {
              return 0;
            }
          });
          results.forEach(plays => {
            if (plays > 0) serverListeners += 1;
            serverPlays += plays;
          });
        }
      }
      const serverAvg = serverListeners ? Math.round(serverPlays / serverListeners) : 0;
      const statsLines = [
        `${formatInline(formatNumber(listeners))} listeners`,
        `${formatInline(formatNumber(playcount))} global plays`
      ];
      const serverLines = [
        `${formatInline(formatNumber(serverListeners))} listener${serverListeners === 1 ? "" : "s"}`,
        `${formatInline(formatNumber(serverPlays))} total plays`,
        `${formatInline(formatNumber(serverAvg))} avg plays`
      ];
      const infoEmbed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(`Album: ${resolved.artist} - ${album.name} for ${displayName}`)
        .setURL(buildAlbumUrl(resolved.artist, album.name))
        .setDescription(`Release date: ${releaseDate}`)
        .addFields(
          { name: "Stats", value: statsLines.join("\n"), inline: true },
          { name: "Server stats", value: serverLines.join("\n"), inline: true }
        );
      if (label) {
        infoEmbed.addFields({ name: "\u200b", value: `Label: ${label}`, inline: false });
      }
      if (coverUrl) infoEmbed.setThumbnail(coverUrl);

      const trackListRaw = album?.tracks?.track || [];
      const tracks = Array.isArray(trackListRaw) ? trackListRaw : [trackListRaw];
      if (!tracks.length) {
        return message.channel.send({
          content: "<:vegax:1443934876440068179> Nessuna traccia trovata per questo album."
        });
      }
      const totalDurationSeconds = tracks.reduce((sum, track) => sum + Number(track?.duration || 0), 0);
      const totalDuration = formatSecondsToTime(totalDurationSeconds) || "0:00";
      const limit = 12;
      const totalTracks = tracks.length;
      const totalPages = Math.max(1, Math.ceil(totalTracks / limit));
      const page = 1;
      const pageTracks = tracks.slice(0, limit);
      const embed = buildAlbumTracksEmbed({
        artist: resolved.artist,
        album: album.name,
        tracks: pageTracks,
        displayName,
        totalTracks,
        totalDuration,
        totalPlays: Number(album.userplaycount || 0),
        page,
        totalPages
      });

      const sent = await message.channel.send({ embeds: [embed] });
      const row = totalPages > 1
        ? new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`lfm_albumtracks:first:${sent.id}`)
              .setStyle(ButtonStyle.Secondary)
              .setEmoji({ id: "1463196324156674289" })
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(`lfm_albumtracks:prev:${sent.id}`)
              .setStyle(ButtonStyle.Secondary)
              .setEmoji({ id: "1463196506143326261" })
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(`lfm_albumtracks:next:${sent.id}`)
              .setStyle(ButtonStyle.Secondary)
              .setEmoji({ id: "1463196456964980808" })
              .setDisabled(totalPages <= 1),
            new ButtonBuilder()
              .setCustomId(`lfm_albumtracks:last:${sent.id}`)
              .setStyle(ButtonStyle.Secondary)
              .setEmoji({ id: "1463196404120813766" })
              .setDisabled(totalPages <= 1),
            new ButtonBuilder()
              .setCustomId("lfm_album_back:" + sent.id)
              .setStyle(ButtonStyle.Secondary)
                .setEmoji("📀")
          )
        : new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("lfm_album_back:" + sent.id)
              .setStyle(ButtonStyle.Secondary)
                .setEmoji("📀")
          );
      await sent.edit({ components: [row] });

      if (!message.client.albumStates) {
        message.client.albumStates = new Map();
      }
      message.client.albumStates.set(sent.id, {
        userId: message.author.id,
        artist: resolved.artist,
        album: album.name,
        tracks,
        coverUrl,
        lastFmUsername: user.lastFmUsername,
        displayName,
        albumUserPlays: Number(album.userplaycount || 0),
        limit: 12,
        page: 1,
        totalPages,
        totalTracks,
        totalDuration,
        mainEmbed: infoEmbed.toJSON(),
        expiresAt: Date.now() + 10 * 60 * 1000
      });
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
