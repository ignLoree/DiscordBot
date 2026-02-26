const { safeReply } = require("../../Utils/Moderation/reply");
const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, } = require("discord.js");

const EPHEMERAL_FLAG = 1 << 6;

module.exports = {
  expectsModal: true,
  data: new SlashCommandBuilder()
    .setName("dmbroadcast")
    .setDescription("Invia un DM a tutti gli utenti")
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName("utente")
        .setDescription("Invia il DM solo a un utente specifico")
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("all")
        .setDescription("Conferma invio a tutti")
        .setRequired(false),
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("utente");
    const confirmAll = interaction.options.getBoolean("all") === true;

    if (!targetUser && !confirmAll) {
      return safeReply(interaction, {
        content:
          "<:vegax:1443934876440068179> Per sicurezza, senza `utente` devi impostare `all: true`.",
        flags: EPHEMERAL_FLAG,
      });
    }

    const customId = `dm_broadcast:${interaction.user.id}:${targetUser?.id || "all"}:${confirmAll ? "1" : "0"}`;
    const modal = new ModalBuilder()
      .setCustomId(customId)
      .setTitle("DM Broadcast");

    const titleInput = new TextInputBuilder()
      .setCustomId("title")
      .setLabel("Titolo")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(4000);

    const messageInput = new TextInputBuilder()
      .setCustomId("message")
      .setLabel("Messaggio")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(4000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(messageInput),
    );

    try {
      await interaction.showModal(modal);
    } catch (error) {
      if (error?.code === 10062) return;
      return safeReply(interaction, {
        content:
          "<:vegax:1443934876440068179> Non riesco ad aprire il modulo, riprova.",
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};