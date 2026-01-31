const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { DEFAULT_EMBED_COLOR, buildArtistUrl, lastFmRequest, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm } = require("../../Utils/Music/lastfmPrefix");
const { resolveArtistName } = require("../../Utils/Music/lastfmResolvers");
const { getSpotifyArtistMeta, getSpotifyArtistImageSmart } = require("../../Utils/Music/spotify");
const { getMusicBrainzArtistDetails, getMusicBrainzArtistLinks } = require("../../Utils/Music/musicbrainz");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");

function formatInline(value) {
  return `\`${value}\``;
}

function cleanSummary(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/Read more.*$/i, "")
    .trim();
}

function getSummaryLine(summary) {
  const cleaned = cleanSummary(summary);
  if (!cleaned) return null;
  const cut = cleaned.split(".")[0];
  return cut.length ? cut.trim() : cleaned;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getArtistPlaysFromWeeklyChart(chart, artistName) {
  const artists = chart?.weeklyartistchart?.artist || [];
  const list = Array.isArray(artists) ? artists : [artists];
  const target = normalizeName(artistName);
  const match = list.find(item => normalizeName(item?.name || item?.["#text"] || item?.artist || "") === target);
  return Number(match?.playcount || 0);
}

async function getArtistPlaysInRange(lastFmUsername, artistName, from, to) {
  const chart = await lastFmRequest("user.getweeklyartistchart", {
    user: lastFmUsername,
    from,
    to
  });
  return getArtistPlaysFromWeeklyChart(chart, artistName);
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

function formatItalianDate(input) {
  if (!input) return null;
  const parts = String(input).split("-");
  if (parts.length < 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return null;
  const months = [
    "gennaio",
    "febbraio",
    "marzo",
    "aprile",
    "maggio",
    "giugno",
    "luglio",
    "agosto",
    "settembre",
    "ottobre",
    "novembre",
    "dicembre"
  ];
  return `${day} ${months[month - 1]} ${year}`;
}

function formatBirthTimestamp(input) {
  if (!input) return null;
  const parts = String(input).split("-");
  if (parts.length < 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return null;
  const ts = Math.floor(Date.UTC(year, month - 1, day, 0, 0, 0) / 1000);
  return `<t:${ts}:D>`;
}

function getCountryAdjective(country) {
  const value = String(country || "").toLowerCase();
  if (value === "italy") return "Italian";
  return country ? country : null;
}

function toAreaDisplay(area) {
  if (!area) return null;
  if (String(area).toLowerCase() === "naples") return "Napoli";
  return area;
}

function buildGenrePhrase(tags, limit = 2) {
  const blocked = new Set([
    "seen live",
    "favorites",
    "favourites",
    "favorite",
    "favourite",
    "under 2000 listeners",
    "under 5000 listeners",
    "under 10000 listeners",
    "under 50000 listeners",
    "under 100000 listeners",
    "male vocalists",
    "female vocalists",
    "singer",
    "vocalist"
  ]);
  const cleaned = (tags || [])
    .map(tag => String(tag || "").toLowerCase())
    .filter(tag => tag && !blocked.has(tag));
  const picks = cleaned.slice(0, Math.max(0, limit));
  if (!picks.length) return null;
  return picks.join(", ");
}

async function getAppleMusicArtistLink(artistName) {
  if (!artistName) return null;
  try {
    const response = await axios.get("https://itunes.apple.com/search", {
      params: { term: artistName, entity: "musicArtist", limit: 5 }
    });
    const pick = response.data?.results?.[0];
    return pick?.artistLinkUrl || null;
  } catch {
    return null;
  }
}

function getInstagramLink(artist) {
  const links = artist?.bio?.links?.link;
  const list = Array.isArray(links) ? links : (links ? [links] : []);
  const instagram = list.find(item => String(item?.["#text"] || item?.href || "").includes("instagram.com"));
  if (instagram) {
    return instagram?.["#text"] || instagram?.href || null;
  }
  return null;
}

function getTwitterLink(artist) {
  const links = artist?.bio?.links?.link;
  const list = Array.isArray(links) ? links : (links ? [links] : []);
  const twitter = list.find(item => {
    const value = String(item?.["#text"] || item?.href || "");
    return value.includes("twitter.com") || value.includes("x.com");
  });
  if (twitter) {
    return twitter?.["#text"] || twitter?.href || null;
  }
  return null;
}

function normalizeInstagramProfileUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;
  const withProtocol = raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw.replace(/^\/\//, "")}`;
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.includes("instagram.com")) return null;
  const parts = (parsed.pathname || "/").split("/").filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0].toLowerCase();
  const blocked = new Set([
    "explore",
    "p",
    "reel",
    "reels",
    "tv",
    "stories",
    "s",
    "accounts",
    "developer",
    "about",
    "press",
    "privacy",
    "help",
    "hashtag",
    "tags",
    "tag",
    "locations",
    "location",
    "search"
  ]);
  if (blocked.has(first)) return null;
  return `https://www.instagram.com/${parts[0]}/`;
}

function chunkText(value, size = 1024) {
  const text = String(value || "");
  if (!text) return [];
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

function normalizeTwitterProfileUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;
  const withProtocol = raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw.replace(/^\/\//, "")}`;
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.includes("twitter.com") && !host.includes("x.com")) return null;
  const parts = (parsed.pathname || "/").split("/").filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0].toLowerCase();
  const blocked = new Set([
    "home",
    "search",
    "explore",
    "i",
    "intent",
    "share",
    "hashtag",
    "settings",
    "privacy",
    "tos",
    "login",
    "signup",
    "compose",
    "notifications",
    "messages"
  ]);
  if (blocked.has(first)) return null;
  return `https://twitter.com/${parts[0]}/`;
}

module.exports = {
  skipPrefix: false,
  name: "artist",
  aliases: ["a"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, args);
    const noredirect = filteredArgs.includes("noredirect");
    const artistQuery = filteredArgs.filter(arg => arg.toLowerCase() !== "noredirect").join(" ").trim();
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;

    try {
      const artistName = await resolveArtistName(user.lastFmUsername, artistQuery || null);
      if (!artistName) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("<:vegax:1443934876440068179> Non riesco a trovare un artista valido.")
          ]
        });
      }

      const data = await lastFmRequest("artist.getinfo", {
        artist: artistName,
        username: user.lastFmUsername,
        autocorrect: noredirect ? 0 : 1
      });
      const artist = data?.artist;
      if (!artist) throw new Error("Artist not found");

      const [details, mbLinks] = await Promise.all([
        getMusicBrainzArtistDetails(artist.name || artistName),
        getMusicBrainzArtistLinks(artist.name || artistName)
      ]);
      const summaryLine = getSummaryLine(artist?.bio?.summary);
      const summaryFull = cleanSummary(artist?.bio?.summary);
      const tags = Array.isArray(artist?.tags?.tag) ? artist.tags.tag : (artist?.tags?.tag ? [artist.tags.tag] : []);
      const tagNames = tags.map(tag => tag?.name).filter(Boolean);
      const genrePhrase = buildGenrePhrase(tagNames, 2);
      const typeLabel = details?.type ? details.type.charAt(0).toUpperCase() + details.type.slice(1) : "Artist";
      let originLine = null;
      const area = toAreaDisplay(details?.area || details?.country);
      const adj = getCountryAdjective(details?.country);
      const typeLower = typeLabel.toLowerCase();
      if (area && adj && genrePhrase) originLine = `${adj} ${genrePhrase} ${typeLower} from ${area}`;
      else if (adj && genrePhrase) originLine = `${adj} ${genrePhrase} ${typeLower}`;
      else if (area && adj) originLine = `${adj} ${typeLower} from ${area}`;
      else if (adj) originLine = `${adj} ${typeLower}`;
      const genderLabel = details?.gender ? details.gender : null;
      const typeGenderLine = genderLabel ? `${typeLabel} - ${genderLabel}` : typeLabel;
      const bornLine = details?.begin
        ? `Born: ${formatBirthTimestamp(details.begin) || formatItalianDate(details.begin) || details.begin}`
        : null;

      const descriptionLines = [originLine, typeGenderLine, bornLine].filter(Boolean);

      const listeners = Number(artist.stats?.listeners || artist.stats?.listeners || 0);
      const playcount = Number(artist.stats?.playcount || 0);
      const playsByYou = Number(artist.stats?.userplaycount || 0);

      const now = Math.floor(Date.now() / 1000);
      const lastWeekFrom = now - 7 * 24 * 60 * 60;
      const playsLastWeek = await getArtistPlaysInRange(user.lastFmUsername, artist.name, lastWeekFrom, now);

      let serverListeners = 0;
      let serverPlays = 0;
      let serverPlaysLastWeek = 0;
      if (message.guild) {
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
        if (allUsers.length) {
          const results = await mapWithConcurrency(allUsers, 3, async doc => {
            try {
              const info = await lastFmRequest("artist.getinfo", {
                artist: artist.name,
                username: doc.lastFmUsername,
                autocorrect: 1
              });
              const plays = Number(info?.artist?.stats?.userplaycount || 0);
              let weekPlays = 0;
              try {
                weekPlays = await getArtistPlaysInRange(doc.lastFmUsername, artist.name, lastWeekFrom, now);
              } catch {
                weekPlays = 0;
              }
              return { plays, weekPlays };
            } catch {
              return { plays: 0, weekPlays: 0 };
            }
          });
          results.forEach(item => {
            if (item.plays > 0) serverListeners += 1;
            serverPlays += item.plays;
            serverPlaysLastWeek += item.weekPlays;
          });
        }
      }
      const serverAvg = serverListeners ? Math.round(serverPlays / serverListeners) : 0;

      const serverLines = [
        `${formatInline(formatNumber(serverListeners))} listener${serverListeners === 1 ? "" : "s"}`,
        `${formatInline(formatNumber(serverPlays))} total plays`,
        `${formatInline(formatNumber(serverAvg))} avg plays`,
        `${formatInline(formatNumber(serverPlaysLastWeek))} plays last week`
      ];

      const lastfmLines = [
        `${formatInline(formatNumber(listeners))} listeners`,
        `${formatInline(formatNumber(playcount))} global plays`,
        `${formatInline(formatNumber(playsByYou))} plays by you`,
        `${formatInline(formatNumber(playsLastWeek))} by you last week`
      ];

      let image = artist?.image?.find(img => img.size === "extralarge")?.["#text"]
        || artist?.image?.find(img => img.size === "large")?.["#text"]
        || null;
      let imageSource = image ? "Last.fm" : null;

      const spotifyMeta = await getSpotifyArtistMeta(artist.name || artistName);
      if (!image && spotifyMeta?.image) {
        image = spotifyMeta.image;
        imageSource = "Spotify";
      }
      if (!image) {
        image = await getSpotifyArtistImageSmart(artist.name || artistName);
        if (image) imageSource = "Spotify";
      }

      const spotifyUrl = mbLinks?.spotify
        || spotifyMeta?.url
        || `https://open.spotify.com/search/${encodeURIComponent(artist.name || artistName)}`;
      const appleUrl = await getAppleMusicArtistLink(artist.name || artistName)
        || mbLinks?.appleMusic
        || `https://music.apple.com/search?term=${encodeURIComponent(artist.name || artistName)}`;
      const instagramUrl = normalizeInstagramProfileUrl(mbLinks?.instagram)
        || normalizeInstagramProfileUrl(getInstagramLink(artist));
      const twitterUrl = normalizeTwitterProfileUrl(mbLinks?.twitter)
        || normalizeTwitterProfileUrl(getTwitterLink(artist));

      let percentLine = null;
      try {
        const userInfo = await lastFmRequest("user.getinfo", { user: user.lastFmUsername });
        const totalPlays = Number(userInfo?.user?.playcount || 0);
        if (totalPlays > 0 && playsByYou > 0) {
          const percent = (playsByYou / totalPlays) * 100;
          percentLine = `${percent.toFixed(2)}% of all your plays are on this artist`;
        }
      } catch {
        percentLine = null;
      }

      const tagNamesForLine = tagNames.slice(0, 6);
      const tagLine = tagNamesForLine.length ? tagNamesForLine.join(" - ") : "Nessun tag";

      const featuredCount = serverListeners || 0;
      const extraLines = [
        featuredCount > 0 ? `Featured ${featuredCount} time${featuredCount === 1 ? "" : "s"}` : null,
        imageSource ? `Image source: ${imageSource}` : null,
        percentLine || null,
        tagLine && tagLine !== "Nessun tag" ? tagLine : null
      ].filter(Boolean);

      const displayName = message.guild?.members.cache.get(target.id)?.displayName
        || target.username
        || user.lastFmUsername;

      const summaryText = summaryFull || summaryLine || "No summary";
      const summaryChunks = chunkText(summaryText, 1024);
      const summaryFields = summaryChunks.length
        ? [
            { name: "Summary", value: summaryChunks[0], inline: false },
            ...summaryChunks.slice(1).map(chunk => ({ name: "\u200b", value: chunk, inline: false }))
          ]
        : [{ name: "Summary", value: "No summary", inline: false }];

      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(`Artist: ${artist.name} for ${displayName}`)
        .setURL(buildArtistUrl(artist.name))
        .setDescription(descriptionLines.join("\n"))
        .addFields(
          { name: "Server stats", value: serverLines.join("\n"), inline: true },
          { name: "Last.fm stats", value: lastfmLines.join("\n"), inline: true },
          ...summaryFields
        )


      if (image) embed.setThumbnail(image);

      if (extraLines.length) {
        embed.setFooter({ text: extraLines.join("\n") });
      }

      const sent = await message.channel.send({ embeds: [embed] });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`lfm_artist_overview:${sent.id}`)
          .setLabel("Overview")
          .setEmoji("\uD83D\uDCCA")
          .setStyle(ButtonStyle.Secondary)
      );
      if (spotifyUrl) {
        row.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setEmoji({ id: "1462941253803970571" })
            .setURL(spotifyUrl)
        );
      }
      if (appleUrl && !appleUrl.includes("/search")) {
        row.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setEmoji({ id: "1466061111781752872" })
            .setURL(appleUrl)
        );
      }
      if (instagramUrl) {
        row.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setEmoji({ id: "1466061195613044820" })
            .setURL(instagramUrl)
        );
      }
      if (twitterUrl) {
        row.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setEmoji({ id: "1466201838343819274" })
            .setURL(twitterUrl)
        );
      }

      await sent.edit({ components: [row] });

      if (!message.client.artistStates) message.client.artistStates = new Map();
      message.client.artistStates.set(sent.id, {
        userId: message.author.id,
        artistName: artist.name,
        lastFmUsername: user.lastFmUsername,
        displayName,
        totalPlays: playsByYou,
        instagramUrl,
        twitterUrl,
        mainEmbed: embed.toJSON(),
        expiresAt: Date.now() + 10 * 60 * 1000
      });

      return;
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante il recupero dell'artista.")
        ]
      });
    }
  }
};







