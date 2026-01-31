const { EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm, extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const { buildStreaksEmbed, buildStreaksComponents } = require("../../Utils/Music/streaksView");
const LastFmStreak = require("../../Schemas/LastFm/streakSchema");

module.exports = {
  skipPrefix: false,
  name: "streaks",
  aliases: ["strs"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, args);
    const pagination = extractPagination(filteredArgs, { defaultLimit: 5, maxLimit: 20 });
    const artistFilterRaw = pagination.args.join(" ").trim();
    const artistFilter = artistFilterRaw ? artistFilterRaw.toLowerCase() : null;
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;

    try {
      const entries = await LastFmStreak.find({ userId: target.id })
        .sort({ createdAt: -1 })
        .lean();

      const filteredEntries = artistFilter
        ? entries.filter(entry => String(entry.artistName || "").toLowerCase() === artistFilter)
        : entries;

      if (!filteredEntries.length) {
        const embed = new EmbedBuilder()
          .setColor(DEFAULT_EMBED_COLOR)
          .setDescription("<:vegax:1443934876440068179> No saved streaks found for this user.");
        if (artistFilterRaw) {
          embed.setFooter({ text: "Filtering to artist '" + artistFilterRaw + "'" });
        }
        return message.channel.send({ embeds: [embed] });
      }

      const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pagination.limit));
      const page = Math.min(totalPages, Math.max(1, pagination.page));
      const start = (page - 1) * pagination.limit;
      const pageEntries = filteredEntries.slice(start, start + pagination.limit);

      const embed = buildStreaksEmbed({ entries: pageEntries });
      if (artistFilterRaw) {
        embed.setFooter({ text: "Filtering to artist '" + artistFilterRaw + "'" });
      }
      const sent = await message.channel.send({ embeds: [embed] });
      const components = buildStreaksComponents({ page, totalPages, messageId: sent.id });
      if (components.length) {
        await sent.edit({ components });
        if (!message.client.streaksStates) {
          message.client.streaksStates = new Map();
        }
        message.client.streaksStates.set(sent.id, {
          userId: message.author.id,
          entries: filteredEntries,
          page,
          limit: pagination.limit,
          totalPages,
          expiresAt: Date.now() + 30 * 60 * 1000
        });
      }
      return null;
    } catch (error) {
      if (handleLastfmError(message, error)) return null;
      global.logger.error(error);
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante il recupero delle streak salvate.")
        ]
      });
    }
  }
};
