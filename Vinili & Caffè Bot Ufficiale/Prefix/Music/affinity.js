const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { DEFAULT_EMBED_COLOR, lastFmRequest, buildUserUrl } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm, extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");

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

async function getTopArtists(username, period, limit) {
  const data = await lastFmRequest("user.gettopartists", {
    user: username,
    period,
    limit
  });
  const artists = data?.topartists?.artist || [];
  return artists.map(item => item.name).filter(Boolean);
}

async function getArtistTags(artist) {
  const key = artist.toLowerCase();
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

function buildAffinityLine(entry, guild) {
  const member = guild.members.cache.get(entry.discordId);
  const displayName = member?.displayName || member?.user?.username || "Sconosciuto";
  const profileUrl = entry.lastFmUsername ? buildUserUrl(entry.lastFmUsername) : null;
  const nameLabel = profileUrl ? `[${displayName}](${profileUrl})` : displayName;
  return `**${entry.score}%** â€” **${nameLabel}** â€” \`${entry.artists}%\` artists, \`${entry.genres}%\` genres, \`${entry.countries}%\` countries`;
}

module.exports = {
  skipPrefix: false,
  name: "affinity",
  aliases: ["n", "aff", "neighbors", "soulmates", "neighbours"],
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

    const pagination = extractPagination(args, { defaultLimit: 12, maxLimit: 30 });
    const { target, lastfm } = extractTargetUserWithLastfm(message, pagination.args);
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;

    const targetDisplay = message.guild?.members.cache.get(target.id)?.displayName || target.username;
    const targetName = targetDisplay;

    try {
      const [alltimeArtists, recentArtists] = await Promise.all([
        getTopArtists(user.lastFmUsername, "overall", 50),
        getTopArtists(user.lastFmUsername, "7day", 50)
      ]);
      const targetArtists = Array.from(new Set([...alltimeArtists, ...recentArtists]));
      if (!targetArtists.length) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("<:vegax:1443934876440068179> Non ho trovato artisti recenti per questo utente.")
          ]
        });
      }

      const targetTags = await mapWithConcurrency(targetArtists, 4, getArtistTags);
      const targetGenres = new Set();
      const targetCountries = new Set();
      targetTags.flat().forEach(tag => {
        if (COUNTRY_TAGS.has(tag)) {
          targetCountries.add(tag);
        } else {
          targetGenres.add(tag);
        }
      });

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

      const checks = await mapWithConcurrency(allUsers, 3, async doc => {
        const [alltime, recent] = await Promise.all([
          getTopArtists(doc.lastFmUsername, "overall", 50),
          getTopArtists(doc.lastFmUsername, "7day", 50)
        ]);
        const artists = new Set([...alltime, ...recent]);
        const overlap = targetArtists.filter(artist => artists.has(artist));
        const artistPercent = Math.round((overlap.length / targetArtists.length) * 100);
        const overlapTags = await mapWithConcurrency(overlap, 4, getArtistTags);
        const genres = new Set();
        const countries = new Set();
        overlapTags.flat().forEach(tag => {
          if (COUNTRY_TAGS.has(tag)) {
            countries.add(tag);
          } else {
            genres.add(tag);
          }
        });
        const genrePercent = targetGenres.size
          ? Math.round((genres.size / targetGenres.size) * 100)
          : 0;
        const countryPercent = targetCountries.size
          ? Math.round((countries.size / targetCountries.size) * 100)
          : 0;
        return {
          discordId: doc.discordId,
          lastFmUsername: doc.lastFmUsername,
          artists: artistPercent,
          genres: genrePercent,
          countries: countryPercent,
          score: Math.round((artistPercent + genrePercent + countryPercent) / 3)
        };
      });

      const fullResults = checks
        .filter(entry => entry.discordId !== target.id)
        .sort((a, b) => b.score - a.score);

      const totalPages = Math.max(1, Math.ceil(fullResults.length / pagination.limit));
      const page = Math.min(totalPages, Math.max(1, pagination.page));
      const start = (page - 1) * pagination.limit;
      const results = fullResults.slice(start, start + pagination.limit);
      if (!results.length) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("<:vegax:1443934876440068179> Nessun vicino musicale trovato.")
          ]
        });
      }

      const lines = results.map(entry => buildAffinityLine(entry, message.guild));
      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(`Server neighbors for ${targetName}`)
        .setDescription(lines.join("\n"))
        .setFooter({
          text: `Page ${page}/${totalPages} - ${allUsers.length} Vinili & CaffÃ¨ Bot members in this server`
        });

      return safeChannelSend(message.channel, { embeds: [embed] });
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante il calcolo dell'affinita.")
        ]
      });
    }
  }
};





