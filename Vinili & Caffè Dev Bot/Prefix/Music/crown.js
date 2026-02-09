const { safeChannelSend } = require('../../Utils/Moderation/message');
const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { DEFAULT_EMBED_COLOR, lastFmRequest } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessage } = require("../../Utils/Music/lastfmContext");
const { resolveArtistName } = require("../../Utils/Music/lastfmResolvers");
const { extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { updateCrown, getCrownByArtist, formatRelative } = require("../../Utils/Music/crowns");
const { getSpotifyArtistImage } = require("../../Utils/Music/spotify");
const { handleLastfmError, sendArtistNotFound } = require("../../Utils/Music/lastfmError");
let renderWhoKnows = null;
try {
  renderWhoKnows = require("../../Utils/Render/whoknowsCanvas");
} catch (error) {
   if (handleLastfmError(message, error)) return;
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
    const displayName = member?.displayName || member?.user?.username || member?.user?.username || "Sconosciuto";
    const name = item.discordId === highlightId
      ? `**${displayName}**`
      : displayName;
    return `${index + 1}. ${name} - **${item.playcount}** plays`;
  });
}
async function renderCrownImage({ artistName, lines, footer, coverUrl, guildName, crownText }) {
  if (!canvasModule) return null;
  const { createCanvas, loadImage } = canvasModule;
  const padding = 24;
  const titleSize = 24;
  const lineSize = 16;
  const footerSize = 13;
  const lineHeight = 22;
  const coverSize = 170;
  const coverGap = 18;
  const textWidth = 520;
  const width = padding * 2 + textWidth + coverSize + coverGap;
  const height = padding * 2 + titleSize + 10 + lines.length * lineHeight + 20 + footerSize + 24;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#d7e6ff";
  ctx.font = `bold ${titleSize}px sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(artistName, padding, padding, textWidth);
  ctx.fillStyle = "#d9d9d9";
  ctx.font = `${lineSize}px sans-serif`;
  let y = padding + titleSize + 10;
  for (const line of lines) {
    ctx.fillText(line.replace(/\*\*/g, ""), padding, y, textWidth);
    y += lineHeight;
  }
  ctx.fillStyle = "#b0b0b0";
  ctx.font = `${footerSize}px sans-serif`;
  ctx.fillText(footer, padding, height - padding - footerSize - 20, textWidth);
  if (crownText) {
    ctx.fillStyle = "#cfcfcf";
    ctx.font = "12px sans-serif";
    ctx.fillText(crownText, padding, height - padding - 12, textWidth);
  }
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
  skipPrefix: true,
  name: "crown",
  aliases: ["cw"],
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
    const artistQuery = pagination.args.join(" ").trim();
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
      if (message.guild.members.cache.size < message.guild.memberCount) {
        try {
          await message.guild.members.fetch();
        } catch {
        }
      }
      const guildIds = message.guild.members.cache.map(member => member.id);
      const allUsers = await LastFmUser.find({
        discordId: { $in: guildIds },
        privacyGlobal: true
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
            playcount
          };
        } catch (error) {
   if (handleLastfmError(message, error)) return;
          return {
            discordId: doc.discordId,
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
      if (results[0]) {
        await updateCrown({
          guildId: message.guild.id,
          artistName,
          holderId: results[0].discordId,
          playcount: results[0].playcount
        });
      }
      const crown = await getCrownByArtist(message.guild.id, artistName);
      if (!crown) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor(DEFAULT_EMBED_COLOR)
              .setDescription("Nessuna crown per questo artista. Usa .whoknows per iniziare a ottenerle.")
          ]
        });
      }
      const info = await lastFmRequest("artist.getinfo", {
        artist: artistName,
        autocorrect: options.noredirect ? 0 : 1
      });
      const artist = info?.artist;
      let image = artist?.image?.find(img => img.size === "extralarge")?.["#text"]
        || artist?.image?.find(img => img.size === "large")?.["#text"]
        || null;
      if (!image) {
        image = await getSpotifyArtistImage(artist?.name || artistName);
      }
      const totalListeners = fullResults.length;
      const totalPlays = fullResults.reduce((sum, item) => sum + item.playcount, 0);
      const avgPlays = totalListeners ? Math.round(totalPlays / totalListeners) : 0;
      const requesterEntry = fullResults.find(item => item.discordId === message.author.id);
      const requesterRank = requesterEntry ? fullResults.indexOf(requesterEntry) + 1 : null;
      const requesterPlays = requesterEntry?.playcount || 0;
      const youLine = requesterEntry
        ? ` - You: ${requesterPlays} plays${requesterRank ? ` (#${requesterRank})` : ""}`
        : "";
      const footer = `Artist - ${totalListeners} listeners - ${totalPlays} plays - ${avgPlays} avg${youLine} ︲ Pagina: ${pagination.page} ︲ Limite: ${pagination.limit}`;
      const crownMember = message.guild.members.cache.get(crown.holderId);
      const crownName = crownmember?.displayName || member?.user?.username || crownMember?.user?.username || "Sconosciuto";
      const crownText = `Crown claimed by ${crownName}`;
      const lines = buildLeaderboardLines(results, message.guild, message.author.id);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`lfm_crownhistory:${crown.id}`)
          .setLabel("Crown history")
          .setStyle(ButtonStyle.Secondary)
      );
      if (options.mode === "image" && renderWhoKnows) {
        const rows = results.map((item) => {
          const member = message.guild.members.cache.get(item.discordId);
          const displayName = member?.displayName || member?.user?.username || member?.user?.username || "Sconosciuto";
          return { user: displayName, plays: item.playcount };
        });
        const imageBuffer = await renderWhoKnows({
          title: artistName,
          subtitle: `in ${message.guild.name}`,
          coverUrl: image,
          rows,
          footer: `Artist - ${totalListeners} listeners - ${totalPlays} plays - ${avgPlays} avg${youLine} | Page ${pagination.page} | Limit ${pagination.limit} | ${crownText}`
        });
        if (imageBuffer) {
          const attachment = new AttachmentBuilder(imageBuffer, { name: "crown.png" });
          const embed = new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setImage("attachment://crown.png");
          return safeChannelSend(message.channel, { files: [attachment], components: [row] });
        }
      }
      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(`${artistName} in ${message.guild.name}`)
        .setThumbnail(image)
        .setDescription(lines.join("\n"))
        .setFooter({ text: `${footer} | ${crownText}` });
      return safeChannelSend(message.channel, { embeds: [embed], components: [row] });
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


