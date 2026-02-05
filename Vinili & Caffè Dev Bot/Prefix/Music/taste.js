const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, lastFmRequest } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { buildTasteEmbed, buildTasteComponents, formatPeriodLabel } = require("../../Utils/Music/tasteView");

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
  "tanzania", "thailand", "tunisia", "turkey", "turkmenistan", "tuvalu", "uganda", "uk", "ukraine",
  "united arab emirates", "united kingdom", "united states", "uruguay", "usa", "uzbekistan", "vanuatu",
  "venezuela", "vietnam", "yemen", "zambia", "zimbabwe"
]);

const artistTagCache = new Map();

function normalizeName(value) {
  return String(value || "").toLowerCase().trim();
}

function parsePeriodToken(token) {
  const t = String(token || "").toLowerCase();
  const map = new Map([
    ["weekly", "7day"],
    ["week", "7day"],
    ["monthly", "1month"],
    ["month", "1month"],
    ["quarterly", "3month"],
    ["quarter", "3month"],
    ["half", "6month"],
    ["halfyear", "6month"],
    ["yearly", "12month"],
    ["year", "12month"],
    ["alltime", "overall"],
    ["overall", "overall"]
  ]);
  return map.get(t) || null;
}

function parseTasteArgs(args) {
  const rest = [];
  let period = "overall";
  let mode = "table";
  let size = "normal";
  for (const raw of args || []) {
    const token = String(raw || "").toLowerCase();
    const periodValue = parsePeriodToken(token);
    if (periodValue) {
      period = periodValue;
      continue;
    }
    if (token === "table" || token === "embed") {
      mode = token;
      continue;
    }
    if (["xl", "extralarge"].includes(token)) {
      size = "xl";
      continue;
    }
    if (["xs", "extrasmall"].includes(token)) {
      size = "xs";
      continue;
    }
    rest.push(raw);
  }
  return { period, mode, size, rest };
}

function sizeToPerPage(size) {
  if (size === "xl") return 25;
  if (size === "xs") return 8;
  return 15;
}

async function getTopArtistsWithPlays(username, period, limit = 200) {
  const data = await lastFmRequest("user.gettopartists", { user: username, period, limit });
  const list = data?.topartists?.artist || [];
  return list.map(item => ({
    name: item?.name || "",
    playcount: Number(item?.playcount || 0)
  })).filter(item => item.name);
}

async function getArtistTags(artist) {
  const key = normalizeName(artist);
  if (artistTagCache.has(key)) return artistTagCache.get(key);
  try {
    const data = await lastFmRequest("artist.gettoptags", { artist });
    const tags = data?.toptags?.tag || [];
    const names = tags
      .map(tag => String(tag.name || "").toLowerCase())
      .filter(Boolean);
    artistTagCache.set(key, names);
    return names;
  } catch {
    artistTagCache.set(key, []);
    return [];
  }
}

function buildOverlapRows(mapA, mapB) {
  const rows = [];
  for (const [key, a] of mapA.entries()) {
    if (!mapB.has(key)) continue;
    const b = mapB.get(key);
    rows.push({ name: a.name, a: a.count, b: b.count });
  }
  rows.sort((x, y) => (y.a + y.b) - (x.a + x.b));
  return rows;
}

function slicePage(items, page, perPage) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * perPage;
  return { slice: items.slice(start, start + perPage), page: safePage, totalPages };
}

function buildInstructionEmbed() {
  return new EmbedBuilder()
    .setColor(0xF39C12)
    .setDescription("Please enter a Last.fm username or mention someone to compare yourself to.\nExamples:\nâ€¢ `.taste Vinili&CaffèBot`\nâ€¢ `.taste @Vinili&CaffèBot`\n\nPlease note that the other user must also have an Vinili & Caffè Bot account.");
}

