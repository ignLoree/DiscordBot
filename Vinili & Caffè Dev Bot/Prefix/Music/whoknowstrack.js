const { safeChannelSend } = require('../../Utils/Moderation/message');
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { DEFAULT_EMBED_COLOR, lastFmRequest, buildTrackUrl, buildUserUrl } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessage } = require("../../Utils/Music/lastfmContext");
const { resolveTrackArtist } = require("../../Utils/Music/lastfmResolvers");
const { splitArtistTitle, extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError, sendTrackNotFound } = require("../../Utils/Music/lastfmError");
const { getSpotifyTrackImageSmart } = require("../../Utils/Music/spotify");
const { getMusicBrainzTrackImage } = require("../../Utils/Music/musicbrainz");
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

function buildLeaderboardLines(results, guild, lastfmMap, highlightId) {
  return results.map((item, index) => {
    const member = guild.members.cache.get(item.discordId);
    const displayName = member?.displayName || member?.user?.username || "Sconosciuto";
    const lastfmUsername = lastfmMap.get(item.discordId);
    const isPrivate = item.privacyGlobal === false;
    const safeName = isPrivate ? "Private user" : displayName;
    const profileUrl = !isPrivate && lastfmUsername ? buildUserUrl(lastfmUsername) : null;
    const nameLabel = profileUrl ? `[${safeName}](${profileUrl})` : safeName;
    const plays = Number(item.playcount || 0);
    const label = plays === 1 ? "play" : "plays";
    const name = item.discordId === highlightId ? `**${nameLabel}**` : nameLabel;
    const rankValue = Number.isFinite(item.rank) ? item.rank : index + 1;
    const rank = `${rankValue}.`;
    const line = `${rank}${name} - ${plays} ${label}`;
    return item.discordId === highlightId ? `__${rank}__${name} - ${plays} ${label}` : line;
  });
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
function pickSafeName(displayName, username) {
  if (!hasUnsafeChars(displayName)) return displayName;
  if (username && !hasUnsafeChars(username)) return username;
  return displayName || username || "Sconosciuto";
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
  name: "whoknowstrack",
  aliases: ["wt", "wkt"],
  async execute(message, args) {
    await message.channel.sendTyping();
    if (!message.guild) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.")
        ]
      });
    }
    const requester = await getLastFmUserForMessage(message, message.author);
    if (!requester) return;
    const modeData = parseMode(args, requester.responseMode || "embed");
    const pagination = extractPagination(modeData.args, { defaultLimit: 15, maxLimit: 50 });
    let parsedArgs = pagination.args;
    if (parsedArgs.length && parsedArgs[0].toLowerCase() === "track") {
      parsedArgs = parsedArgs.slice(1);
    }
    const rawQuery = parsedArgs.join(" ").trim();
    const parsed = splitArtistTitle(rawQuery);
    try {
      const resolved = await resolveTrackArtist(requester.lastFmUsername, parsed.title, parsed.artist);
      if (!resolved) {
        return sendTrackNotFound(message, rawQuery);
      }
      if (message.guild.members.cache.size < message.guild.memberCount) {
        try {
          await message.guild.members.fetch();
        } catch {
        }
      }
      const guildIds = message.guild.members.cache.map(member => member.id);
      const allUsers = await LastFmUser.find({
        discordId: { $in: guildIds },
        lastFmUsername: { $exists: true, $ne: "" }
      });
      const lastfmMap = new Map(allUsers.map(user => [user.discordId, user.lastFmUsername]));
      const checks = await mapWithConcurrency(allUsers, 4, async doc => {
        try {
          const data = await lastFmRequest("track.getinfo", {
            artist: resolved.artist,
            track: resolved.track,
            username: doc.lastFmUsername
          });
          const playcount = Number(data?.track?.userplaycount || 0);
          return { discordId: doc.discordId, playcount, privacyGlobal: doc.privacyGlobal !== false };
        } catch {
          return { discordId: doc.discordId, playcount: 0, privacyGlobal: doc.privacyGlobal !== false };
        }
      });
      const fullResults = checks
        .filter(item => item.playcount > 0)
        .sort((a, b) => b.playcount - a.playcount);
      const totalListeners = fullResults.length;
      const totalPlays = fullResults.reduce((sum, item) => sum + Number(item.playcount || 0), 0);
      const avgPlays = totalListeners ? Math.round(totalPlays / totalListeners) : 0;
      const start = (pagination.page - 1) * pagination.limit;
      const results = fullResults.slice(start, start + pagination.limit);
      if (!results.length) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("<:vegax:1443934876440068179> Nessun ascoltatore trovato.")
          ]
        });
      }
      const info = await lastFmRequest("track.getinfo", {
        artist: resolved.artist,
        track: resolved.track,
        autocorrect: 1
      });
      const lastfmImage = pickLastFmImage(info?.track?.album?.image || info?.track?.image);
      const cover = (await getSpotifyTrackImageSmart(resolved.artist, resolved.track))
        || lastfmImage
        || (await getMusicBrainzTrackImage(resolved.artist, resolved.track));
      const requesterMember = message.guild.members.cache.get(message.author.id);
      const requesterName = requesterMember?.displayName || message.author.username;
      const trackUrl = buildTrackUrl(resolved.artist, resolved.track);
      const title = `${resolved.track} by ${resolved.artist} in Server di ${requesterName}`;
      if (modeData.mode === "image" && renderWhoKnows) {
        const imageResults = buildDisplayResults(fullResults, fullResults.slice(0, 10), message.author.id, 10, 1);
        const rows = imageResults.map((item, index) => {
          const member = message.guild?.members.cache.get(item.discordId);
          const displayName = member?.displayName || member?.user?.username || "Sconosciuto";
          const fallbackName = member?.user?.username || displayName;
          const safeLabel = pickSafeName(displayName, fallbackName);
          const safeName = item.privacyGlobal === false ? "Private user" : safeLabel;
          return {
            user: safeName,
            plays: item.playcount,
            highlight: item.discordId === message.author.id,
            rank: Number.isFinite(item.rank) ? item.rank : index + 1
          };
        });
        const imageBuffer = await renderWhoKnows({
          title: `${resolved.track} by ${resolved.artist}`,
          subtitle: `by ${resolved.artist} in Server di ${requesterName}`,
          coverUrl: cover,
          rows,
          footer: `${totalListeners} listeners - ${totalPlays} plays - ${avgPlays} avg`,
          badgeText: "WhoKnows Track",
          serverLabel: `in Server di ${requesterName}`,
          showCrown: false,
          poweredByText: "Powered by Vinili & Caffè Bot"
        });
        if (imageBuffer) {
          const attachment = new AttachmentBuilder(imageBuffer, { name: "whoknowstrack.png" });
          return safeChannelSend(message.channel, { files: [attachment] });
        }
      }
      const displayResults = buildDisplayResults(fullResults, results, message.author.id, pagination.limit, pagination.page);
      const lines = buildLeaderboardLines(displayResults, message.guild, lastfmMap, message.author.id);
      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(title)
        .setURL(trackUrl)
        .setThumbnail(cover)
        .setDescription(lines.join("\n"));
      return safeChannelSend(message.channel, { embeds: [embed] });
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante il recupero dei dati.")
        ]
      });
    }
  }
};



