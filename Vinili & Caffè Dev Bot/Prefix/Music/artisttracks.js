const { EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, lastFmRequest, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm } = require("../../Utils/Music/lastfmPrefix");
const { resolveArtistName } = require("../../Utils/Music/lastfmResolvers");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { buildArtistTopTracksEmbed, buildArtistTracksComponents } = require("./artistoverview");

module.exports = {
  skipPrefix: false,
  name: "artisttracks",
  aliases: ["artisttr", "atr"],
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
              .setDescription("Non riesco a trovare un artista valido.")
          ]
        });
      }
      const info = await lastFmRequest("artist.getinfo", {
        artist: artistName,
        username: user.lastFmUsername,
        autocorrect: noredirect ? 0 : 1
      });
      const playsByYou = Number(info?.artist?.stats?.userplaycount || 0);

      const displayName = message.guild?.members.cache.get(target.id)?.displayName
        || target.username
        || user.lastFmUsername;

      const result = await buildArtistTopTracksEmbed({
        artistName,
        lastFmUsername: user.lastFmUsername,
        displayName,
        page: 1,
        perPage: 10,
        totalPlays: playsByYou
      });
      const sent = await message.channel.send({ embeds: [result.embed] });
      const components = buildArtistTracksComponents(sent.id, result.page, result.totalPages);
      await sent.edit({ components });
      if (!message.client.artistTracksStates) message.client.artistTracksStates = new Map();
      message.client.artistTracksStates.set(sent.id, {
        userId: message.author.id,
        artistName,
        lastFmUsername: user.lastFmUsername,
        displayName,
        page: result.page,
        perPage: 10,
        totalPages: result.totalPages,
        totalPlays: playsByYou,
        fromOverview: false,
        overviewMessageId: null,
        expiresAt: Date.now() + 10 * 60 * 1000
      });
      if (!message.client.artistStates) message.client.artistStates = new Map();
      message.client.artistStates.set(sent.id, {
        userId: message.author.id,
        artistName,
        lastFmUsername: user.lastFmUsername,
        displayName,
        totalPlays: playsByYou,
        mainEmbed: null,
        expiresAt: Date.now() + 10 * 60 * 1000
      });

      return;
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setDescription("Errore durante il recupero delle top tracks artista.")
        ]
      });
    }
  }
};


