const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, lastFmRequest } = require("../../Utils/Music/lastfm");
const { getMusicBrainzArtistCountry } = require("../../Utils/Music/musicbrainz");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { buildYearEmbedPageOne, buildYearEmbedPageTwo, buildYearComponents } = require("../../Utils/Music/yearView");

const COUNTRY_TAGS = new Set([
  "afghanistan", "albania", "algeria", "andorra", "angola", "antigua", "argentina", "armenia",
  "australia", "austria", "azerbaijan", "bahamas", "bahrain", "bangladesh", "barbados", "belarus",
  "belgium", "belize", "benin", "bhutan", "bolivia", "bosnia", "botswana", "brazil", "brunei",
  "bulgaria", "burkina faso", "burundi", "cambodia", "cameroon", "canada", "chad", "chile", "china",
  "colombia", "comoros", "congo", "costa rica", "croatia", "cuba", "cyprus", "czechia", "denmark",
  "djibouti", "dominica", "ecuador", "egypt", "eritrea", "estonia", "eswatini", "ethiopia", "fiji",
  "finland", "france", "gabon", "gambia", "georgia", "germany", "ghana", "greece", "grenada",
  "guatemala", "guinea", "guyana", "haiti", "honduras", "hungary", "iceland", "india", "indonesia",
  "iran", "iraq", "ireland", "israel", "italy", "jamaica", "japan", "jordan", "kazakhstan", "kenya",
  "kiribati", "kosovo", "kuwait", "kyrgyzstan", "laos", "latvia", "lebanon", "lesotho", "liberia",
  "libya", "liechtenstein", "lithuania", "luxembourg", "madagascar", "malawi", "malaysia", "maldives",
  "mali", "malta", "mauritania", "mauritius", "mexico", "moldova", "monaco", "mongolia", "montenegro",
  "morocco", "mozambique", "myanmar", "namibia", "nauru", "nepal", "netherlands", "new zealand",
  "nicaragua", "niger", "nigeria", "north korea", "north macedonia", "norway", "oman", "pakistan",
  "palau", "panama", "paraguay", "peru", "philippines", "poland", "portugal", "qatar", "romania",
  "russia", "rwanda", "samoa", "san marino", "saudi arabia", "senegal", "serbia", "seychelles",
  "sierra leone", "singapore", "slovakia", "slovenia", "somalia", "south africa", "south korea",
  "spain", "sri lanka", "sudan", "suriname", "sweden", "switzerland", "syria", "taiwan", "tajikistan",
  "tanzania", "thailand", "tunisia", "turkey", "turkmenistan", "tuvalu", "uganda", "United Kingdom", "ukraine",
  "united arab emirates", "united kingdom", "united states", "uruguay", "usa", "uzbekistan", "vanuatu",
  "venezuela", "vietnam", "yemen", "zambia", "zimbabwe"
]);

const artistTagCache = new Map();

function parseYearArg(raw, now = new Date()) {
  const year = Number(String(raw || "").trim());
  if (Number.isFinite(year) && year >= 1900 && year <= now.getFullYear()) return year;
  return now.getFullYear() - 1;
}

function getYearRange(year) {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  return {
    startUnix: Math.floor(start.getTime() / 1000),
    endUnix: Math.floor(end.getTime() / 1000)
  };
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

async function getWeeklyRangesForYear(username, year) {
  const list = await lastFmRequest("user.getweeklychartlist", { user: username });
  const charts = list?.weeklychartlist?.chart || [];
  const ranges = Array.isArray(charts) ? charts : [charts];
  const { startUnix, endUnix } = getYearRange(year);
  return ranges
    .map(range => ({
      from: Number(range.from),
      to: Number(range.to)
    }))
    .filter(range => Number.isFinite(range.from) && Number.isFinite(range.to))
    .filter(range => range.to >= startUnix && range.from <= endUnix);
}

async function aggregateYearChart(username, year, type) {
  const ranges = await getWeeklyRangesForYear(username, year);
  const totals = new Map();
  const config = {
    artist: { method: "user.getweeklyartistchart", list: "weeklyartistchart", field: "artist" },
    album: { method: "user.getweeklyalbumchart", list: "weeklyalbumchart", field: "album" },
    track: { method: "user.getweeklytrackchart", list: "weeklytrackchart", field: "track" }
  }[type];

  await mapWithConcurrency(ranges, 3, async (range) => {
    const data = await lastFmRequest(config.method, {
      user: username,
      from: range.from,
      to: range.to
    });
    const list = data?.[config.list]?.[config.field] || [];
    const items = Array.isArray(list) ? list : [list];
    for (const item of items) {
      if (type === "artist") {
        const name = item?.name || "Unknown";
        const key = name.toLowerCase();
        const plays = Number(item?.playcount || 0);
        const entry = totals.get(key) || { name, playcount: 0, key };
        entry.playcount += plays;
        totals.set(key, entry);
      }
      if (type === "album") {
        const artist = item?.artist?.name || item?.artist?.["#text"] || item?.artist || "Unknown";
        const name = item?.name || "Unknown";
        const key = `${artist}||${name}`.toLowerCase();
        const plays = Number(item?.playcount || 0);
        const entry = totals.get(key) || { artist, name, playcount: 0, key };
        entry.playcount += plays;
        totals.set(key, entry);
      }
      if (type === "track") {
        const artist = item?.artist?.name || item?.artist?.["#text"] || item?.artist || "Unknown";
        const name = item?.name || "Unknown";
        const key = `${artist}||${name}`.toLowerCase();
        const plays = Number(item?.playcount || 0);
        const entry = totals.get(key) || { artist, name, playcount: 0, key };
        entry.playcount += plays;
        totals.set(key, entry);
      }
    }
  });

  return Array.from(totals.values()).sort((a, b) => b.playcount - a.playcount);
}

async function getArtistTags(artist) {
  const key = artist.toLowerCase();
  if (artistTagCache.has(key)) return artistTagCache.get(key);
  try {
    const data = await lastFmRequest("artist.gettoptags", { artist }, { timeoutMs: 4000 });
    const tags = data?.toptags?.tag || [];
    const names = tags.map(tag => String(tag.name || "").toLowerCase()).filter(Boolean);
    artistTagCache.set(key, names);
    return names;
  } catch {
    artistTagCache.set(key, []);
    return [];
  }
}

async function getTopGenres(artists, limit = 10) {
  const tagCounts = new Map();
  const slice = artists.slice(0, 25);
  await mapWithConcurrency(slice, 4, async (artist) => {
    const tags = await getArtistTags(artist.name);
    tags.slice(0, 5).forEach(tag => {
      const count = tagCounts.get(tag) || 0;
      tagCounts.set(tag, count + Number(artist.playcount || 0));
    });
  });
  return Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => ({ name, key: name }));
}

