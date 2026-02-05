const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { lastFmRequest } = require("../../Utils/Music/lastfm");
const { extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { buildServerAlbumsEmbed, buildServerAlbumsComponents } = require("../../Utils/Music/serverAlbumsView");

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

function getLatestWeeklyRanges(charts) {
  const list = Array.isArray(charts) ? charts : [charts];
  const ranges = list
    .map(range => ({
      from: Number(range.from),
      to: Number(range.to)
    }))
    .filter(range => Number.isFinite(range.from) && Number.isFinite(range.to))
    .sort((a, b) => a.from - b.from);
  if (!ranges.length) return { current: null, previous: null };
  const current = ranges[ranges.length - 1] || null;
  const previous = ranges.length > 1 ? ranges[ranges.length - 2] : null;
  return { current, previous };
}

function applyRanks(list) {
  let rank = 0;
  let prevPlays = null;
  list.forEach((album, index) => {
    const plays = Number(album.playcount || 0);
    if (prevPlays === null || plays !== prevPlays) {
      rank = index + 1;
      prevPlays = plays;
    }
    album.rank = rank;
  });
  return list;
}

function normalizeName(value) {
  return String(value || "").toLowerCase().trim();
}

function addAlbumsToTotals(map, albums) {
  const list = Array.isArray(albums) ? albums : [albums];
  const seen = new Set();
  for (const album of list) {
    const artist = album?.artist?.name || album?.artist?.["#text"] || album?.artist || "Unknown";
    const name = album?.name || "Unknown";
    const key = `${artist}||${name}`.toLowerCase();
    const plays = Number(album?.playcount || 0);
    if (!map.has(key)) {
      map.set(key, { key, name, artist: { name: artist }, playcount: plays, listeners: 0 });
    } else {
      map.get(key).playcount += plays;
    }
    if (!seen.has(key)) {
      map.get(key).listeners += 1;
      seen.add(key);
    }
  }
}

module.exports = {
  skipPrefix: false,
  name: "serveralbums",
  aliases: ["sa"],
  async execute(message, args) {
    await message.channel.sendTyping();
    if (!message.guild) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.")
        ]
      });
    }
    const rawArgs = Array.isArray(args) ? [...args] : [];
    if (rawArgs.length && ["artist", "artista"].includes(rawArgs[0].toLowerCase())) {
      rawArgs.shift();
    }
    const pagination = extractPagination(rawArgs, { defaultLimit: 12, maxLimit: 50 });
    const artistFilter = pagination.args.join(" ").trim() || null;
    try {
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
      if (!allUsers.length) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("<:vegax:1443934876440068179> Nessun utente Last.fm trovato nel server.")
          ]
        });
      }
      const totalsCurrent = new Map();
      const totalsPrev = new Map();
      await mapWithConcurrency(allUsers, 3, async (doc) => {
        try {
          const list = await lastFmRequest("user.getweeklychartlist", {
            user: doc.lastFmUsername
          });
          const charts = list?.weeklychartlist?.chart || [];
          const { current, previous } = getLatestWeeklyRanges(charts);
          if (!current) return null;
          const currentChart = await lastFmRequest("user.getweeklyalbumchart", {
            user: doc.lastFmUsername,
            from: current.from,
            to: current.to
          });
          addAlbumsToTotals(totalsCurrent, currentChart?.weeklyalbumchart?.album || []);
          if (previous) {
            const prevChart = await lastFmRequest("user.getweeklyalbumchart", {
              user: doc.lastFmUsername,
              from: previous.from,
              to: previous.to
            });
            addAlbumsToTotals(totalsPrev, prevChart?.weeklyalbumchart?.album || []);
          }
          return null;
        } catch {
          return null;
        }
      });

      const baseCurrent = Array.from(totalsCurrent.values());
      const basePrev = Array.from(totalsPrev.values());
      let currentList = baseCurrent.slice();
      let prevList = basePrev.slice();
      let orderLabel = "plays";
      let showArtist = true;
      let showListeners = false;

      if (artistFilter) {
        const target = normalizeName(artistFilter);
        currentList = currentList.filter(album => normalizeName(album.artist?.name || album.artist) === target);
        prevList = prevList.filter(album => normalizeName(album.artist?.name || album.artist) === target);
        currentList.sort((a, b) => {
          if (b.listeners !== a.listeners) return b.listeners - a.listeners;
          return b.playcount - a.playcount;
        });
        prevList.sort((a, b) => {
          if (b.listeners !== a.listeners) return b.listeners - a.listeners;
          return b.playcount - a.playcount;
        });
        currentList = applyRanks(currentList);
        prevList = applyRanks(prevList);
        orderLabel = "listeners";
        showArtist = false;
      } else {
        currentList.sort((a, b) => b.playcount - a.playcount);
        prevList.sort((a, b) => b.playcount - a.playcount);
        currentList = applyRanks(currentList);
        prevList = applyRanks(prevList);
      }

      if (!currentList.length) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(artistFilter
                ? "Nessun album trovato per questo artista."
                : "Nessun album trovato per questa settimana.")
          ]
        });
      }

      const prevRanks = new Map();
      prevList.forEach((album, index) => {
        prevRanks.set(album.key, album.rank || (index + 1));
      });

      const totalAlbums = currentList.length;
      const totalPages = Math.max(1, Math.ceil(totalAlbums / pagination.limit));
      const page = Math.min(totalPages, Math.max(1, pagination.page));
      const start = (page - 1) * pagination.limit;
      const pageAlbums = currentList.slice(start, start + pagination.limit);

      const member = message.guild.members.cache.get(message.author.id);
      const displayName = member?.displayName || member?.user?.username || message.author.username;
      const requester = allUsers.find(user => user.discordId === message.author.id);
      const numberFormat = requester?.localization?.numberFormat;
      const embed = buildServerAlbumsEmbed({
        displayName,
        albums: pageAlbums,
        page,
        totalPages,
        prevRanks,
        numberFormat,
        limit: pagination.limit,
        artistFilter,
        orderLabel,
        showArtist,
        showListeners
      });
      const sent = await safeChannelSend(message.channel, { embeds: [embed] });
      const components = buildServerAlbumsComponents({
        page,
        totalPages,
        messageId: sent.id
      });
      if (components.length) {
        await sent.edit({ components });
      }
      if (!message.client.serverAlbumsStates) {
        message.client.serverAlbumsStates = new Map();
      }
      message.client.serverAlbumsStates.set(sent.id, {
        userId: message.author.id,
        guildId: message.guild.id,
        page,
        limit: pagination.limit,
        totalPages,
        totalAlbums,
        displayName,
        numberFormat,
        prevRanks,
        albums: currentList,
        artistFilter,
        orderLabel,
        showArtist,
        showListeners,
        expiresAt: Date.now() + 30 * 60 * 1000
      });
      return;
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante il recupero dei dati.")
        ]
      });
    }
  }
};


