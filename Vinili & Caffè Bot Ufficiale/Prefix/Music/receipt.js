const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { lastFmRequest } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { renderReceipt } = require("../../Utils/Render/receiptCanvas");

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
];

const MONTHS_IT = {
  gennaio: 0,
  febbraio: 1,
  marzo: 2,
  aprile: 3,
  maggio: 4,
  giugno: 5,
  luglio: 6,
  agosto: 7,
  settembre: 8,
  ottobre: 9,
  novembre: 10,
  dicembre: 11
};

function getPreviousMonthDate(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

function getMonthLabel(date) {
  const month = date.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
  const year = date.getFullYear();
  return `${month} ${year}`;
}

function getMonthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  return {
    startUnix: Math.floor(start.getTime() / 1000),
    endUnix: Math.floor(end.getTime() / 1000)
  };
}

function parseMonthArg(rawMonth, rawYear, now = new Date()) {
  if (!rawMonth) return { date: getPreviousMonthDate(now), label: null };
  const normalized = String(rawMonth).trim().toLowerCase();
  if (!normalized) return { date: getPreviousMonthDate(now), label: null };
  const yearFromArg = String(rawYear || "").trim();
  const yearMatchInline = normalized.match(/\b(19|20)\d{2}\b/);
  const parsedYear = Number((yearMatchInline && yearMatchInline[0]) || yearFromArg);
  const hasExplicitYear = Number.isFinite(parsedYear) && parsedYear >= 1900;
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const numberMatch = normalized.match(/^\d{1,2}$/);
  if (numberMatch) {
    const monthIndex = Number(numberMatch[0]) - 1;
    if (monthIndex >= 0 && monthIndex <= 11) {
      const year = hasExplicitYear ? parsedYear : (monthIndex > currentMonth ? currentYear - 1 : currentYear);
      return { date: new Date(year, monthIndex, 1), label: null };
    }
  }
  if (MONTHS_IT[normalized] !== undefined) {
    const monthIndex = MONTHS_IT[normalized];
    const year = hasExplicitYear ? parsedYear : (monthIndex > currentMonth ? currentYear - 1 : currentYear);
    return { date: new Date(year, MONTHS_IT[normalized], 1), label: null };
  }
  const englishIndex = MONTHS.indexOf(normalized);
  if (englishIndex !== -1) {
    const year = hasExplicitYear ? parsedYear : (englishIndex > currentMonth ? currentYear - 1 : currentYear);
    return { date: new Date(year, englishIndex, 1), label: null };
  }
  const label = normalized.toUpperCase();
  return { date: null, label };
}

async function getMonthlyTopTracks(lastFmUsername, monthDate, limit = 10) {
  const list = await lastFmRequest("user.getweeklychartlist", {
    user: lastFmUsername
  });
  const charts = list?.weeklychartlist?.chart || [];
  const ranges = Array.isArray(charts) ? charts : [charts];
  const { startUnix, endUnix } = getMonthRange(monthDate);
  const relevant = ranges
    .map(range => ({
      from: Number(range.from),
      to: Number(range.to)
    }))
    .filter(range => Number.isFinite(range.from) && Number.isFinite(range.to))
    .filter(range => range.to >= startUnix && range.from <= endUnix);

  const totals = new Map();
  for (const range of relevant) {
    const chart = await lastFmRequest("user.getweeklytrackchart", {
      user: lastFmUsername,
      from: range.from,
      to: range.to
    });
    const tracks = chart?.weeklytrackchart?.track || [];
    const listTracks = Array.isArray(tracks) ? tracks : [tracks];
    for (const track of listTracks) {
      const artist = track?.artist?.name || track?.artist?.["#text"] || track?.artist || "Unknown";
      const name = track?.name || "Unknown";
      const key = `${artist}||${name}`.toLowerCase();
      const plays = Number(track?.playcount || 0);
      if (!totals.has(key)) {
        totals.set(key, { name, artist: { name: artist }, playcount: plays });
      } else {
        totals.get(key).playcount += plays;
      }
    }
  }
  const result = Array.from(totals.values()).sort((a, b) => b.playcount - a.playcount);
  const totalPlays = result.reduce((sum, track) => sum + Number(track.playcount || 0), 0);
  return { tracks: result.slice(0, limit), totalPlays };
}

function buildNoTracksEmbed(displayName, monthLabel) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`Top ${monthLabel} tracks for ${displayName}`)
    .setDescription("Sorry, you or the user you're searching for don't have any top tracks in the selected time period.");
}

module.exports = {
  skipPrefix: false,
  name: "receipt",
  aliases: ["rcpt"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, args);
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;
    const member = message.guild?.members.cache.get(target.id);
    const displayName = member?.displayName || target.username;
    try {
      const now = new Date();
      const monthArg = filteredArgs?.[0] || "";
      const yearArg = filteredArgs?.[1] || "";
      const parsed = parseMonthArg(monthArg, yearArg, now);
      if (!parsed.date) {
        const label = parsed.label || monthArg || "selected period";
        const embed = buildNoTracksEmbed(displayName, label);
        return message.channel.send({ embeds: [embed] });
      }

      const monthLabel = getMonthLabel(parsed.date);
      const monthly = await getMonthlyTopTracks(user.lastFmUsername, parsed.date, 10);
      const tracks = monthly.tracks || [];
      if (!tracks.length) {
        const embed = buildNoTracksEmbed(displayName, monthLabel);
        return message.channel.send({ embeds: [embed] });
      }
      const totalPlays = Number(monthly.totalPlays || 0);
      const subtotalPlays = tracks.reduce((sum, track) => sum + Number(track.playcount || 0), 0);
      const buffer = renderReceipt({
        displayName,
        monthLabel,
        tracks,
        subtotalPlays,
        totalPlays,
        orderDate: now,
        cardYear: parsed.date.getFullYear()
      });
      const attachment = new AttachmentBuilder(buffer, { name: "receipt.png" });
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(`**Top ${monthLabel} tracks for ${displayName}**`);
      await message.channel.send({ files: [attachment], embeds: [embed] });
      return;
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        content: "<:vegax:1443934876440068179> Errore durante la generazione della receipt."
      });
    }
  }
};


