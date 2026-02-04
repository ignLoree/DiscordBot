const { safeChannelSend } = require('../../Utils/Moderation/message');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { getLastFmUserForMessage } = require("../../Utils/Music/lastfmContext");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");

module.exports = {
  skipPrefix: false,
  name: "fmmode",
  aliases: ["fmm", "fmmodes"],
  async execute(message) {
    await message.channel.sendTyping();
    const user = await getLastFmUserForMessage(message, message.author);
    if (!user) return;
    try {
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(
          "Pick which mode you want to modify:\n\n" +
          "â€¢ \`fm\` mode - Changes how your .fm command looks\n" +
          "â€¢ Response mode - changes default response to \`WhoKnows\` and top list commands"
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("lfm_fmmode_button")
          .setLabel("'.fm' mode")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("lfm_responsemode_button")
          .setLabel("Response mode")
          .setStyle(ButtonStyle.Secondary)
      );
      return safeChannelSend(message.channel, { embeds: [embed], components: [row] });
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Errore durante la configurazione della fm mode.")
        ]
      });
    }
  }
};


