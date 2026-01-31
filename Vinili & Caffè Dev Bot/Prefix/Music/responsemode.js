const { EmbedBuilder } = require("discord.js");
const { getLastFmUserForMessage } = require("../../Utils/Music/lastfmContext");
const { buildResponseModePayload } = require("../../Utils/Music/lastfmResponseModeUi");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
module.exports = {
  skipPrefix: false,
  name: "responsemode",
  aliases: ["rm", "response"],
  async execute(message) {
    await message.channel.sendTyping();
    const user = await getLastFmUserForMessage(message, message.author);
    if (!user) return;
    try {
      const payload = buildResponseModePayload(user.responseMode);
      return message.channel.send(payload);
    } catch (error) {
   if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Errore durante la configurazione della response mode.")
        ]
      });
    }
  }
};
