const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dmbroadcast")
    .setDescription("Invia un DM a tutti gli utenti (escluso staff)")
    .setDMPermission(false),

  async execute(interaction, client) {
    const devIds = String(client.config?.developers || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (!devIds.includes(interaction.user.id)) {
      return interaction.reply({
        content: "<:vegax:1443934876440068179> Questo comando è disponibile solo al developer del bot.",
        flags: 1 << 6
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`dm_broadcast:${interaction.user.id}`)
      .setTitle("DM Broadcast");

    const titleInput = new TextInputBuilder()
      .setCustomId("title")
      .setLabel("Titolo (opzionale)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(100);

    const messageInput = new TextInputBuilder()
      .setCustomId("message")
      .setLabel("Messaggio")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1900);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(messageInput)
    );

    await interaction.showModal(modal);
  }
};
