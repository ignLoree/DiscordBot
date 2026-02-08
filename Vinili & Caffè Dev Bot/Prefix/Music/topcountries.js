const { safeChannelSend } = require('../../Utils/Moderation/message');
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, lastFmRequest, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm, extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { getMusicBrainzArtistCountry } = require("../../Utils/Music/musicbrainz");
const { getSpotifyArtistImageSmart } = require("../../Utils/Music/spotify");
let renderTopList = null;
try {
  renderTopList = require("../../Utils/Render/topListCanvas");
} catch {
  renderTopList = null;
}

const PERIODS = {
  weekly: "7day",
  w: "7day",
  monthly: "1month",
  m: "1month",
  quarterly: "3month",
  q: "3month",
  half: "6month",
  h: "6month",
  yearly: "12month",
  y: "12month",
  alltime: "overall",
  a: "overall",
  overall: "overall",
  week: "7day",
  month: "1month",
  quarter: "3month",
  year: "12month"
};

function parsePeriodToken(args) {
  let period = "7day";
  const rest = [];
  let used = false;
  for (const raw of args || []) {
    const token = String(raw || "").toLowerCase();
    if (!used && PERIODS[token]) {
      period = PERIODS[token];
      used = true;
      continue;
    }
    rest.push(raw);
  }
  return { period, rest };
}

function formatPeriodLabel(period) {
  switch (period) {
    case "7day":
      return "Weekly";
    case "1month":
      return "Monthly";
    case "3month":
      return "Quarterly";
    case "6month":
      return "Half-year";
    case "12month":
      return "Yearly";
    case "overall":
      return "Overall";
    default:
      return "Weekly";
  }
}

function extractModeToken(args) {
  let mode = null;
  const rest = [];
  for (const raw of args || []) {
    const token = String(raw || "").toLowerCase();
    if (token === "image" || token === "img") {
      mode = "image";
      continue;
    }
    if (token === "embed") {
      mode = "embed";
      continue;
    }
    rest.push(raw);
  }
  return { mode, rest };
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
  name: "topcountries",
  aliases: ["tc"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const modeInfo = extractModeToken(args);
    const periodInfo = parsePeriodToken(modeInfo.rest);
    const pagination = extractPagination(periodInfo.rest, { defaultLimit: 10, maxLimit: 30 });

    const { target, lastfm } = extractTargetUserWithLastfm(message, periodInfo.rest);
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;
    const mode = modeInfo.mode || user.responseMode || "embed";

    const member = message.guild?.members.cache.get(target.id);
    const displayName = lastfm || member?.displayName || member?.user?.username || target.username;

    try {
      const data = await lastFmRequest("user.gettopartists", {
        user: user.lastFmUsername,
        period: periodInfo.period,
        limit: 200
      });
      const artists = data?.topartists?.artist || [];
      if (!artists.length) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("Nessun artista trovato per questo periodo.")
          ]
        });
      }

      const withCountry = await mapWithConcurrency(artists, 4, async artist => {
        const name = artist?.name || "";
        const playcount = Number(artist?.playcount || 0);
        const country = await getMusicBrainzArtistCountry(name);
        return { name, playcount, country };
      });

      const totals = new Map();
      withCountry.forEach(item => {
        if (!item.country) return;
        const key = item.country;
        if (!totals.has(key)) {
          totals.set(key, { country: key, count: 0, plays: 0 });
        }
        const entry = totals.get(key);
        entry.count += 1;
        entry.plays += item.playcount;
      });

      const resultsAll = Array.from(totals.values())
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return b.plays - a.plays;
        });

      if (!resultsAll.length) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("Nessuna nazione trovata per questo periodo.")
          ]
        });
      }

      const totalPages = Math.max(1, Math.ceil(resultsAll.length / pagination.limit));
      const page = Math.min(totalPages, Math.max(1, pagination.page));
      const start = (page - 1) * pagination.limit;
      const results = resultsAll.slice(start, start + pagination.limit);

      if (mode === "image" && renderTopList) {
        const topArtistName = artists[0]?.name || null;
        const coverUrl = await getSpotifyArtistImageSmart(topArtistName);
        const rows = results.map((item, index) => ({
          rank: start + index + 1,
          label: item.country,
          plays: formatNumber(item.plays, user.localization?.numberFormat)
        }));
        const totalPlays = resultsAll.reduce((sum, item) => sum + item.plays, 0);
        const buffer = await renderTopList({
          title: "Top Countries",
          displayName,
          periodLabel: `${formatPeriodLabel(periodInfo.period)}  •  Playcounts`,
          rows,
          footerLeft: `${formatNumber(resultsAll.length, user.localization?.numberFormat)} total countries`,
          footerRight: `${formatNumber(totalPlays, user.localization?.numberFormat)} total plays`,
          coverUrl
        });
        if (buffer) {
          const attachment = new AttachmentBuilder(buffer, { name: "topcountries.png" });
          return safeChannelSend(message.channel, { files: [attachment] });
        }
      }

      const lines = results.map(item => {
        const label = item.plays === 1 ? "play" : "plays";
        return `${item.count} • ${item.country} - ${formatNumber(item.plays, user.localization?.numberFormat)} ${label}`;
      });

      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(`Top ${periodInfo.period === "overall" ? "alltime" : "weekly"} artist countries for ${displayName}`)
        .setDescription(lines.join("\n"))
        .setFooter({
          text: `Country source: Musicbrainz\nOrdered by artists per country\nPage ${page}/${totalPages} - ${resultsAll.length} total countries`
        });

      return safeChannelSend(message.channel, { embeds: [embed] });
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Errore durante il recupero dei dati.")
        ]
      });
    }
  }
};