async function getTopCountries(artists, limit = 10) {
  const tagCounts = new Map();
  const slice = artists;
  await mapWithConcurrency(slice, 3, async (artist) => {
    const country = await getMusicBrainzArtistCountry(artist.name);
    if (country) {
      const key = country.toLowerCase();
      const count = tagCounts.get(key) || 0;
      tagCounts.set(key, count + Number(artist.playcount || 0));
      return;
    }
    const tags = await getArtistTags(artist.name);
    tags.forEach(tag => {
      if (!COUNTRY_TAGS.has(tag)) return;
      const count = tagCounts.get(tag) || 0;
      tagCounts.set(tag, count + Number(artist.playcount || 0));
    });
  });
  return Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), key: name }));
}
function buildRankMap(items) {
  const map = new Map();
  items.forEach((item, index) => {
    map.set(item.key, index + 1);
  });
  return map;
}

function buildRisesDrops(current, prevMap) {
  const changes = [];
  current.forEach((item, index) => {
    const currRank = index + 1;
    const prevRank = prevMap.get(item.key);
    if (!prevRank) return;
    const delta = prevRank - currRank;
    if (delta === 0) return;
    changes.push({ name: item.name, from: prevRank, to: currRank, delta });
  });
  const rises = changes.filter(c => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 4);
  const drops = changes.filter(c => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 2);
  return { rises, drops };
}

module.exports = {
  skipPrefix: false,
  name: "year",
  aliases: ["yr"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, args);
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;
    const member = message.guild?.members.cache.get(target.id);
    const displayName = member?.displayName || member?.user?.username || target.username;
    const year = parseYearArg(filteredArgs[0]);
    const prevYear = year - 1;
    try {
      const [artists, prevArtists, albums, prevAlbums, tracks, prevTracks] = await Promise.all([
        aggregateYearChart(user.lastFmUsername, year, "artist"),
        aggregateYearChart(user.lastFmUsername, prevYear, "artist"),
        aggregateYearChart(user.lastFmUsername, year, "album"),
        aggregateYearChart(user.lastFmUsername, prevYear, "album"),
        aggregateYearChart(user.lastFmUsername, year, "track"),
        aggregateYearChart(user.lastFmUsername, prevYear, "track")
      ]);

      const topArtists = artists.slice(0, 10).map((item) => ({ ...item, key: item.key }));
      const topAlbums = albums.slice(0, 8).map((item) => ({ ...item, key: item.key }));
      const topTracks = tracks.slice(0, 8).map((item) => ({ ...item, key: item.key }));

      const genreList = await getTopGenres(artists, 10);
      const prevGenreList = await getTopGenres(prevArtists, 10);
      const countryList = await getTopCountries(artists, 10);
      const prevCountryList = await getTopCountries(prevArtists, 10);

      const artistPrevRanks = buildRankMap(prevArtists.slice(0, 50));
      const albumPrevRanks = buildRankMap(prevAlbums.slice(0, 50));
      const trackPrevRanks = buildRankMap(prevTracks.slice(0, 50));
      const genrePrevRanks = buildRankMap(prevGenreList);
      const countryPrevRanks = buildRankMap(prevCountryList);

      const { rises, drops } = buildRisesDrops(artists.slice(0, 50), artistPrevRanks);

      const totalPages = 2;
      const page = 1;
      const embed = buildYearEmbedPageOne({
        displayName,
        year,
        prevYear,
        genres: genreList,
        genrePrevRanks,
        artists: topArtists,
        artistPrevRanks,
        rises,
        drops,
        numberFormat: user.localization?.numberFormat,
        page,
        totalPages
      });
      const components = buildYearComponents({ page, totalPages, messageId: "pending" });
      const sent = await safeChannelSend(message.channel, { embeds: [embed], components });

      const newComponents = buildYearComponents({ page, totalPages, messageId: sent.id });
      await sent.edit({ components: newComponents });

      if (!message.client.yearStates) message.client.yearStates = new Map();
      message.client.yearStates.set(sent.id, {
        userId: message.author.id,
        displayName,
        year,
        prevYear,
        genres: genreList,
        genrePrevRanks,
        artists: topArtists,
        artistPrevRanks,
        albums: topAlbums,
        albumPrevRanks,
        tracks: topTracks,
        trackPrevRanks,
        countries: countryList,
        countryPrevRanks,
        rises,
        drops,
        page,
        totalPages,
        numberFormat: user.localization?.numberFormat
      });
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setDescription("Errore durante il recap annuale.")
        ]
      });
    }
  }
};






