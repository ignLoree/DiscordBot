const { EmbedBuilder } = require("discord.js");
const { lastFmRequest, DEFAULT_EMBED_COLOR } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessage } = require("../../Utils/Music/lastfmContext");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
module.exports = {
  skipPrefix: true,
  name: "update",
  async execute(message) {
    await message.channel.sendTyping();
    const user = await getLastFmUserForMessage(message, message.author);
    if (!user) return;
    try {
      await lastFmRequest("user.getinfo", { user: user.lastFmUsername });
      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setDescription("Dati Last.fm aggiornati.");
      return message.channel.send({ embeds: [embed] });
    } catch (error) {
   if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Errore durante l'aggiornamento.")
        ]
      });
    }
  }
};
