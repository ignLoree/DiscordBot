const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { DEFAULT_EMBED_COLOR, lastFmRequest, buildAlbumUrl, buildUserUrl } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessage } = require("../../Utils/Music/lastfmContext");
const { resolveAlbumArtist } = require("../../Utils/Music/lastfmResolvers");
const { splitArtistTitle, extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError, sendAlbumNotFound } = require("../../Utils/Music/lastfmError");
const { getSpotifyAlbumImageSmart } = require("../../Utils/Music/spotify");
const { getMusicBrainzAlbumImage } = require("../../Utils/Music/musicbrainz");
function pickLastFmImage(images) {
  if (!Array.isArray(images)) return null;
  return images.find(img => img.size === "extralarge")?.["#text"]
    || images.find(img => img.size === "large")?.["#text"]
    || images.find(img => img.size === "medium")?.["#text"]
    || images.find(img => img.size === "small")?.["#text"]
    || null;
}
let renderWhoKnows = null;
try {
  renderWhoKnows = require("../../Utils/Render/whoknowsCanvas");
} catch {
  renderWhoKnows = null;
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

function buildGlobalDisplay(entry) {
  if (!entry.privacyGlobal) return { name: "Private user", url: null };
  return { name: entry.displayName, url: entry.profileUrl, fallback: entry.lastFmUsername };
}
function hasUnsafeChars(value) {
  if (!value) return true;
  for (const char of String(value)) {
    const code = char.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) return true;
    if (code > 0x024F && (code < 0x1E00 || code > 0x1EFF)) return true;
  }
  return false;
}
function pickSafeName(displayName, fallback) {
  if (!hasUnsafeChars(displayName)) return displayName;
  if (fallback && !hasUnsafeChars(fallback)) return fallback;
  return displayName || fallback || "Private user";
}
function buildDisplayResults(fullResults, pageResults, requesterId, limit, page) {
  if (page && page > 1) return pageResults;
  const requesterIndex = fullResults.findIndex(item => item.discordId === requesterId);
  if (requesterIndex === -1) return pageResults;
  if (pageResults.some(item => item.discordId === requesterId)) return pageResults;
  const trimmed = pageResults.slice(0, Math.max(0, limit - 1));
  const requesterEntry = fullResults[requesterIndex];
  return [...trimmed, { ...requesterEntry, rank: requesterIndex + 1 }];
}

function buildLeaderboardLines(results, requesterId) {
  return results.map((item, index) => {
    const display = buildGlobalDisplay(item);
    const safeName = pickSafeName(display.name, display.fallback);
    const label = display.url ? `[${safeName}](${display.url})` : safeName;
    const plays = Number(item.playcount || 0);
    const playLabel = plays === 1 ? "play" : "plays";
    const name = item.discordId === requesterId ? `**${label}**` : label;
    const rankValue = Number.isFinite(item.rank) ? item.rank : index + 1;
    const rank = `${rankValue}.`;
    const line = `${rank}${name} - ${plays} ${playLabel}`;
    return item.discordId === requesterId ? `__${rank}__${name} - ${plays} ${playLabel}` : line;
  });
}

function parseMode(args, fallbackMode) {
  let mode = fallbackMode || "embed";
  const filtered = [];
  for (const arg of args) {
    const token = arg.toLowerCase();
    if (token === "image" || token === "img") {
      mode = "image";
      continue;
    }
    if (token === "embed") {
      mode = "embed";
      continue;
    }
    filtered.push(arg);
  }
  return { mode, args: filtered };
}

