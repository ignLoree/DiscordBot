const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

const getDevIds = (client) => {
  const raw =
    client.config2?.developers ??
    client.config?.developers ??
    client.config?.devid ??
    client.config2?.devid ??
    "";
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id).trim()).filter(Boolean);
  }
  return String(raw)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
};

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
    ),

  async execute(interaction, client) {
    const devIds = getDevIds(client);
    if (!devIds.includes(interaction.user.id)) {
      return interaction.reply({
        content: "<:vegax:1443934876440068179> Questo comando è disponibile solo al developer del bot.",
        flags: 1 << 6
      });
    }

    const targetUser = interaction.options.getUser("utente");
    const targetId = targetUser?.id;
    const modal = new ModalBuilder()
      .setCustomId(`dm_broadcast:${interaction.user.id}:${targetId || "all"}`)
      .setTitle("DM Broadcast");

    const titleInput = new TextInputBuilder()
      .setCustomId("title")
      .setLabel("Titolo")
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