const { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, } = require("discord.js");
const { safeReply } = require("../../Utils/Moderation/reply");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const IDs = require("../../Utils/Config/ids");
const {
  isChannelInTicketCategory,
} = require("../../Utils/Ticket/ticketCategoryUtils");

const EPHEMERAL_FLAG = 1 << 6;

function buildErrorEmbed(message) {
  return new EmbedBuilder().setDescription(message).setColor("Red");
}

function stripOuterCodeBlock(text) {
  if (!text) return "";

  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```$/);
  if (match?.[1]) return match[1].trim();

  return trimmed.replace(/^```/, "").replace(/```$/, "").trim();
}

function extractDescription(message) {
  if (!message) return "";

  const firstEmbed = message.embeds?.[0];
  const content = (message.content || "").trim();
  const embedDescription = (firstEmbed?.description || "").trim();
  const source = embedDescription || content;
  if (!source) return "";

  const normalized = source
    .replace(/^\*\*manager:\*\*\s*<@!?(\d+)>\s*/i, "")
    .replace(/^\*\*manager partner:\*\*\s*<@!?(\d+)>\s*/i, "")
    .trim();

  return stripOuterCodeBlock(normalized).trim();
}

async function isValidContext(interaction) {
  const channelId = interaction.channel?.id;
  const isPartnershipChannel =
    channelId === IDs.channels.partnerships ||
    channelId === IDs.channels.partnersChat;

  const ticketDoc = await Ticket.findOne({
    guildId: interaction.guild.id,
    channelId,
    open: true,
  })
    .lean()
    .catch(() => null);

  const isPartnershipTicket = ticketDoc?.ticketType === "partnership";
  const inTicketCategory = isChannelInTicketCategory(interaction.channel);

  return isPartnershipChannel || isPartnershipTicket || inTicketCategory;
}

module.exports = {
  expectsModal: true,
  data: new ContextMenuCommandBuilder()
    .setName("Partnership")
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    if (!interaction.inGuild()) return;

    const canRun = await isValidContext(interaction);
    if (!canRun) {
      return safeReply(interaction, {
        embeds: [
          buildErrorEmbed(
            "<:vegax:1443934876440068179> Questo comando è disponibile solo nei ticket partnership o nel canale partnership.",
          ),
        ],
        flags: EPHEMERAL_FLAG,
      });
    }

    const managerId = String(interaction.targetMessage?.author?.id || "");
    if (!managerId) {
      return safeReply(interaction, {
        embeds: [
          buildErrorEmbed(
            "<:vegax:1443934876440068179> Non riesco a leggere l'autore del messaggio selezionato.",
          ),
        ],
        flags: EPHEMERAL_FLAG,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`partnershipModal_ctx_${interaction.user.id}_${managerId}`)
      .setTitle("Invia Partnership");

    const descriptionInput = new TextInputBuilder()
      .setCustomId("serverDescription")
      .setLabel("Descrizione del server")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Inserisci qui la descrizione del server...")
      .setRequired(true);

    const extractedDescription = extractDescription(interaction.targetMessage);
    if (extractedDescription) {
      descriptionInput.setValue(extractedDescription.slice(0, 4000));
    }

    modal.addComponents(new ActionRowBuilder().addComponents(descriptionInput));

    try {
      await interaction.showModal(modal);
    } catch (error) {
      if (error?.code === 10062) return;
      return safeReply(interaction, {
        embeds: [
          buildErrorEmbed(
            "<:vegax:1443934876440068179> Non riesco ad aprire il modulo, riprova.",
          ),
        ],
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};
