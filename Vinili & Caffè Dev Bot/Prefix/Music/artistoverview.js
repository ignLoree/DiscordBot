const { safeChannelSend } = require('../../Utils/Moderation/message');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, buildArtistUrl, lastFmRequest, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm } = require("../../Utils/Music/lastfmPrefix");
const { resolveArtistName } = require("../../Utils/Music/lastfmResolvers");
const { handleLastfmError, sendArtistNotFound } = require("../../Utils/Music/lastfmError");

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

async function getUserTopTracksForArtist(lastFmUsername, artistName, limit = 200) {
  const data = await lastFmRequest("user.gettoptracks", {
    user: lastFmUsername,
    period: "overall",
    limit
  });
  const tracks = data?.toptracks?.track || [];
  const list = Array.isArray(tracks) ? tracks : [tracks];
  const target = normalizeName(artistName);
  return list
    .filter(item => normalizeName(item?.artist?.name || item?.artist || "") === target)
    .map(item => ({ name: item?.name || "", plays: Number(item?.playcount || 0) }))
    .sort((a, b) => b.plays - a.plays);
}

async function getUserTopAlbumsForArtist(lastFmUsername, artistName, limit = 200) {
  const data = await lastFmRequest("user.gettopalbums", {
    user: lastFmUsername,
    period: "overall",
    limit
  });
  const albums = data?.topalbums?.album || [];
  const list = Array.isArray(albums) ? albums : [albums];
  const target = normalizeName(artistName);
  return list
    .filter(item => normalizeName(item?.artist?.name || item?.artist || "") === target)
    .map(item => ({ name: item?.name || "", plays: Number(item?.playcount || 0) }))
    .sort((a, b) => b.plays - a.plays);
}


async function buildSimpleArtistEmbed({ artistName, lastFmUsername, displayName }) {
  const data = await lastFmRequest("artist.getinfo", {
    artist: artistName,
    username: lastFmUsername,
    autocorrect: 1
  });
  const artist = data?.artist;
  if (!artist) throw new Error("Artist not found");
  const tags = Array.isArray(artist?.tags?.tag) ? artist.tags.tag : (artist?.tags?.tag ? [artist.tags.tag] : []);
  const tagNames = tags.map(tag => tag?.name).filter(Boolean).slice(0, 6);
  const tagLine = tagNames.length ? tagNames.join(" - ") : "Nessun tag";
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Artist: ${artist.name} for ${displayName}`)
    .setURL(buildArtistUrl(artist.name))
    .addFields(
      { name: "Plays by you", value: formatNumber(artist.stats?.userplaycount || 0), inline: true },
      { name: "Listeners", value: formatNumber(artist.stats?.listeners || 0), inline: true },
      { name: "Global plays", value: formatNumber(artist.stats?.playcount || 0), inline: true },
      { name: "Tags", value: tagLine }
    );
  return embed;
}
function buildArtistOverviewButtons(messageId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_artist_back:${messageId}`)
      .setLabel("Artist")
      .setEmoji({ id: "1466070288554004604" })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`lfm_artist_toptracks:${messageId}`)
      .setLabel("All top tracks")
      .setEmoji("\uD83C\uDFB6")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`lfm_artist_topalbums:${messageId}`)
      .setLabel("All top albums")
      .setEmoji("\uD83D\uDCBE")
      .setStyle(ButtonStyle.Secondary)
  );
}