module.exports = {
  skipPrefix: false,
  name: "taste",
  aliases: ["t"],
  async execute(message, args) {
    await message.channel.sendTyping();

    const parsed = parseTasteArgs(args);
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, parsed.rest);

    let compareUsername = lastfm;
    let compareUser = target;
    if (!compareUsername && (!parsed.rest || parsed.rest.length === 0)) {
      return safeChannelSend(message.channel, { embeds: [buildInstructionEmbed()] });
    }
    if (!compareUsername && parsed.rest.length) {
      compareUsername = parsed.rest.join(" ");
    }

    const baseUser = await getLastFmUserForMessageOrUsername(message, message.author, null);
    if (!baseUser) return;

    const compareDoc = await getLastFmUserForMessageOrUsername(message, compareUser, compareUsername);
    if (!compareDoc) {
      return safeChannelSend(message.channel, { embeds: [buildInstructionEmbed()] });
    }

    const baseMember = message.guild?.members.cache.get(message.author.id);
    const baseName = basemember?.displayName || member?.user?.username || message.author.username;
    const compareMember = message.guild?.members.cache.get(compareUser.id);
    const compareName = compareUsername || comparemember?.displayName || member?.user?.username || compareUser.username;

    try {
      const period = parsed.period;
      const perPage = sizeToPerPage(parsed.size);

      const [baseArtists, otherArtists] = await Promise.all([
        getTopArtistsWithPlays(baseUser.lastFmUsername, period, 200),
        getTopArtistsWithPlays(compareDoc.lastFmUsername, period, 200)
      ]);

      const baseArtistMap = new Map(baseArtists.map(item => [normalizeName(item.name), { name: item.name, count: item.playcount }]));
      const otherArtistMap = new Map(otherArtists.map(item => [normalizeName(item.name), { name: item.name, count: item.playcount }]));

      const artistRows = buildOverlapRows(baseArtistMap, otherArtistMap);
      const artistMatch = {
        count: artistRows.length,
        total: baseArtists.length
      };

      const tagSources = baseArtists.slice(0, 50).map(item => item.name);
      const otherTagSources = otherArtists.slice(0, 50).map(item => item.name);

      const [baseTags, otherTags] = await Promise.all([
        Promise.all(tagSources.map(getArtistTags)),
        Promise.all(otherTagSources.map(getArtistTags))
      ]);

      function buildTagMap(tagsList, filter) {
        const map = new Map();
        tagsList.flat().forEach(tag => {
          const isCountry = COUNTRY_TAGS.has(tag);
          if (filter === "countries" && !isCountry) return;
          if (filter === "genres" && isCountry) return;
          map.set(tag, (map.get(tag) || 0) + 1);
        });
        return new Map(Array.from(map.entries()).map(([key, count]) => [key, { name: key, count }]));
      }

      const baseGenres = buildTagMap(baseTags, "genres");
      const otherGenres = buildTagMap(otherTags, "genres");
      const baseCountries = buildTagMap(baseTags, "countries");
      const otherCountries = buildTagMap(otherTags, "countries");

      const genreRows = buildOverlapRows(baseGenres, otherGenres);
      const countryRows = buildOverlapRows(baseCountries, otherCountries);

      const state = {
        userId: message.author.id,
        baseName,
        compareName,
        period,
        mode: parsed.mode,
        perPage,
        category: "artists",
        rows: {
          artists: artistRows,
          genres: genreRows,
          countries: countryRows
        },
        match: {
          artists: artistMatch,
          genres: { count: genreRows.length, total: baseGenres.size },
          countries: { count: countryRows.length, total: baseCountries.size }
        },
        numberFormat: baseUser.localization?.numberFormat,
        expiresAt: Date.now() + 30 * 60 * 1000
      };

      const pageData = slicePage(state.rows.artists, 1, perPage);
      const matchLine = `${artistMatch.count} (${artistMatch.total ? ((artistMatch.count / artistMatch.total) * 100).toFixed(1) : "0"}%) out of top ${artistMatch.total} ${formatPeriodLabel(period)}`;
      const embed = buildTasteEmbed({
        title: `Top artist comparison - ${baseName} vs ${compareName}`,
        rows: pageData.slice,
        userA: baseName,
        userB: compareName,
        matchLine,
        page: pageData.page,
        totalPages: pageData.totalPages,
        period,
        category: "artists",
        numberFormat: state.numberFormat,
        mode: parsed.mode
      });

      const sent = await safeChannelSend(message.channel, { embeds: [embed] });
      const components = buildTasteComponents({
        messageId: sent.id,
        page: pageData.page,
        totalPages: pageData.totalPages,
        category: "artists"
      });
      await sent.edit({ components });

      if (!message.client.tasteStates) message.client.tasteStates = new Map();
      state.page = pageData.page;
      state.totalPages = pageData.totalPages;
      message.client.tasteStates.set(sent.id, state);
      return;
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Errore durante il confronto del gusto.")
        ]
      });
    }
  }
};


