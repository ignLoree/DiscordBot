const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { lastFmRequest } = require("../../Utils/Music/lastfm");
const { extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { buildServerArtistsEmbed, buildServerArtistsComponents } = require("../../Utils/Music/serverArtistsView");

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
  let prevValue = null;
  list.forEach((item, index) => {
    const value = Number(item.listeners || 0);
    if (prevValue === null || value !== prevValue) {
      rank = index + 1;
      prevValue = value;
    }
    item.rank = rank;
  });
  return list;
}

function addArtistsToTotals(map, artists) {
  const list = Array.isArray(artists) ? artists : [artists];
  const seen = new Set();
  for (const artist of list) {
    const name = artist?.name || artist?.["#text"] || "Unknown";
    const key = name.toLowerCase();
    const plays = Number(artist?.playcount || 0);
    if (!map.has(key)) {
      map.set(key, { key, name, playcount: plays, listeners: 0 });
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
  name: "serverartists",
  aliases: ["sa"],
  async execute(message, args) {
    await message.channel.sendTyping();
    if (!message.guild) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando puÃ² essere usato solo in un server.")
        ]
      });
    }

    const pagination = extractPagination(args, { defaultLimit: 12, maxLimit: 50 });

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
          const currentChart = await lastFmRequest("user.getweeklyartistchart", {
            user: doc.lastFmUsername,
            from: current.from,
            to: current.to
          });
          addArtistsToTotals(totalsCurrent, currentChart?.weeklyartistchart?.artist || []);
          if (previous) {
            const prevChart = await lastFmRequest("user.getweeklyartistchart", {
              user: doc.lastFmUsername,
              from: previous.from,
              to: previous.to
            });
            addArtistsToTotals(totalsPrev, prevChart?.weeklyartistchart?.artist || []);
          }
          return null;
        } catch {
          return null;
        }
      });

      let currentList = Array.from(totalsCurrent.values());
      let prevList = Array.from(totalsPrev.values());

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

      if (!currentList.length) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("Nessun artista trovato per questa settimana.")
          ]
        });
      }

      const prevRanks = new Map();
      prevList.forEach((artist, index) => {
        prevRanks.set(artist.key, artist.rank || (index + 1));
      });

      const totalArtists = currentList.length;
      const totalPages = Math.max(1, Math.ceil(totalArtists / pagination.limit));
      const page = Math.min(totalPages, Math.max(1, pagination.page));
      const start = (page - 1) * pagination.limit;
      const pageArtists = currentList.slice(start, start + pagination.limit);

      const member = message.guild.members.cache.get(message.author.id);
      const displayName = member?.displayName || message.author.username;
      const requester = allUsers.find(user => user.discordId === message.author.id);
      const numberFormat = requester?.localization?.numberFormat;

      const embed = buildServerArtistsEmbed({
        displayName,
        artists: pageArtists,
        page,
        totalPages,
        prevRanks,
        numberFormat,
        limit: pagination.limit,
        orderLabel: "listeners",
        showListeners: false
      });

      const sent = await safeChannelSend(message.channel, { embeds: [embed] });
      const components = buildServerArtistsComponents({
        page,
        totalPages,
        messageId: sent.id
      });
      if (components.length) {
        await sent.edit({ components });
      }

      if (!message.client.serverArtistsStates) {
        message.client.serverArtistsStates = new Map();
      }
      message.client.serverArtistsStates.set(sent.id, {
        userId: message.author.id,
        guildId: message.guild.id,
        page,
        limit: pagination.limit,
        totalPages,
        totalArtists,
        displayName,
        numberFormat,
        prevRanks,
        artists: currentList,
        orderLabel: "listeners",
        showListeners: false,
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


