const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, buildAlbumUrl, formatNumber, lastFmRequest } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm, splitArtistTitle } = require("../../Utils/Music/lastfmPrefix");
const { resolveAlbumArtist } = require("../../Utils/Music/lastfmResolvers");
const { handleLastfmError, sendAlbumNotFound } = require("../../Utils/Music/lastfmError");
const { getSpotifyAlbumImageSmart } = require("../../Utils/Music/spotify");

function formatInline(value) {
  return `\`${value}\``;
}

function formatReleaseDate(text) {
  if (!text) return null;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
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

module.exports = {
  skipPrefix: false,
  name: "cover",
  aliases: ["co"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, args);
    const query = filteredArgs.join(" ").trim();
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

      let coverUrl = album.image?.find(img => img.size === "extralarge")?.["#text"]
        || album.image?.find(img => img.size === "large")?.["#text"]
        || null;
      const displayName = message.guild?.members.cache.get(target.id)?.displayName
        || target.username
        || user.lastFmUsername;

      const coverEmbed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(`${resolved.artist} - ${album.name}`)
        .setDescription(`Requested by ${displayName}`);

      Build album info embed for back button
      const releaseRaw = album?.wiki?.published || album?.releasedate || "";
      const releaseDate = formatReleaseDate(releaseRaw) || "No data";
      const label = parseLabel(album?.wiki?.content) || parseLabel(album?.wiki?.summary);
      const listeners = Number(album.listeners || 0);
      const playcount = Number(album.playcount || 0);

      let serverListeners = 0;
      let serverPlays = 0;
      if (message.guild) {
        if (message.guild.members.cache.size < message.guild.memberCount) {
          try {
            await message.guild.members.fetch();
          } catch {}
        }
        const guildIds = message.guild.members.cache.map(member => member.id);
        const allUsers = await require("../../Schemas/LastFm/lastFmSchema").find({
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
      const trackListRaw = album?.tracks?.track || [];
      const trackList = Array.isArray(trackListRaw) ? trackListRaw : [trackListRaw];
      if (!coverUrl) {
        const albumUrl = buildAlbumUrl(resolved.artist, album.name);
        const missingEmbed = new EmbedBuilder()
          .setColor(DEFAULT_EMBED_COLOR)
          .setDescription("Sorry, no album cover found for this album:\n" + resolved.artist + " - " + album.name + "\n[View on last.fm](" + albumUrl + ")");
        const sent = await message.channel.send({ embeds: [missingEmbed] });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("lfm_cover_back:" + sent.id)
            .setLabel("Album")
            .setEmoji("\u{1F4BF}")
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
          coverUrl: null,
          lastFmUsername: user.lastFmUsername,
          displayName,
          albumUserPlays: Number(album.userplaycount || 0),
          mainEmbed: infoEmbed.toJSON(),
          expiresAt: Date.now() + 10 * 60 * 1000
        });
        return;
      }

      if (coverUrl) infoEmbed.setThumbnail(coverUrl);

      const coverAttachment = new AttachmentBuilder(coverUrl, { name: "cover.jpg" });
      const sent = await message.channel.send({ embeds: [coverEmbed], files: [coverAttachment] });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("lfm_cover_back:" + sent.id)
          .setLabel("Album")
          .setEmoji("\u{1F4BF}")
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
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante il recupero della cover.")
        ]
      });
    }
  }
};
