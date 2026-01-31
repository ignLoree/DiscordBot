const { AttachmentBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { lastFmRequest, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm, extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { getSpotifyArtistImageSmart } = require("../../Utils/Music/spotify");
const { buildTopArtistsEmbed, buildTopArtistsComponents } = require("../../Utils/Music/topArtistsView");
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

function parseTopArtistsPeriod(args) {
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

module.exports = {
  skipPrefix: false,
  name: "topartists",
  aliases: ["ta"],
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
    const periodInfo = parseTopArtistsPeriod(filteredArgs);
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
        limit: pagination.limit,
        page: pagination.page
      });
      const artists = data?.topartists?.artist || [];
      if (!artists.length) throw new Error("No artists");

      const attr = data?.topartists?.["@attr"] || {};
      const totalPages = Number(attr.totalPages || 1);
      const totalArtists = Number(attr.total || 0);
      const member = message.guild?.members.cache.get(target.id);
      const displayName = member?.displayName || target.username;

      if (mode === "image" && renderTopList) {
        let topArtistName = artists[0]?.name || null;
        if (pagination.page > 1) {
          try {
            const topData = await lastFmRequest("user.gettopartists", {
              user: user.lastFmUsername,
              period,
              limit: 1,
              page: 1
            });
            topArtistName = topData?.topartists?.artist?.[0]?.name || topArtistName;
          } catch {
          }
        }
        const coverUrl = await getSpotifyArtistImageSmart(topArtistName);
        const offset = (pagination.page - 1) * pagination.limit;
        const rows = artists.map((artist, index) => ({
          rank: offset + index + 1,
          label: artist?.name || "Sconosciuto",
          plays: formatNumber(artist?.playcount || 0, user.localization?.numberFormat)
        }));
        const totalPlays = artists.reduce((sum, item) => sum + Number(item?.playcount || 0), 0);
        const buffer = await renderTopList({
          title: "Top Artists",
          displayName,
          periodLabel: `${formatPeriodLabel(period)} · Playcounts`,
          rows,
          footerLeft: `${formatNumber(totalArtists, user.localization?.numberFormat)} different artists`,
          footerRight: `${formatNumber(totalPlays, user.localization?.numberFormat)} total plays`,
          coverUrl
        });
        if (buffer) {
          const attachment = new AttachmentBuilder(buffer, { name: "topartists.png" });
          return message.channel.send({ files: [attachment] });
        }
      }

      const embed = buildTopArtistsEmbed({
        displayName,
        artists,
        page: pagination.page,
        totalPages,
        totalArtists,
        period,
        limit: pagination.limit,
        numberFormat: user.localization?.numberFormat
      });

      const sent = await message.channel.send({ embeds: [embed] });
      const components = buildTopArtistsComponents({
        page: pagination.page,
        totalPages,
        messageId: sent.id
      });
      if (components.length) {
        await sent.edit({ components });
      }

      if (!message.client.topArtistsStates) {
        message.client.topArtistsStates = new Map();
      }
      message.client.topArtistsStates.set(sent.id, {
        userId: message.author.id,
        lastFmUsername: user.lastFmUsername,
        period,
        page: pagination.page,
        limit: pagination.limit,
        totalPages,
        totalArtists,
        displayName,
        numberFormat: user.localization?.numberFormat,
        expiresAt: Date.now() + 30 * 60 * 1000
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
