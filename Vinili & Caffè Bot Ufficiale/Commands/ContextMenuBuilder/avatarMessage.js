const { safeReply, safeEditReply } = require('../../Utils/Moderation/interaction');
const { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName("Show Avatar")
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return safeReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.")
        ],
        flags: 1 << 6
      });
    }

    await interaction.deferReply();
    const messageAuthor = interaction.targetMessage?.author;
    const member = interaction.targetMessage?.member;
    if (!messageAuthor) {
      return safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Non riesco a trovare l'autore del messaggio.")
        ],
        flags: 1 << 6
      });
    }

    const avatarUrl = member?.displayAvatarURL({ size: 4096 }) || messageAuthor.displayAvatarURL({ size: 4096 });
    const authorLabel = member?.displayName || messageAuthor.tag;
    const embed = new EmbedBuilder()
      .setTitle("Server Avatar")
      .setImage(avatarUrl)
      .setAuthor({ name: authorLabel, iconURL: messageAuthor.displayAvatarURL() })
      .setColor("#6f4e37");

    return safeEditReply(interaction, { embeds: [embed] });
  }
};


