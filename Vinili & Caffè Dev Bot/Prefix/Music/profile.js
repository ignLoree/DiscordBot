const { EmbedBuilder } = require("discord.js");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm } = require("../../Utils/Music/lastfmPrefix");
const { buildProfilePayload } = require("../../Utils/Music/lastfmProfile");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
module.exports = {
  skipPrefix: true,
  name: "profile",
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, lastfm } = extractTargetUserWithLastfm(message, args);
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;
    try {
      const payload = await buildProfilePayload({
        lastFmUsername: user.lastFmUsername,
        numberFormat: user.localization?.numberFormat
      });
      if (payload.error) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(payload.error)
          ]
        });
      }
      return message.channel.send({
        embeds: [payload.embed],
        components: payload.components
      });
    } catch (error) {
   if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Errore durante il recupero dei dati di Last.fm.")
        ]
      });
    }
  }
};
