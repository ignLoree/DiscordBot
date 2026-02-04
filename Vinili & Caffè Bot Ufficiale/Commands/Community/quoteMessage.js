const { ContextMenuCommandBuilder, ApplicationCommandType, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const renderQuoteCanvas = require("../../Utils/Render/quoteCanvas");

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName("Quote")
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.")
        ],
        flags: 1 << 6
      });
    }

    await interaction.deferReply();
    const targetMessage = interaction.targetMessage;
    const text = targetMessage?.content || "";
    const author = targetMessage?.author;
    if (!author || !text) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:attentionfromvega:1443651874032062505> Il messaggio selezionato non ha testo.")
        ]
      });
    }

    const avatarUrl = author.displayAvatarURL({ extension: "png", size: 512 });
    const username = author.username;
    let buffer;
    try {
      buffer = await renderQuoteCanvas({
        avatarUrl,
        message: text,
        username
      });
    } catch {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Impossibile creare il canvas.")
        ]
      });
    }

    const attachment = new AttachmentBuilder(buffer, { name: "quote.png" });
    return interaction.editReply({ files: [attachment] });
  }
};
