const { safeChannelSend } = require('../../Utils/Moderation/message');
const { AttachmentBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { lastFmRequest, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm, extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { getSpotifyTrackImageSmart } = require("../../Utils/Music/spotify");
const { buildTopTracksEmbed, buildTopTracksComponents } = require("../../Utils/Music/topTracksView");
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

function parseTopTracksPeriod(args) {
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

function isPeriodToken(token) {
  return Boolean(normalizePeriodToken(token));
}

function isPaginationToken(token) {
  return /^(page|p)[:=]\d+$/i.test(token) || /^(limit|l)[:=]\d+$/i.test(token);
}

function extractBillboardToken(args) {
  const rest = [];
  let billboard = false;
  for (const raw of args || []) {
    const token = String(raw || "").toLowerCase();
    if (token === "bb" || token === "billboard") {
      billboard = true;
      continue;
    }
    rest.push(raw);
  }
  return { billboard, rest };
}

function formatCompareLabel(fromTs, toTs) {
  const from = new Date(fromTs * 1000);
  const to = new Date(toTs * 1000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${fmt.format(from)} til ${fmt.format(to)}`;
}

async function getPreviousWeekRanks(username) {
  const now = Math.floor(Date.now() / 1000);
  const week = 7 * 24 * 60 * 60;
  const from = now - week * 2;
  const to = now - week;
  const data = await lastFmRequest("user.getweeklytrackchart", {
    user: username,
    from,
    to
  });
  const tracks = data?.weeklytrackchart?.track || [];
  const list = Array.isArray(tracks) ? tracks : [tracks];
  const ranks = new Map();
  list.forEach((track, index) => {
    const artist = track?.artist?.["#text"] || track?.artist?.name || track?.artist || "Sconosciuto";
    const name = track?.name || "Senza titolo";
    const key = `${artist}||${name}`.toLowerCase();
    ranks.set(key, index + 1);
  });
  return { ranks, compareLabel: formatCompareLabel(from, to) };
}

async function resolveUserOverride(candidate) {
  if (!candidate) return null;
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return LastFmUser.findOne({ lastFmUsername: new RegExp(`^${escaped}$`, "i") });
}

module.exports = {
  skipPrefix: false,
  name: "toptracks",
  aliases: ["tt"],
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
    const billboardInfo = extractBillboardToken(filteredArgs);
    const periodInfo = parseTopTracksPeriod(billboardInfo.rest);
    const period = periodInfo.period;
    const paginationArgs = periodInfo.rest;
    const pagination = extractPagination(paginationArgs, { defaultLimit: 10, maxLimit: 50 });
    const user = await getLastFmUserForMessageOrUsername(message, target, userOverride || lastfm);
    if (!user) return;
    const mode = modeInfo.mode || user.responseMode || "embed";

    try {
      const data = await lastFmRequest("user.gettoptracks", {
        user: user.lastFmUsername,
        period,
        limit: pagination.limit,
        page: pagination.page
      });
      const tracks = data?.toptracks?.track || [];
      if (!tracks.length) throw new Error("No tracks");

      const attr = data?.toptracks?.["@attr"] || {};
      const totalPages = Number(attr.totalPages || 1);
      const totalTracks = Number(attr.total || 0);
      const member = message.guild?.members.cache.get(target.id);
      const displayName = member?.displayName || member?.user?.username || target.username;

      if (mode === "image" && renderTopList) {
        let topTrack = tracks[0];
        if (pagination.page > 1) {
          try {
            const topData = await lastFmRequest("user.gettoptracks", {
              user: user.lastFmUsername,
              period,
              limit: 1,
              page: 1
            });
            const topList = topData?.toptracks?.track || [];
            topTrack = topList[0] || topTrack;
          } catch {
          }
        }
        const topArtist = topTrack?.artist?.name || topTrack?.artist?.["#text"] || topTrack?.artist || null;
        const topTrackName = topTrack?.name || null;
        const coverUrl = await getSpotifyTrackImageSmart(topArtist, topTrackName);
        const offset = (pagination.page - 1) * pagination.limit;
        const rows = tracks.map((track, index) => ({
          rank: offset + index + 1,
          label: track?.name || "Senza titolo",
          plays: formatNumber(track?.playcount || 0, user.localization?.numberFormat)
        }));
        const totalPlays = tracks.reduce((sum, item) => sum + Number(item?.playcount || 0), 0);
        const buffer = await renderTopList({
          title: "Top Tracks",
          displayName,
          periodLabel: `${formatPeriodLabel(period)} • Playcounts`,
          rows,
          footerLeft: `${formatNumber(totalTracks, user.localization?.numberFormat)} different tracks`,
          footerRight: `${formatNumber(totalPlays, user.localization?.numberFormat)} total plays`,
          coverUrl
        });
        if (buffer) {
          const attachment = new AttachmentBuilder(buffer, { name: "toptracks.png" });
          return safeChannelSend(message.channel, { files: [attachment] });
        }
      }

      let prevRanks = null;
      let compareLabel = null;
      if (billboardInfo.billboard) {
        try {
          const prev = await getPreviousWeekRanks(user.lastFmUsername);
          prevRanks = prev.ranks;
          compareLabel = prev.compareLabel;
        } catch {
          prevRanks = null;
          compareLabel = null;
        }
      }

      const embed = buildTopTracksEmbed({
        displayName,
        tracks,
        page: pagination.page,
        totalPages,
        totalTracks,
        period,
        limit: pagination.limit,
        numberFormat: user.localization?.numberFormat,
        billboard: billboardInfo.billboard,
        prevRanks,
        compareLabel
      });

      const sent = await safeChannelSend(message.channel, { embeds: [embed] });
      const components = buildTopTracksComponents({
        page: pagination.page,
        totalPages,
        messageId: sent.id
      });
      if (components.length) {
        await sent.edit({ components });
      }

      if (!message.client.topTracksStates) {
        message.client.topTracksStates = new Map();
      }
      message.client.topTracksStates.set(sent.id, {
        userId: message.author.id,
        lastFmUsername: user.lastFmUsername,
        period,
        page: pagination.page,
        limit: pagination.limit,
        totalPages,
        totalTracks,
        billboard: billboardInfo.billboard,
        prevRanks,
        compareLabel,
        displayName,
        numberFormat: user.localization?.numberFormat,
        expiresAt: Date.now() + 30 * 60 * 1000
      });
      return;
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        content: "<:vegax:1443934876440068179> Errore durante il recupero dei dati di Last.fm."
      });
    }
  }
};



