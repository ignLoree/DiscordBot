const { safeReply } = require('../../Utils/Moderation/interaction');
const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

const getDevIds = (client) => {
  const raw =
    client.config2?.developers ??
    client.config?.developers ??
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
    )
    .addBooleanOption(option =>
      option
        .setName("all")
        .setDescription("Conferma invio a tutti (usa solo se non imposti utente)")
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const devIds = getDevIds(client);
    if (!devIds.includes(interaction.user.id)) {
      return safeReply(interaction, {
        content: "<:vegax:1443934876440068179> Questo comando è disponibile solo al developer del bot.",
        flags: 1 << 6
      });
    }

    const targetUser = interaction.options.getUser("utente");
    const confirmAll = interaction.options.getBoolean("all") === true;
    if (!targetUser && !confirmAll) {
      return safeReply(interaction, {
        content: "<:vegax:1443934876440068179> Per sicurezza, senza `utente` devi impostare `all: true`.",
        flags: 1 << 6
      });
    }
    const targetId = targetUser?.id;
    const modal = new ModalBuilder()
      .setCustomId(`dm_broadcast:${interaction.user.id}:${targetId || "all"}:${confirmAll ? "1" : "0"}`)
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