module.exports = {
  skipPrefix: false,
  name: "globalwhoknowsalbum",
  aliases: ["gwa"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const requester = await getLastFmUserForMessage(message, message.author);
    if (!requester) return;
    const modeData = parseMode(args, requester.responseMode || "embed");
    const pagination = extractPagination(modeData.args, { defaultLimit: 15, maxLimit: 50 });
    let parsedArgs = pagination.args;
    if (parsedArgs.length && parsedArgs[0].toLowerCase() === "album") {
      parsedArgs = parsedArgs.slice(1);
    }
    const rawQuery = parsedArgs.join(" ").trim();
    const parsed = splitArtistTitle(rawQuery);
    try {
      const resolved = await resolveAlbumArtist(requester.lastFmUsername, parsed.title, parsed.artist);
      if (!resolved) {
        return sendAlbumNotFound(message, query);
      }

      const allUsers = await LastFmUser.find({ lastFmUsername: { $exists: true, $ne: "" } }).lean();
      const checks = await mapWithConcurrency(allUsers, 4, async doc => {
        try {
          const data = await lastFmRequest("album.getinfo", {
            artist: resolved.artist,
            album: resolved.album,
            username: doc.lastFmUsername
          });
          const playcount = Number(data?.album?.userplaycount || 0);
          if (playcount <= 0) return null;
          return {
            discordId: doc.discordId,
            lastFmUsername: doc.lastFmUsername,
            privacyGlobal: doc.privacyGlobal !== false,
            playcount
          };
        } catch {
          return null;
        }
      });

      const fullResults = checks
        .filter(Boolean)
        .map(entry => {
          const displayName = entry.privacyGlobal ? (message.client.users.cache.get(entry.discordId)?.username || entry.lastFmUsername) : "Private user";
          const profileUrl = entry.privacyGlobal ? buildUserUrl(entry.lastFmUsername) : null;
          return {
            ...entry,
            displayName,
            profileUrl
          };
        })
        .sort((a, b) => b.playcount - a.playcount);

      const totalListeners = fullResults.length;
      const totalPlays = fullResults.reduce((sum, item) => sum + Number(item.playcount || 0), 0);
      const avgPlays = totalListeners ? Math.round(totalPlays / totalListeners) : 0;
      const start = (pagination.page - 1) * pagination.limit;
      const results = fullResults.slice(start, start + pagination.limit);
      if (!results.length) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("<:vegax:1443934876440068179> Nessun ascoltatore trovato.")
          ]
        });
      }

      const info = await lastFmRequest("album.getinfo", {
        artist: resolved.artist,
        album: resolved.album,
        autocorrect: 1
      });
      const lastfmImage = pickLastFmImage(info?.album?.image);
      const cover = (await getSpotifyAlbumImageSmart(resolved.artist, resolved.album))
        || lastfmImage
        || (await getMusicBrainzAlbumImage(resolved.artist, resolved.album));
      const albumUrl = buildAlbumUrl(resolved.artist, resolved.album);
      const title = `${resolved.album} by ${resolved.artist} globally`;

      if (modeData.mode === "image" && renderWhoKnows) {
        const imageResults = buildDisplayResults(fullResults, fullResults.slice(0, 10), message.author.id, 10, 1);
        const rows = imageResults.map((item, index) => {
          const safeName = pickSafeName(item.displayName, item.lastFmUsername);
          return {
            user: safeName,
            plays: item.playcount,
            highlight: item.discordId === message.author.id,
            rank: Number.isFinite(item.rank) ? item.rank : index + 1
          };
        });
        const imageBuffer = await renderWhoKnows({
          title: `${resolved.album} by ${resolved.artist}`,
          subtitle: `by ${resolved.artist} in Vinili & Caffè Bot`,
          coverUrl: cover,
          rows,
          footer: `Global album - ${totalListeners} listeners - ${totalPlays} plays - ${avgPlays} avg`,
          badgeText: "WhoKnows Album",
          serverLabel: "in Vinili & Caffè Bot 🌐",
          showCrown: false,
          poweredByText: "Powered by Vinili & Caffè Bot"
        });
        if (imageBuffer) {
          const attachment = new AttachmentBuilder(imageBuffer, { name: "globalwhoknowsalbum.png" });
          return message.channel.send({ files: [attachment] });
        }
      }

      const displayResults = buildDisplayResults(fullResults, results, message.author.id, pagination.limit, pagination.page);
      const lines = buildLeaderboardLines(displayResults, message.author.id);
      const notice = requester.privacyGlobal === false
        ? "You're currently not globally visible - use '.privacy' to enable."
        : null;
      const footerLine = `Global album - ${totalListeners} listeners - ${totalPlays} plays - ${avgPlays} avg`;
      const footerText = notice ? `${notice} ${footerLine}` : footerLine;

      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(title)
        .setURL(albumUrl)
        .setThumbnail(cover)
        .setDescription(lines.join("\n"))
        .setFooter({ text: footerText });
      return message.channel.send({ embeds: [embed] });
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante il recupero dei dati.")
        ]
      });
    }
  }
};

