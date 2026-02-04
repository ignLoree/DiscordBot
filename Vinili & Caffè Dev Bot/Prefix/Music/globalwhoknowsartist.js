const { safeChannelSend } = require('../../Utils/Moderation/message');
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { DEFAULT_EMBED_COLOR, lastFmRequest, buildArtistUrl, buildUserUrl } = require("../../Utils/Music/lastfm");
const { getSpotifyArtistImageSmart } = require("../../Utils/Music/spotify");
const { getMusicBrainzArtistImage } = require("../../Utils/Music/musicbrainz");
const { getLastFmUserForMessage } = require("../../Utils/Music/lastfmContext");
const { extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { resolveArtistName } = require("../../Utils/Music/lastfmResolvers");
const { handleLastfmError, sendArtistNotFound } = require("../../Utils/Music/lastfmError");
let renderWhoKnows = null;
try {
  renderWhoKnows = require("../../Utils/Render/whoknowsCanvas");
} catch {
  renderWhoKnows = null;
}

function resolveGlobalDisplay(doc, client) {
  if (!doc.privacyGlobal) return "Private user";
  const member = client.users.cache.get(doc.discordId);
  return member?.username || doc.lastFmUsername || "Private user";
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
function pickLastFmImage(images) {
  if (!Array.isArray(images)) return null;
  return images.find(img => img.size === "extralarge")?.["#text"]
    || images.find(img => img.size === "large")?.["#text"]
    || images.find(img => img.size === "medium")?.["#text"]
    || images.find(img => img.size === "small")?.["#text"]
    || null;
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
  let mode = fallbackMode;
  const filtered = [];
  for (const raw of args) {
    const token = String(raw || "").toLowerCase();
    if (token === "image" || token === "img") {
      mode = "image";
      continue;
    }
    if (token === "embed") {
      mode = "embed";
      continue;
    }
    filtered.push(raw);
  }
  return { mode, args: filtered };
}

module.exports = {
  skipPrefix: false,
  name: "globalwhoknows",
  aliases: ["gwk"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const user = await getLastFmUserForMessage(message, message.author);
    if (!user) return;
    const modeData = parseMode(args, user.responseMode || "embed");
    const pagination = extractPagination(modeData.args, { defaultLimit: 15, maxLimit: 50 });
    const artistQuery = pagination.args.join(" ").trim();
    try {
      const artistName = await resolveArtistName(user.lastFmUsername, artistQuery || null);
      if (!artistName) {
        return sendArtistNotFound(message, artistQuery);
      }
      const allUsers = await LastFmUser.find({ lastFmUsername: { $exists: true, $ne: "" } });
      const checks = allUsers.map(async doc => {
        try {
          const data = await lastFmRequest("artist.getinfo", {
            artist: artistName,
            username: doc.lastFmUsername
          });
          const playcount = Number(data?.artist?.stats?.userplaycount || 0);
          return { discordId: doc.discordId, playcount, privacyGlobal: doc.privacyGlobal !== false, lastFmUsername: doc.lastFmUsername };
        } catch {
          return { discordId: doc.discordId, playcount: 0, privacyGlobal: doc.privacyGlobal !== false, lastFmUsername: doc.lastFmUsername };
        }
      });
      const fullResults = (await Promise.all(checks))
        .filter(item => item && item.playcount > 0)
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
      const displayResults = buildDisplayResults(fullResults, results, message.author.id, pagination.limit, pagination.page);
      const lines = displayResults.map((item, index) => {
        const displayName = resolveGlobalDisplay(item, message.client);
        const safeLabel = pickSafeName(displayName, item.lastFmUsername);
        const profileUrl = item.privacyGlobal && item.lastFmUsername ? buildUserUrl(item.lastFmUsername) : null;
        const linkedName = profileUrl ? `[${safeLabel}](${profileUrl})` : safeLabel;
        const name = item.discordId === message.author.id ? `**${linkedName}**` : linkedName;
        const rankValue = Number.isFinite(item.rank) ? item.rank : index + 1;
        const rank = `${rankValue}.`;
        if (rankValue === 1) {
          return `👑 ${name} - **${item.playcount}** plays`;
        }
        const body = `${rank}${name} - **${item.playcount}** plays`;
        return item.discordId === message.author.id ? `__${rank}__${name} - **${item.playcount}** plays` : body;
      });
      const info = await lastFmRequest("artist.getinfo", { artist: artistName, autocorrect: 1 });
      const lastfmImage = pickLastFmImage(info?.artist?.image);
      const image = (await getSpotifyArtistImageSmart(artistName))
        || lastfmImage
        || (await getMusicBrainzArtistImage(artistName));
      const totalListeners = fullResults.length;
      const totalPlays = fullResults.reduce((sum, item) => sum + item.playcount, 0);
      const avgPlays = totalListeners ? Math.round(totalPlays / totalListeners) : 0;
      const baseFooter = `Global artist - ${totalListeners} listeners - ${totalPlays} plays - ${avgPlays} avg`;
      const notice = user.privacyGlobal === false
        ? "You're currently not globally visible - use '.privacy' to enable. "
        : "";
      if (modeData.mode === "image" && renderWhoKnows) {
        const imageResults = buildDisplayResults(fullResults, fullResults.slice(0, 10), message.author.id, 10, 1);
        const rows = imageResults.map((item, index) => {
          const displayName = resolveGlobalDisplay(item, message.client);
          const safeLabel = pickSafeName(displayName, item.lastFmUsername);
          return {
            user: safeLabel,
            plays: item.playcount,
            highlight: item.discordId === message.author.id,
            rank: Number.isFinite(item.rank) ? item.rank : index + 1
          };
        });
        const imageBuffer = await renderWhoKnows({
          title: artistName,
          subtitle: "in Vinili & Caffè Bot",
          coverUrl: image,
          rows,
          footer: `Global artist - ${totalListeners} listeners - ${totalPlays} plays - ${avgPlays} avg`,
          badgeText: "WhoKnows",
          serverLabel: "in Vinili & Caffè Bot 🌐",
          showCrown: true,
          poweredByText: "Powered by Vinili & Caffè Bot"
        });
        if (imageBuffer) {
          const attachment = new AttachmentBuilder(imageBuffer, { name: "globalwhoknowsartist.png" });
          return safeChannelSend(message.channel, { files: [attachment] });
        }
      }
      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(`${artistName} globally`)
        .setURL(buildArtistUrl(artistName))
        .setThumbnail(image)
        .setDescription(lines.join("\n"))
        .setFooter({ text: notice + baseFooter });
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