async function buildArtistOverviewEmbed({ artistName, lastFmUsername, displayName }) {
  const [infoData, topTracks, topAlbums, userInfo] = await Promise.all([
    lastFmRequest("artist.getinfo", {
      artist: artistName,
      username: lastFmUsername,
      autocorrect: 1
    }),
    getUserTopTracksForArtist(lastFmUsername, artistName),
    getUserTopAlbumsForArtist(lastFmUsername, artistName),
    lastFmRequest("user.getinfo", { user: lastFmUsername })
  ]);

  const artist = infoData?.artist;
  if (!artist) throw new Error("Artist not found");

  const playsByYou = Number(artist.stats?.userplaycount || 0);
  const now = Math.floor(Date.now() / 1000);
  const lastWeekFrom = now - 7 * 24 * 60 * 60;
  const playsLastWeek = await getArtistPlaysInRange(lastFmUsername, artist.name, lastWeekFrom, now);

  const topTrackLines = topTracks.slice(0, 8).map((item, index) => {
    const plays = formatNumber(item.plays);
    return `${index + 1} **${item.name}** - ${plays}x`;
  });
  const topAlbumLines = topAlbums.slice(0, 8).map((item, index) => {
    const plays = formatNumber(item.plays);
    return `${index + 1} **${item.name}** - ${plays}x`;
  });

  let percentLine = null;
  try {
    const totalPlays = Number(userInfo?.user?.playcount || 0);
    if (totalPlays > 0 && playsByYou > 0) {
      const percent = (playsByYou / totalPlays) * 100;
      percentLine = `${percent.toFixed(2)}% of all your scrobbles are on this artist`;
    }
  } catch {
    percentLine = null;
  }

  const tags = Array.isArray(artist?.tags?.tag) ? artist.tags.tag : (artist?.tags?.tag ? [artist.tags.tag] : []);
  const tagNames = tags.map(tag => tag?.name).filter(Boolean).slice(0, 6);
  const tagLine = tagNames.length ? tagNames.join(" - ") : "Nessun tag";

  const description = `*${formatNumber(playsByYou)} plays on this artist - ${formatNumber(playsLastWeek)} plays last week*`;

  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Artist overview about ${artist.name} for ${displayName}`)
    .setURL(buildArtistUrl(artist.name))
    .setDescription(description)
    .addFields(
      { name: "Your top tracks", value: topTrackLines.join("\n") || "No data", inline: true },
      { name: "Your top albums", value: topAlbumLines.join("\n") || "No data", inline: true },
      { name: "\u200b", value: [percentLine, tagLine].filter(Boolean).join("\n"), inline: false }
    );

  return embed;
}
async function buildArtistTopTracksEmbed({ artistName, lastFmUsername, displayName, page = 1, perPage = 10, totalPlays = 0 }) {
  const tracks = await getUserTopTracksForArtist(lastFmUsername, artistName);
  const pageData = paginateList(tracks, page, perPage);
  const lines = pageData.slice.map((item, index) => {
    const plays = formatNumber(item.plays);
    return `${(pageData.page - 1) * perPage + index + 1}. **${item.name}** - ${plays} plays`;
  });
  const description = lines.join("\n") || "No data";
  const footerLine = `Page ${pageData.page}/${pageData.totalPages} - ${pageData.totalItems} different tracks`;
  const userLine = `${displayName} has ${formatNumber(totalPlays)} total scrobbles on this artist`;
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Your top tracks for '${artistName}'`)
    .setDescription(`${description}\n\n${footerLine}\n${userLine}`);
  return { embed, page: pageData.page, totalPages: pageData.totalPages, totalItems: pageData.totalItems };
}
async function buildArtistTopAlbumsEmbed({ artistName, lastFmUsername, displayName, page = 1, perPage = 10, totalPlays = 0 }) {
  const albums = await getUserTopAlbumsForArtist(lastFmUsername, artistName);
  const pageData = paginateList(albums, page, perPage);
  const lines = pageData.slice.map((item, index) => {
    const plays = formatNumber(item.plays);
    return `${(pageData.page - 1) * perPage + index + 1}. **${item.name}** - ${plays} plays`;
  });
  const footerLine = `Page ${pageData.page}/${pageData.totalPages} - ${displayName} has ${formatNumber(totalPlays)} total scrobbles on this artist`;
  const description = lines.join("\n") || "No data";
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Your top albums for '${artistName}'`)
    .setDescription(`${description}\n\n${footerLine}`);
  return { embed, page: pageData.page, totalPages: pageData.totalPages, totalItems: pageData.totalItems };
}

function paginateList(items, page, perPage) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * perPage;
  const slice = items.slice(start, start + perPage);
  return { slice, page: safePage, totalPages, totalItems };
}

function buildArtistTracksComponents(messageId, page, totalPages) {
  const backButton = new ButtonBuilder()
    .setCustomId(`lfm_artist_overview:${messageId}`)
    .setEmoji("\uD83D\uDCCA")
    .setStyle(ButtonStyle.Secondary);

  if (totalPages <= 1) {
    return [new ActionRowBuilder().addComponents(backButton)];
  }

  const firstDisabled = page <= 1;
  const lastDisabled = page >= totalPages;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_artist_tracks:first:${messageId}`)
      .setEmoji("\u23EE\uFE0F")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(firstDisabled),
    new ButtonBuilder()
      .setCustomId(`lfm_artist_tracks:prev:${messageId}`)
      .setEmoji("\u25C0\uFE0F")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(firstDisabled),
    new ButtonBuilder()
      .setCustomId(`lfm_artist_tracks:next:${messageId}`)
      .setEmoji("\u25B6\uFE0F")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(lastDisabled),
    new ButtonBuilder()
      .setCustomId(`lfm_artist_tracks:last:${messageId}`)
      .setEmoji("\u23ED\uFE0F")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(lastDisabled),
    backButton
  );

  return [row];
}
function buildArtistAlbumsComponents(messageId, page, totalPages) {
  const backButton = new ButtonBuilder()
    .setCustomId(`lfm_artist_overview:${messageId}`)
    .setEmoji("\uD83D\uDCCA")
    .setStyle(ButtonStyle.Secondary);

  if (totalPages <= 1) {
    return [new ActionRowBuilder().addComponents(backButton)];
  }

  const firstDisabled = page <= 1;
  const lastDisabled = page >= totalPages;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfm_artist_albums:first:${messageId}`)
      .setEmoji("\u23EE\uFE0F")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(firstDisabled),
    new ButtonBuilder()
      .setCustomId(`lfm_artist_albums:prev:${messageId}`)
      .setEmoji("\u25C0\uFE0F")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(firstDisabled),
    new ButtonBuilder()
      .setCustomId(`lfm_artist_albums:next:${messageId}`)
      .setEmoji("\u25B6\uFE0F")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(lastDisabled),
    new ButtonBuilder()
      .setCustomId(`lfm_artist_albums:last:${messageId}`)
      .setEmoji("\u23ED\uFE0F")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(lastDisabled),
    backButton
  );

  return [row];
}

module.exports = {
  skipPrefix: false,
  name: "artistoverview",
  aliases: ["artistov"],
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
            return sendArtistNotFound(message, artistQuery);
      }
      const displayName = message.guild?.members.cache.get(target.id)?.displayName
        || target.username
        || user.lastFmUsername;
      const embed = await buildArtistOverviewEmbed({
        artistName,
        lastFmUsername: user.lastFmUsername,
        displayName
      });
      const sent = await safeChannelSend(message.channel, { embeds: [embed] });
      const row = buildArtistOverviewButtons(sent.id);
      await sent.edit({ components: [row] });
      if (!message.client.artistStates) message.client.artistStates = new Map();
      message.client.artistStates.set(sent.id, {
        userId: message.author.id,
        artistName,
        lastFmUsername: user.lastFmUsername,
        displayName,
        mainEmbed: null,
        expiresAt: Date.now() + 10 * 60 * 1000,
        noredirect
      });
      return;
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante il recupero dell'overview artista.")
        ]
      });
    }
  },

  buildArtistOverviewEmbed, buildArtistTopTracksEmbed, buildArtistTopAlbumsEmbed, buildArtistOverviewButtons, buildSimpleArtistEmbed, buildArtistTracksComponents, buildArtistAlbumsComponents
};


