const { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { DEFAULT_EMBED_COLOR, lastFmRequest, buildUserUrl, buildLastFmUrl } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessage } = require("../../Utils/Music/lastfmContext");
const { extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { resolveArtistName } = require("../../Utils/Music/lastfmResolvers");
const { getSpotifyArtistMeta, getSpotifyArtistImageSmart } = require("../../Utils/Music/spotify");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");

function titleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
  for (let i = 0; i < workerCount; i += 1) workers.push(worker());
  await Promise.all(workers);
  return results;
}

async function getGenreLeaderboard({ guild, genre, requesterId, limit = 15, fetchLimit = 200 }) {
  const guildIds = guild.members.cache.map(member => member.id);
  const allUsers = await LastFmUser.find({
    discordId: { $in: guildIds },
    lastFmUsername: { $exists: true, $ne: "" }
  });
  const results = await mapWithConcurrency(allUsers, 4, async doc => {
    try {
      const data = await lastFmRequest("tag.gettopartists", {
        tag: genre,
        user: doc.lastFmUsername,
        limit: fetchLimit
      });
      const artists = data?.topartists?.artist || [];
      const plays = artists.reduce((sum, artist) => sum + Number(artist?.playcount || 0), 0);
      return {
        discordId: doc.discordId,
        lastFmUsername: doc.lastFmUsername,
        privacyGlobal: doc.privacyGlobal !== false,
        playcount: plays
      };
    } catch {
      return {
        discordId: doc.discordId,
        lastFmUsername: doc.lastFmUsername,
        privacyGlobal: doc.privacyGlobal !== false,
        playcount: 0
      };
    }
  });
  const filtered = results
    .filter(item => item.playcount > 0)
    .sort((a, b) => b.playcount - a.playcount);
  const page = filtered.slice(0, limit);
  const totalListeners = filtered.length;
  const totalPlays = filtered.reduce((sum, item) => sum + item.playcount, 0);
  const avgPlays = totalListeners ? Math.round(totalPlays / totalListeners) : 0;
  const requesterEntry = filtered.find(item => item.discordId === requesterId);
  const requesterRank = requesterEntry ? filtered.indexOf(requesterEntry) + 1 : null;
  const requesterPlays = requesterEntry?.playcount || 0;
  return { results: page, totalListeners, totalPlays, avgPlays, requesterRank, requesterPlays };
}

function buildLeaderboardLines(results, guild, requesterId) {
  return results.map((item, index) => {
    const member = guild.members.cache.get(item.discordId);
    const displayName = member?.displayName || member?.user?.username || "Sconosciuto";
    const isPrivate = item.privacyGlobal === false;
    const safeName = isPrivate ? "Private user" : displayName;
    const profileUrl = !isPrivate && item.lastFmUsername ? buildUserUrl(item.lastFmUsername) : null;
    const linkedName = profileUrl ? `[${safeName}](${profileUrl})` : safeName;
    const name = item.discordId === requesterId ? `**${linkedName}**` : linkedName;
    const rank = `${index + 1}.`;
    const line = `${rank}${name} - **${item.playcount}** plays`;
    return item.discordId === requesterId ? `__${rank}__${name} - **${item.playcount}** plays` : line;
  });
}

function buildGenreSelectPayload({ artistName, genres, image, source, messageId }) {
  const bullets = genres.slice(0, 5).map(genre => `- **${titleCase(genre)}**`).join("\n") || "- No genres found";
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(`Genres for '${artistName}'`)
    .setDescription(
      `${bullets}\n\n` +
      `Genre source: ${source}\n` +
      "Add a genre to this command to see WhoKnows genre"
    );
  if (image) embed.setThumbnail(image);

  const options = genres.slice(0, 25).map(genre => ({
    label: titleCase(genre),
    value: genre
  }));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`lfm_wkgenre_select:${messageId}`)
    .setPlaceholder("Select genre to view WhoKnows")
    .addOptions(options.length ? options : [{ label: "No genres available", value: "none", default: true }])
    .setDisabled(options.length === 0);
  const row = new ActionRowBuilder().addComponents(select);
  return { embeds: [embed], components: [row] };
}

function buildWhoKnowsGenreEmbed({ genre, guild, requesterId, requesterName, image, stats, results }) {
  const title = `${titleCase(genre)} in Server di ${requesterName}`;
  const lines = buildLeaderboardLines(results, guild, requesterId);
  const description = lines.length ? lines.join("\n") : "Nessun ascoltatore trovato.";
  const youLine = stats.requesterRank
    ? ` - You: ${stats.requesterPlays} plays (#${stats.requesterRank})`
    : "";
  const footer = `Genre - ${stats.totalListeners} listeners - ${stats.totalPlays} plays - ${stats.avgPlays} avg${youLine}`;
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(title)
    .setURL(buildLastFmUrl(`tag/${encodeURIComponent(genre)}`))
    .setDescription(description)
    .setFooter({ text: footer });
  if (image) embed.setThumbnail(image);
  return embed;
}

module.exports = {
  skipPrefix: false,
  name: "whoknowsgenre",
  aliases: ["wkg", "wg", "whoknowgenres", "whoknowgenre"],
  async execute(message, args) {
    await message.channel.sendTyping();
    if (!message.guild) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Questo comando può' essere usato solo in un server.")
        ]
      });
    }
    const requester = await getLastFmUserForMessage(message, message.author);
    if (!requester) return;
    const pagination = extractPagination(args, { defaultLimit: 15, maxLimit: 50 });
    const artistQuery = pagination.args.join(" ").trim();
    try {
      const artistName = await resolveArtistName(requester.lastFmUsername, artistQuery || null);
      if (!artistName) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("Sorry, the genre or artist you're searching for does not exist or do not have any stored genres.")
          ]
        });
      }
      if (message.guild.members.cache.size < message.guild.memberCount) {
        try {
          await message.guild.members.fetch();
        } catch {}
      }
      const spotifyMeta = await getSpotifyArtistMeta(artistName);
      const image = spotifyMeta?.image || await getSpotifyArtistImageSmart(artistName);
      const genres = Array.isArray(spotifyMeta?.genres) ? spotifyMeta.genres : [];
      const source = genres.length ? "Spotify" : "Last.fm";
      const fallbackGenres = [];
      if (!genres.length) {
        const info = await lastFmRequest("artist.getinfo", { artist: artistName, autocorrect: 1 });
        const tags = info?.artist?.tags?.tag || [];
        tags.slice(0, 25).forEach(tag => {
          if (tag?.name) fallbackGenres.push(tag.name);
        });
      }
      const list = genres.length ? genres : fallbackGenres;
      if (!list.length) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("Sorry, the genre or artist you're searching for does not exist or do not have any stored genres.")
          ]
        });
      }
      const sent = await message.channel.send(buildGenreSelectPayload({
        artistName,
        genres: list,
        image,
        source,
        messageId: "pending"
      }));
      const payload = buildGenreSelectPayload({
        artistName,
        genres: list,
        image,
        source,
        messageId: sent.id
      });
      await sent.edit(payload);

      if (!message.client.whoknowsGenreStates) message.client.whoknowsGenreStates = new Map();
      message.client.whoknowsGenreStates.set(sent.id, {
        userId: message.author.id,
        artistName,
        genres: list,
        image,
        source,
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
            .setDescription("Errore durante il recupero dei dati.")
        ]
      });
    }
  },
  buildWhoKnowsGenreEmbed,
  getGenreLeaderboard
};
