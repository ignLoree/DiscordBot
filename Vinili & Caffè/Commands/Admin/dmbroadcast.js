const { safeReply, safeEditReply } = require('../../Utils/Moderation/reply');
const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const IDs = require('../../Utils/Config/ids');

const getDevIds = (client) => {
  const fromIds = String(
    IDs?.guilds?.developers
    || IDs?.developers
    || ""
  )
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const raw = client.config?.developers ?? "";
  const fromConfig = Array.isArray(raw)
    ? raw.map((id) => String(id).trim()).filter(Boolean)
    : String(raw)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

  return Array.from(new Set([...fromIds, ...fromConfig]));
};

module.exports = {
  expectsModal: true,
  data: new SlashCommandBuilder()
    .setName("dmbroadcast")
    .setDescription("Invia un DM a tutti gli utenti")
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
        .setDescription("Conferma invio a tutti")
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const devId = '295500038401163264';
    if (devId && interaction?.author?.id !== devId) {
      return safeEditReply(interaction, {
        embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Solo il developer può usare questo comando.')],
        allowedMentions: { repliedUser: false }
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
      .setMaxLength(4000);

    const messageInput = new TextInputBuilder()
      .setCustomId("message")
      .setLabel("Messaggio")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(4000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(messageInput)
    );

    try {
      await interaction.showModal(modal);
    } catch (error) {
      if (error?.code === 10062) return;
      return safeReply(interaction, {
        content: "<:vegax:1443934876440068179> Non riesco ad aprire il modulo, riprova.",
        flags: 1 << 6
      });
    }
  }
};
