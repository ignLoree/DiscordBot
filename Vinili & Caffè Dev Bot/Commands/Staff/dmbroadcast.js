const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dmbroadcast")
    .setDescription("Invia un DM a tutti gli utenti (escluso staff)")
    .setDMPermission(false)
    .addUserOption(option =>
      option
        .setName("utente")
        .setDescription("Invia il DM solo a un utente specifico")
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName("user_id")
        .setDescription("Invia il DM a un utente tramite ID")
        .setRequired(false)
    ),

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

    const targetUser = interaction.options.getUser("utente");
    const targetIdRaw = interaction.options.getString("user_id");
    const targetId = targetUser?.id || (targetIdRaw ? targetIdRaw.trim() : null);
    const modal = new ModalBuilder()
      .setCustomId(`dm_broadcast:${interaction.user.id}:${targetId || "all"}`)
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
