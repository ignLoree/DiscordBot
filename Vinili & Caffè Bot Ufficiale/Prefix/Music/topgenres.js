const { safeChannelSend } = require('../../Utils/Moderation/message');
const { AttachmentBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { lastFmRequest, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm, extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { getSpotifyArtistMeta, getSpotifyArtistImageSmart } = require("../../Utils/Music/spotify");
const { buildTopGenresEmbed, buildTopGenresComponents } = require("../../Utils/Music/topGenresView");

const TOP_ARTISTS_LIMIT = 200;
let renderTopList = null;
try {
  renderTopList = require("../../Utils/Render/topListCanvas");
} catch {
  renderTopList = null;
}

function normalizePeriodToken(token) {
  const t = String(token || "").toLowerCase();
  if (/^\d+d$/.test(t)) {
    const days = Number(t.replace("d", ""));
    if (days === 7) return "7day";
    if (days === 30) return "1month";
    if (days === 90) return "3month";
    if (days === 180) return "6month";
    if (days === 365) return "12month";
    return null;
  }
  const map = new Map([
    ["7day", "7day"],
    ["1month", "1month"],
    ["3month", "3month"],
    ["6month", "6month"],
    ["12month", "12month"],
    ["overall", "overall"],
    ["week", "7day"],
    ["month", "1month"],
    ["quarter", "3month"],
    ["half", "6month"],
    ["year", "12month"],
    ["all", "overall"]
  ]);
  return map.get(t) || null;
}

function parsePeriod(args) {
  let period = "7day";
  const rest = [];
  let used = false;
  for (const raw of args || []) {
    const normalized = normalizePeriodToken(raw);
    if (!used && normalized) {
      period = normalized;
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
  return { mode, args: rest };
}

function isPeriodToken(token) {
  return Boolean(normalizePeriodToken(token));
}

function isPaginationToken(token) {
  return /^(page|p)[:=]\d+$/i.test(token) || /^(limit|l)[:=]\d+$/i.test(token);
}

async function resolveUserOverride(candidate) {
  if (!candidate) return null;
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return LastFmUser.findOne({ lastFmUsername: new RegExp(`^${escaped}$`, "i") });
}

async function buildGenresFromTopArtists(artists) {
  const genreMap = new Map();
  const metaCache = new Map();
  for (const artist of artists) {
    const name = artist?.name || artist?.["name"] || "";
    if (!name) continue;
    const key = name.trim().toLowerCase();
    let meta = metaCache.get(key);
    if (meta === undefined) {
      try {
        meta = await getSpotifyArtistMeta(name);
      } catch {
        meta = null;
      }
      metaCache.set(key, meta || null);
    }
    const genres = Array.isArray(meta?.genres) ? meta.genres : [];
    if (!genres.length) continue;
    const plays = Number(artist?.playcount || 0);
    for (const genre of genres) {
      const gName = String(genre || "").trim();
      if (!gName) continue;
      const gKey = gName.toLowerCase();
      const current = genreMap.get(gKey) || { name: gName, plays: 0 };
      current.plays += plays;
      genreMap.set(gKey, current);
    }
  }
  return Array.from(genreMap.values()).sort((a, b) => {
    const diff = (Number(b.plays) || 0) - (Number(a.plays) || 0);
    if (diff !== 0) return diff;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

module.exports = {
  skipPrefix: false,
  name: "topgenres",
  aliases: ["tgen", "topgenre", "tgenres", "topg"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const modeInfo = extractModeToken(Array.isArray(args) ? [...args] : []);
    const userArgs = modeInfo.args;
    let userOverride = null;

    if (userArgs.length && userArgs[0].toLowerCase().startsWith("lfm:")) {
      userOverride = userArgs.shift().slice(4);
    } else if (userArgs.length && !isPeriodToken(userArgs[0]) && !isPaginationToken(userArgs[0])) {
      const candidate = userArgs[0];
      const found = await resolveUserOverride(candidate);
      if (found) {
        userOverride = found.lastFmUsername;
        userArgs.shift();
      }
    }

    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, userArgs);
    const periodInfo = parsePeriod(filteredArgs);
    const period = periodInfo.period;
    const paginationArgs = periodInfo.rest;
    const pagination = extractPagination(paginationArgs, { defaultLimit: 10, maxLimit: 50 });
    const user = await getLastFmUserForMessageOrUsername(message, target, userOverride || lastfm);
    if (!user) return;
    const mode = modeInfo.mode || user.responseMode || "embed";

    try {
      const data = await lastFmRequest("user.gettopartists", {
        user: user.lastFmUsername,
        period,
        limit: TOP_ARTISTS_LIMIT,
        page: 1
      });
      const artists = data?.topartists?.artist || [];
      if (!artists.length) throw new Error("No artists");

      const genres = await buildGenresFromTopArtists(artists);
      if (!genres.length) throw new Error("No genres");

      const totalGenres = genres.length;
      const totalPages = Math.max(1, Math.ceil(totalGenres / pagination.limit));
      const page = Math.min(totalPages, Math.max(1, pagination.page));
      const start = (page - 1) * pagination.limit;
      const slice = genres.slice(start, start + pagination.limit);
      const member = message.guild?.members.cache.get(target.id);
      const displayName = member?.displayName || member?.user?.username || target.username;

      if (mode === "image" && renderTopList) {
        const topArtistName = artists[0]?.name || null;
        const coverUrl = await getSpotifyArtistImageSmart(topArtistName);
        const rows = slice.map((genre, index) => ({
          rank: start + index + 1,
          label: genre.name || "Sconosciuto",
          plays: formatNumber(genre.plays || 0, user.localization?.numberFormat)
        }));
        const totalPlays = genres.reduce((sum, item) => sum + Number(item.plays || 0), 0);
        const buffer = await renderTopList({
          title: "Top Genres",
          displayName,
          periodLabel: `${formatPeriodLabel(period)} Â· Playcounts`,
          rows,
          footerLeft: `${formatNumber(totalGenres, user.localization?.numberFormat)} different genres`,
          footerRight: `${formatNumber(totalPlays, user.localization?.numberFormat)} total plays`,
          coverUrl
        });
        if (buffer) {
          const attachment = new AttachmentBuilder(buffer, { name: "topgenres.png" });
          return safeChannelSend(message.channel, { files: [attachment] });
        }
      }

      const embed = buildTopGenresEmbed({
        displayName,
        genres: slice,
        page,
        totalPages,
        totalGenres,
        period,
        limit: pagination.limit,
        numberFormat: user.localization?.numberFormat
      });

      const sent = await safeChannelSend(message.channel, { embeds: [embed] });
      const components = buildTopGenresComponents({
        page,
        totalPages,
        messageId: sent.id
      });
      if (components.length) {
        await sent.edit({ components });
      }

      if (!message.client.topGenresStates) {
        message.client.topGenresStates = new Map();
      }
      message.client.topGenresStates.set(sent.id, {
        userId: message.author.id,
        lastFmUsername: user.lastFmUsername,
        period,
        page,
        limit: pagination.limit,
        totalPages,
        totalGenres,
        genres,
        displayName,
        numberFormat: user.localization?.numberFormat,
        expiresAt: Date.now() + 30 * 60 * 1000
      });
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        content: "<:vegax:1443934876440068179> Errore durante il recupero dei dati di Last.fm."
      });
    }
  }
};


