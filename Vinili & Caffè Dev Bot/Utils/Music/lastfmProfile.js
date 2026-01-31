const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { lastFmRequest, buildUserUrl, DEFAULT_EMBED_COLOR, formatNumber } = require("./lastfm");
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
const AVERAGE_TRACK_SECONDS = 195;

function formatRegisteredDate(registered) {
  if (!registered) return "Unknown";
  const timestamp = Number(registered);
  const date = Number.isNaN(timestamp)
    ? new Date(registered)
    : new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}
function formatListeningTime(plays) {
  const totalSeconds = Math.max(0, Math.floor(plays * AVERAGE_TRACK_SECONDS));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  if (days > 0) {
    return `${days} day${days === 1 ? "" : "s"}, ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
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
function buildMonthKeys(count) {
  const now = new Date();
  const months = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    months.push({
      key,
      label: MONTH_NAMES[date.getMonth()]
    });
  }
  return months;
}
async function getMonthlyPlays(lastFmUsername, monthsToShow) {
  const months = buildMonthKeys(monthsToShow);
  const oldest = new Date();
  oldest.setMonth(oldest.getMonth() - (monthsToShow - 1), 1);
  oldest.setHours(0, 0, 0, 0);
  const cutoffUnix = Math.floor(oldest.getTime() / 1000);
  const list = await lastFmRequest("user.getweeklychartlist", {
    user: lastFmUsername
  });
  const charts = list?.weeklychartlist?.chart || [];
  const ranges = Array.isArray(charts) ? charts : [charts];
  const filtered = ranges
    .map(range => ({
      from: Number(range.from),
      to: Number(range.to)
    }))
    .filter(range => Number.isFinite(range.from) && Number.isFinite(range.to))
    .filter(range => range.to >= cutoffUnix);
  const monthTotals = new Map();
  months.forEach(month => monthTotals.set(month.key, 0));
  await mapWithConcurrency(filtered, 3, async range => {
    const chart = await lastFmRequest("user.getweeklytrackchart", {
      user: lastFmUsername,
      from: range.from,
      to: range.to
    });
    const tracks = chart?.weeklytrackchart?.track || [];
    const trackList = Array.isArray(tracks) ? tracks : [tracks];
    const plays = trackList.reduce((sum, track) => sum + Number(track.playcount || 0), 0);
    const weekDate = new Date(range.to * 1000);
    const key = `${weekDate.getFullYear()}-${weekDate.getMonth()}`;
    if (monthTotals.has(key)) {
      monthTotals.set(key, monthTotals.get(key) + plays);
    }
  });
  return months.map(month => ({
    label: month.label,
    plays: monthTotals.get(month.key) || 0,
    time: formatListeningTime(monthTotals.get(month.key) || 0)
  }));
}
function buildProfileButtons(lastFmUsername) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Profile")
      .setStyle(ButtonStyle.Link)
      .setURL(buildUserUrl(lastFmUsername)),
    new ButtonBuilder()
      .setLabel("Last.fm")
      .setStyle(ButtonStyle.Link)
      .setURL("https://www.last.fm")
  );
  return [row];
}
async function buildProfilePayload({ lastFmUsername, displayName, numberFormat }) {
  const data = await lastFmRequest("user.getinfo", { user: lastFmUsername });
  const info = data?.user;
  if (!info) {
    return {
      error: "<:vegax:1443934876440068179> Impossibile recuperare le informazioni dell'utente."
    };
  }
  const profileName = displayName || info.name || lastFmUsername;
  const playcount = formatNumber(info.playcount, numberFormat);
  const sinceText = formatRegisteredDate(info.registered?.unixtime || info.registered?.["#text"]);
  const months = await getMonthlyPlays(lastFmUsername, 6);
  const monthLines = months.length
    ? months.map(month => (
      `${month.label} - ${formatNumber(month.plays, numberFormat)} plays - ${month.time}`
    )).join("\n")
    : "No data";
  const description = [
    `**[${profileName}]**`,
    `(${buildUserUrl(lastFmUsername)})'s history`,
    "",
    `${playcount} scrobbles`,
    `Since ${sinceText}`,
    "",
    "**Last months**",
    monthLines
  ].join("\n");
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setDescription(description)
    .setThumbnail(info.image?.find(img => img.size === "large")?.["#text"] || null);
  return {
    embed,
    components: buildProfileButtons(lastFmUsername)
  };
}

module.exports = { buildProfilePayload };