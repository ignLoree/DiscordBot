const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { lastFmRequest } = require("../../Utils/Music/lastfm");
const { extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { buildServerTracksEmbed, buildServerTracksComponents } = require("../../Utils/Music/serverTracksView");

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
  list.forEach((track, index) => {
    const plays = Number(track.playcount || 0);
    if (prevPlays === null || plays !== prevPlays) {
      rank = index + 1;
      prevPlays = plays;
    }
    track.rank = rank;
  });
  return list;
}

function normalizeName(value) {
  return String(value || "").toLowerCase().trim();
}

function addTracksToTotals(map, tracks) {
  const list = Array.isArray(tracks) ? tracks : [tracks];
  const seen = new Set();
  for (const track of list) {
    const artist = track?.artist?.name || track?.artist?.["#text"] || track?.artist || "Unknown";
    const name = track?.name || "Unknown";
    const key = `${artist}||${name}`.toLowerCase();
    const plays = Number(track?.playcount || 0);
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
  name: "servertracks",
  aliases: ["st"],
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
          const currentChart = await lastFmRequest("user.getweeklytrackchart", {
            user: doc.lastFmUsername,
            from: current.from,
            to: current.to
          });
          addTracksToTotals(totalsCurrent, currentChart?.weeklytrackchart?.track || []);
          if (previous) {
            const prevChart = await lastFmRequest("user.getweeklytrackchart", {
              user: doc.lastFmUsername,
              from: previous.from,
              to: previous.to
            });
            addTracksToTotals(totalsPrev, prevChart?.weeklytrackchart?.track || []);
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
        currentList = currentList.filter(track => normalizeName(track.artist?.name || track.artist) === target);
        prevList = prevList.filter(track => normalizeName(track.artist?.name || track.artist) === target);
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
                ? "Nessuna traccia trovata per questo artista."
                : "Nessuna traccia trovata per questa settimana.")
          ]
        });
      }

      const prevRanks = new Map();
      prevList.forEach((track, index) => {
        prevRanks.set(track.key, track.rank || (index + 1));
      });

      const totalTracks = currentList.length;
      const totalPages = Math.max(1, Math.ceil(totalTracks / pagination.limit));
      const page = Math.min(totalPages, Math.max(1, pagination.page));
      const start = (page - 1) * pagination.limit;
      const pageTracks = currentList.slice(start, start + pagination.limit);

      const member = message.guild.members.cache.get(message.author.id);
      const displayName = member?.displayName || member?.user?.username || message.author.username;
      const requester = allUsers.find(user => user.discordId === message.author.id);
      const numberFormat = requester?.localization?.numberFormat;
      const embed = buildServerTracksEmbed({
        displayName,
        tracks: pageTracks,
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
      const components = buildServerTracksComponents({
        page,
        totalPages,
        messageId: sent.id
      });
      if (components.length) {
        await sent.edit({ components });
      }
      if (!message.client.serverTracksStates) {
        message.client.serverTracksStates = new Map();
      }
      message.client.serverTracksStates.set(sent.id, {
        userId: message.author.id,
        guildId: message.guild.id,
        page,
        limit: pagination.limit,
        totalPages,
        totalTracks,
        displayName,
        numberFormat,
        prevRanks,
        tracks: currentList,
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


