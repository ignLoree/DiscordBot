const { safeChannelSend } = require('../../Utils/Moderation/message');
const { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessage } = require("../../Utils/Music/lastfmContext");

module.exports = {
  skipPrefix: false,
  name: "privacy",
  async execute(message) {
    await message.channel.sendTyping();
    const user = await getLastFmUserForMessage(message, message.author);
    if (!user) return;

    const embed = new EmbedBuilder()
      .setColor(DEFAULT_EMBED_COLOR)
      .setTitle("Configuring your Global WhoKnows visibility")
      .setDescription(
        "**Global**\n" +
        "You are visible everywhere in global WhoKnows with your Last.fm username.\n\n" +
        "**Server**\n" +
        "You are not visible in global WhoKnows, but users in the same server will still see your name."
      );

    const select = new StringSelectMenuBuilder()
      .setCustomId(`lfm_privacy_select:${message.author.id}`)
      .setPlaceholder("Select privacy level")
      .addOptions(
        { label: "Global", value: "global", default: user.privacyGlobal === true },
        { label: "Server", value: "server", default: user.privacyGlobal === false }
      );

    const row = new ActionRowBuilder().addComponents(select);
    return safeChannelSend(message.channel, { embeds: [embed], components: [row] });
  }
};


