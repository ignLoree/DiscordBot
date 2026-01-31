const { lastFmRequest } = require("./lastfm");

async function getRecentTracks(username, limit = 200) {
  const data = await lastFmRequest("user.getrecenttracks", {
    user: username,
    limit
  });
  const tracks = data?.recenttracks?.track || [];
  return Array.isArray(tracks) ? tracks : [tracks];
}
function getTrackDate(track) {
  const uts = track?.date?.uts || track?.date?.["#text"];
  if (!uts) return null;
  const ts = Number(uts) * 1000;
  if (Number.isNaN(ts)) return null;
  return new Date(ts);
}
function toDayKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function buildDaySeries(days) {
  const series = [];
  const now = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    series.push(toDayKey(d));
  }
  return series;
}
function groupTracksByDay(tracks) {
  const map = new Map();
  for (const track of tracks) {
    const date = getTrackDate(track);
    if (!date) continue;
    const key = toDayKey(date);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}
function sumTopTracksPlaycount(tracks) {
  return tracks.reduce((sum, item) => sum + Number(item.playcount || 0), 0);
}
function calculateAverageDailyPlays(tracks) {
  const dated = tracks
    .map(track => getTrackDate(track))
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (dated.length < 2) return 0;
  const min = dated[0].getTime();
  const max = dated[dated.length - 1].getTime();
  const days = Math.max(1, Math.round((max - min) / (1000 * 60 * 60 * 24)));
  return Math.round(dated.length / days);
}
async function getTopTracks(username, period, limit = 200) {
  const data = await lastFmRequest("user.gettoptracks", {
    user: username,
    period,
    limit
  });
  const tracks = data?.toptracks?.track || [];
  return Array.isArray(tracks) ? tracks : [tracks];
}

module.exports = { getRecentTracks, getTrackDate, toDayKey, buildDaySeries, groupTracksByDay, sumTopTracksPlaycount, calculateAverageDailyPlays, getTopTracks };