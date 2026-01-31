const { EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR } = require("../../Utils/Music/lastfm");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
module.exports = {
  skipPrefix: true,
  name: "outofsync",
  async execute(message) {
    await message.channel.sendTyping();
    const embed = new EmbedBuilder()
      .setColor(DEFAULT_EMBED_COLOR)
      .setDescription("Se Last.fm non si aggiorna, verifica l'integrazione con Spotify o prova update.");
    return message.channel.send({ embeds: [embed] });
  }
};
