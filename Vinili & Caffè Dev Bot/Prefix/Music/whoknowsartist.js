const { safeChannelSend } = require('../../Utils/Moderation/message');
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { DEFAULT_EMBED_COLOR, lastFmRequest, buildArtistUrl, buildUserUrl } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessage } = require("../../Utils/Music/lastfmContext");
const { extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { resolveArtistName } = require("../../Utils/Music/lastfmResolvers");
const { updateCrown } = require("../../Utils/Music/crowns");
const { getSpotifyArtistImageSmart } = require("../../Utils/Music/spotify");
const { getMusicBrainzArtistImage } = require("../../Utils/Music/musicbrainz");
const { handleLastfmError, sendArtistNotFound } = require("../../Utils/Music/lastfmError");
function pickLastFmImage(images) {
  if (!Array.isArray(images)) return null;
  return images.find(img => img.size === "extralarge")?.["#text"]
    || images.find(img => img.size === "large")?.["#text"]
    || images.find(img => img.size === "medium")?.["#text"]
    || images.find(img => img.size === "small")?.["#text"]
    || null;
}
function buildTagLine(tags, separator = " - ", maxLength = 1024) {
  const names = tags.map(tag => tag.name).filter(Boolean);
  if (!names.length) return "";
  let line = "";
  let used = 0;
  for (const name of names) {
    const next = line ? `${line}${separator}${name}` : name;
    if (next.length > maxLength) break;
    line = next;
    used += 1;
  }
  const remaining = names.length - used;
  if (remaining > 0) {
    const suffix = `${separator}+${remaining}`;
    if (line.length + suffix.length <= maxLength) {
      line += suffix;
    }
  }
  return line;
}
let renderWhoKnows = null;
try {
  renderWhoKnows = require("../../Utils/Render/whoknowsCanvas");
} catch (error) {
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
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
function parseOptions(args, fallbackMode) {
  let mode = fallbackMode;
  let random = false;
  let noredirect = false;
  const filtered = [];
  for (const raw of args) {
    const token = raw.toLowerCase();
    if (token === "image" || token === "img") {
      mode = "image";
      continue;
    }
    if (token === "embed") {
      mode = "embed";
      continue;
    }
    if (token === "random" || token === "rnd") {
      random = true;
      continue;
    }
    if (token === "noredirect" || token === "nr") {
      noredirect = true;
      continue;
    }
    filtered.push(raw);
  }
  return { mode, random, noredirect, args: filtered };
}
async function getRandomArtist(username, poolSize = 200) {
  const data = await lastFmRequest("user.gettopartists", {
    user: username,
    period: "overall",
    limit: poolSize
  });
  const list = data?.topartists?.artist || [];
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)].name || null;
}
function buildLeaderboardLines(results, guild, highlightId) {
  return results.map((item, index) => {
    const member = guild.members.cache.get(item.discordId);
    const displayName = member?.displayName || member?.user?.username || "Sconosciuto";
    const isPrivate = item.privacyGlobal === false;
    const safeName = isPrivate ? "Private user" : displayName;
    const profileUrl = !isPrivate && item.lastFmUsername ? buildUserUrl(item.lastFmUsername) : null;
    const linkedName = profileUrl ? `[${safeName}](${profileUrl})` : safeName;
    const name = item.discordId === highlightId
      ? `**${linkedName}**`
      : linkedName;
    const rankValue = Number.isFinite(item.rank) ? item.rank : index + 1;
    if (rankValue === 1) {
      return `👑 ${name} - **${item.playcount}** plays`;
    }
    const rank = `${rankValue}.`;
    const line = `${rank}${name} - **${item.playcount}** plays`;
    return item.discordId === highlightId ? `__${rank}__${name} - **${item.playcount}** plays` : line;
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
async function renderImageResponse({
  title,
  lines,
  footer,
  coverUrl,
  guildName
}) {
  if (!canvasModule) return null;
  const { createCanvas, loadImage } = canvasModule;
  const padding = 24;
  const titleSize = 22;
  const lineSize = 16;
  const footerSize = 14;
  const lineHeight = 22;
  const coverSize = 170;
  const coverGap = 18;
  const textWidth = 520;
  const width = padding * 2 + textWidth + coverSize + coverGap;
  const height = padding * 2 + titleSize + 10 + lines.length * lineHeight + 10 + footerSize;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#9ecbff";
  ctx.font = `bold ${titleSize}px sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(title, padding, padding, textWidth);
  ctx.fillStyle = "#d9d9d9";
  ctx.font = `${lineSize}px sans-serif`;
  let y = padding + titleSize + 10;
  for (const line of lines) {
    ctx.fillText(line.replace(/\*\*/g, ""), padding, y, textWidth);
    y += lineHeight;
  }
  ctx.fillStyle = "#b0b0b0";
  ctx.font = `${footerSize}px sans-serif`;
  ctx.fillText(footer, padding, height - padding - footerSize, textWidth);
  if (coverUrl) {
    try {
      const response = await axios.get(coverUrl, { responseType: "arraybuffer" });
      const img = await loadImage(response.data);
      const x = padding + textWidth + coverGap;
      const yCover = padding;
      ctx.drawImage(img, x, yCover, coverSize, coverSize);
    } catch (error) {
   if (handleLastfmError(message, error)) return;
    }
  }
  ctx.fillStyle = "#9a9a9a";
  ctx.font = "11px sans-serif";
  ctx.fillText(`in ${guildName}`, padding + textWidth + coverGap, padding + coverSize + 6);
  return canvas.toBuffer("image/png");
}
module.exports = {
  skipPrefix: false,
  name: "whoknows",
  aliases: ["wk", "w"],
  async execute(message, args) {
    await message.channel.sendTyping();
    if (!message.guild) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Questo comando può essere usato solo in un server.")
        ]
      });
    }
    const requester = await getLastFmUserForMessage(message, message.author);
    if (!requester) return;
    const options = parseOptions(args, requester.responseMode || "embed");
    const pagination = extractPagination(options.args, { defaultLimit: 15, maxLimit: 50 });
    const randomPool = Math.min(200, Math.max(50, pagination.limit * pagination.page));
    const artistQuery = options.args.join(" ").trim();
    try {
      let artistName = null;
      if (options.random) {
        artistName = await getRandomArtist(requester.lastFmUsername, randomPool);
      } else {
        artistName = await resolveArtistName(requester.lastFmUsername, artistQuery || null);
      }
      if (!artistName) {
        return sendArtistNotFound(message, artistQuery);
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
      const checks = await mapWithConcurrency(allUsers, 4, async doc => {
        try {
          const data = await lastFmRequest("artist.getinfo", {
            artist: artistName,
            username: doc.lastFmUsername,
            autocorrect: options.noredirect ? 0 : 1
          });
          const playcount = Number(data?.artist?.stats?.userplaycount || 0);
          return {
            discordId: doc.discordId,
            lastFmUsername: doc.lastFmUsername,
            privacyGlobal: doc.privacyGlobal !== false,
            playcount
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
      const fullResults = checks
        .filter(item => item.playcount > 0)
        .sort((a, b) => b.playcount - a.playcount);
      const start = (pagination.page - 1) * pagination.limit;
      const results = fullResults.slice(start, start + pagination.limit);
      if (!results.length) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("Nessun ascoltatore trovato.")
          ]
        });
      }
      const info = await lastFmRequest("artist.getinfo", {
        artist: artistName,
        autocorrect: options.noredirect ? 0 : 1
      });
      const artist = info?.artist;
      const lastfmImage = pickLastFmImage(artist?.image);
      const image = (await getSpotifyArtistImageSmart(artistName))
        || lastfmImage
        || (await getMusicBrainzArtistImage(artistName));
      const tags = artist?.tags?.tag || [];
      const tagLine = buildTagLine(tags);
      const totalListeners = fullResults.length;
      const totalPlays = fullResults.reduce((sum, item) => sum + item.playcount, 0);
      const avgPlays = totalListeners ? Math.round(totalPlays / totalListeners) : 0;
      const requesterMember = message.guild.members.cache.get(message.author.id);
      const requesterName = requesterMember?.displayName || message.author.username;
      const statsLine = `Artist - ${totalListeners} listeners - ${totalPlays} plays - ${avgPlays} avg`;
      const title = `${artistName} in Server di ${requesterName}`;
      const displayResults = buildDisplayResults(fullResults, results, message.author.id, pagination.limit, pagination.page);
      const lines = buildLeaderboardLines(displayResults, message.guild, message.author.id);
      const crownEntry = fullResults[0];
      const crownMember = crownEntry?.discordId ? message.guild.members.cache.get(crownEntry.discordId) : null;
      const crownName = crownEntry
        ? (crownEntry.privacyGlobal === false
          ? "Private user"
          : crownMember?.displayName || crownMember?.user?.username || "Sconosciuto")
        : null;
      const crownLine = crownName ? `Crown claimed by ${crownName}!` : null;
      if (fullResults[0]) {
        await updateCrown({
          guildId: message.guild.id,
          artistName,
          holderId: fullResults[0].discordId,
          playcount: fullResults[0].playcount
        });
      }
      if (options.mode === "image" && renderWhoKnows) {
        const imageResults = buildDisplayResults(fullResults, fullResults.slice(0, 10), message.author.id, 10, 1);
        const rows = imageResults.map((item, index) => {
          const member = message.guild.members.cache.get(item.discordId);
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
          title: artistName,
          subtitle: `in ${message.guild.name}`,
          coverUrl: image,
          rows,
          footer: `${totalListeners} listeners - ${totalPlays} plays - ${avgPlays} avg${crownName ? ` - Crown claimed by ${crownName}` : ""}`,
          badgeText: "WhoKnows",
          serverLabel: `in Server di ${requesterName}`,
          showCrown: true,
          poweredByText: "Powered by Vinili & Caffè Bot"
        });
        if (imageBuffer) {
          const attachment = new AttachmentBuilder(imageBuffer, { name: "whoknows.png" });
          return safeChannelSend(message.channel, { files: [attachment] });
        }
      }
      const descriptionParts = [lines.join("\n")];
      if (crownLine) {
        descriptionParts.push("", crownLine);
      }
      if (tagLine) {
        descriptionParts.push(tagLine);
      }
      descriptionParts.push(statsLine);
      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(title)
        .setURL(buildArtistUrl(artistName))
        .setThumbnail(image)
        .setDescription(descriptionParts.join("\n"));
      return safeChannelSend(message.channel, { embeds: [embed] });
    } catch (error) {
   if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Errore durante il recupero dei dati.")
        ]
      });
    }
  }
};



