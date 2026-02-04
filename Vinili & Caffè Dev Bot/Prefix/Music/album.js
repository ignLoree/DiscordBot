const { safeChannelSend } = require('../../Utils/Moderation/message');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { DEFAULT_EMBED_COLOR, buildAlbumUrl, formatNumber, lastFmRequest } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm, splitArtistTitle } = require("../../Utils/Music/lastfmPrefix");
const { resolveAlbumArtist } = require("../../Utils/Music/lastfmResolvers");
const { handleLastfmError, sendAlbumNotFound } = require("../../Utils/Music/lastfmError");
const { getSpotifyAlbumImageSmart } = require("../../Utils/Music/spotify");

function formatInline(value) {
  return `\`${value}\``;
}

function formatHoursMinutes(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return null;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} minutes`;
  return `${hours} hours, ${minutes} minutes`;
}

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

function parseReleaseDateToUnix(text) {
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
  return Math.floor(date.getTime() / 1000);
}

function parseLabel(text) {
  if (!text) return null;
  const match = text.match(/\bLabel\s*:\s*([^\n\r]+)/i);
  if (!match) return null;
  return String(match[1]).trim();
}

function cleanWikiText(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyItalian(text) {
  const value = cleanWikiText(text).toLowerCase();
  if (!value) return false;
  const italianHits = (value.match(/\b(il|lo|la|i|gli|le|un|una|nel|nello|nella|dei|degli|delle|della|dell|che|per|con|tra|fra|anche|come)\b/g) || []).length;
  const englishHits = (value.match(/\b(the|and|was|from|with|this|that|which|who|its|their|into|over|about)\b/g) || []).length;
  if (englishHits > italianHits) return false;
  return italianHits >= 3;
}

function getItalianSummary(album) {
  const candidate = album?.wiki?.summary || album?.wiki?.content || "";
  if (!candidate) return null;
  if (!isLikelyItalian(candidate)) return null;
  const cleaned = cleanWikiText(candidate);
  if (!cleaned) return null;
  return cleaned.length > 900 ? cleaned.slice(0, 900).trim() + "?" : cleaned;
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


async function getDeezerAlbumLabel(artistName, albumName) {
  if (!albumName) return null;
  const query = artistName ? `${albumName} ${artistName}` : albumName;
  try {
    const search = await axios.get("https://api.deezer.com/search/album", {
      params: { q: query, limit: 5 }
    });
    const pick = (search.data?.data || [])[0];
    const albumId = pick?.id;
    if (!albumId) return null;
    const info = await axios.get(`https://api.deezer.com/album/${albumId}`);
    const label = info.data?.label;
    return label ? String(label).trim() : null;
  } catch {
    return null;
  }
}

async function getDeezerAlbumReleaseDate(artistName, albumName) {
  if (!albumName) return null;
  const query = artistName ? `${albumName} ${artistName}` : albumName;
  try {
    const search = await axios.get("https://api.deezer.com/search/album", {
      params: { q: query, limit: 5 }
    });
    const pick = (search.data?.data || [])[0];
    const albumId = pick?.id;
    if (!albumId) return null;
    const info = await axios.get(`https://api.deezer.com/album/${albumId}`);
    const releaseDate = info.data?.release_date;
    return releaseDate ? String(releaseDate).trim() : null;
  } catch {
    return null;
  }
}

async function getItunesAlbumReleaseDate(artistName, albumName) {
  if (!albumName) return null;
  const query = artistName ? `${albumName} ${artistName}` : albumName;
  try {
    const search = await axios.get("https://itunes.apple.com/search", {
      params: { term: query, entity: "album", limit: 5 }
    });
    const pick = (search.data?.results || [])[0];
    const releaseDate = pick?.releaseDate;
    return releaseDate ? String(releaseDate).trim() : null;
  } catch {
    return null;
  }
}
module.exports = {
  skipPrefix: false,
  name: "album",
  aliases: ["ab"],
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

      const releaseRaw = album?.wiki?.published || album?.releasedate || "";
      let releaseUnix = parseReleaseDateToUnix(releaseRaw);
      if (!releaseUnix) {
        const deezerRelease = await getDeezerAlbumReleaseDate(resolved.artist, album.name);
        releaseUnix = parseReleaseDateToUnix(deezerRelease);
      }
      if (!releaseUnix) {
        const itunesRelease = await getItunesAlbumReleaseDate(resolved.artist, album.name);
        releaseUnix = parseReleaseDateToUnix(itunesRelease);
      }
      const releaseDate = releaseUnix ? `<t:${releaseUnix}:D>` : "No data";
      let label = parseLabel(album?.wiki?.content) || parseLabel(album?.wiki?.summary);
      if (!label) {
        label = await getDeezerAlbumLabel(resolved.artist, album.name);
      }
      if (!label) label = "No data";

      const listeners = Number(album.listeners || 0);
      const playcount = Number(album.playcount || 0);
      const playsByYou = Number(album.userplaycount || 0);
      const trackListRaw = album?.tracks?.track || [];
      const trackList = Array.isArray(trackListRaw) ? trackListRaw : [trackListRaw];
      let totalDurationSeconds = 0;
      trackList.forEach(track => {
        const raw = Number(track?.duration || 0);
        if (!raw) return;
        const seconds = raw > 10000 ? raw / 1000 : raw;
        totalDurationSeconds += seconds;
      });
      const minutesSpent = totalDurationSeconds && playsByYou
        ? Math.round((totalDurationSeconds * playsByYou) / 60)
        : 0;
      const timeSpentText = formatHoursMinutes(minutesSpent);
      let playsLastWeek = null;
      try {
        const now = Math.floor(Date.now() / 1000);
        const lastWeekFrom = now - 7 * 24 * 60 * 60;
        playsLastWeek = await getAlbumPlaysInRange(
          user.lastFmUsername,
          resolved.artist,
          album.name,
          lastWeekFrom,
          now
        );
      } catch {
        playsLastWeek = null;
      }

      let coverUrl = album.image?.find(img => img.size === "extralarge")?.["#text"]
        || album.image?.find(img => img.size === "large")?.["#text"]
        || null;
      if (!coverUrl) {
        coverUrl = await getSpotifyAlbumImageSmart(resolved.artist, album.name);
      }

      let serverListeners = 0;
      let serverPlays = 0;
      if (message.guild) {
        if (message.guild.members.cache.size < message.guild.memberCount) {
          try {
            await message.guild.members.fetch();
          } catch {
          }
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
      statsLines.push(`${formatInline(formatNumber(playsByYou))} plays by you`);
      if (playsLastWeek !== null) {
        statsLines.push(`${formatInline(formatNumber(playsLastWeek))} by you last week`);
      }
      if (timeSpentText) {
        statsLines.push(`${formatInline(timeSpentText)} spent listening`);
      }
      const serverLines = [
        `${formatInline(formatNumber(serverListeners))} listener${serverListeners === 1 ? "" : "s"}`,
        `${formatInline(formatNumber(serverPlays))} total plays`,
        `${formatInline(formatNumber(serverAvg))} avg plays`
      ];

      const displayName = message.guild?.members.cache.get(target.id)?.displayName
        || target.username
        || user.lastFmUsername;

      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(`Album: ${resolved.artist} - ${album.name} for ${displayName}`)
        .setURL(buildAlbumUrl(resolved.artist, album.name))
        .setDescription(`Release date: ${releaseDate}`)
        .addFields(
          { name: "Stats", value: statsLines.join("\n"), inline: true },
          { name: "Server stats", value: serverLines.join("\n"), inline: true }
        );
      const summary = getItalianSummary(album);
      if (summary) {
        embed.addFields({ name: "Sommario", value: summary, inline: false });
      }
      let percentLine = null;
      try {
        const userInfo = await lastFmRequest("user.getinfo", {
          user: user.lastFmUsername
        });
        const totalPlays = Number(userInfo?.user?.playcount || 0);
        const albumPlays = Number(album.userplaycount || 0);
        if (totalPlays > 0 && albumPlays >= 0) {
          const percent = (albumPlays / totalPlays) * 100;
          percentLine = `${percent.toFixed(2)}% of all your plays are on this album`;
        }
      } catch {
        percentLine = null;
      }
      const footerLines = [`Label: ${label}`];
      if (percentLine) footerLines.push(percentLine);
      embed.setFooter({ text: footerLines.join("\n") });
      if (coverUrl) embed.setThumbnail(coverUrl);


      const sent = await safeChannelSend(message.channel, { embeds: [embed] });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`lfm_album_tracks:${sent.id}`)
          .setLabel("Album tracks")
          .setEmoji("\uD83C\uDFB5")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`lfm_album_cover:${sent.id}`)
          .setLabel("Cover")
          .setEmoji("\uD83D\uDDBC\uFE0F")
          .setStyle(ButtonStyle.Secondary)
      );
      await sent.edit({ components: [row] });

      if (!message.client.albumStates) {
        message.client.albumStates = new Map();
      }
      message.client.albumStates.set(sent.id, {
        userId: message.author.id,
        artist: resolved.artist,
        album: album.name,
        tracks: trackList,
        coverUrl,
        lastFmUsername: user.lastFmUsername,
        displayName,
        albumUserPlays: Number(album.userplaycount || 0),
        mainEmbed: embed.toJSON(),
        expiresAt: Date.now() + 10 * 60 * 1000
      });
      return;
    } catch (error) {
      if (String(error?.message || error).includes("Album not found")) {
        return sendAlbumNotFound(message, query);
      }
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante il recupero dell'album.")
        ]
      });
    }
  }
};





