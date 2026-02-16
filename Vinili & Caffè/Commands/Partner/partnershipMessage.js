const { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { safeReply } = require('../../Utils/Moderation/reply');
const Ticket = require('../../Schemas/Ticket/ticketSchema');
const IDs = require('../../Utils/Config/ids');
const { isChannelInTicketCategory } = require('../../Utils/Ticket/ticketCategoryUtils');

module.exports = {
    expectsModal: true,
    data: new ContextMenuCommandBuilder()
        .setName('Partnership')
        .setType(ApplicationCommandType.Message),

    async execute(interaction) {
        if (!interaction.inGuild()) return;

        const channelId = interaction.channel?.id;
        const isPartnershipChannel = channelId === IDs.channels.partnerships || channelId === IDs.channels.partnersChat;
        const ticketDoc = await Ticket.findOne({ guildId: interaction.guild.id, channelId, open: true }).lean().catch(() => null);
        const isPartnershipTicket = ticketDoc?.ticketType === 'partnership';
        const isInTicketCategory = isChannelInTicketCategory(interaction.channel);

        if (!isPartnershipChannel && !isPartnershipTicket && !isInTicketCategory) {
            return safeReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Questo comando è disponibile solo nei ticket partnership o nel canale partnership.')
                        .setColor('Red')
                ],
                flags: 1 << 6
            });
        }

        const managerId = extractManagerId(interaction.targetMessage);
        if (!managerId) {
            return safeReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Non riesco a trovare il manager nel messaggio selezionato.')
                        .setColor('Red')
                ],
                flags: 1 << 6
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`partnershipModal_ctx_${interaction.user.id}_${managerId}`)
            .setTitle('Invia Partnership');

        const descriptionInput = new TextInputBuilder()
            .setCustomId('serverDescription')
            .setLabel('Descrizione del server')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Inserisci qui la descrizione del server...')
            .setRequired(true);

        const extractedDescription = extractDescription(interaction.targetMessage);
        if (extractedDescription) {
            descriptionInput.setValue(extractedDescription.slice(0, 4000));
        }

        const row = new ActionRowBuilder().addComponents(descriptionInput);
        modal.addComponents(row);

        try {
            await interaction.showModal(modal);
        } catch (error) {
            if (error?.code === 10062) return;
            return safeReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Non riesco ad aprire il modulo, riprova.')
                        .setColor('Red')
                ],
                flags: 1 << 6
            });
        }
    }
};

function extractManagerId(message) {
    if (!message) return null;
    const mentionRegex = /<@!?(\d+)>/;

    if (message.content) {
        const match = message.content.match(mentionRegex);
        if (match?.[1]) return match[1];
    }

    const firstEmbed = message.embeds?.[0];
    if (firstEmbed?.description) {
        const match = String(firstEmbed.description).match(mentionRegex);
        if (match?.[1]) return match[1];
    }

    if (firstEmbed?.fields?.length) {
        for (const field of firstEmbed.fields) {
            const value = `${field?.name || ''}\n${field?.value || ''}`;
            const match = value.match(mentionRegex);
            if (match?.[1]) return match[1];
        }
    }

    return message.author?.id || null;
}

function extractDescription(message) {
    if (!message) return '';
    const firstEmbed = message.embeds?.[0];
    const content = (message.content || '').trim();
    const embedDescription = (firstEmbed?.description || '').trim();
    const source = embedDescription || content;
    if (!source) return '';

    let normalized = source
        .replace(/^\*\*manager:\*\*\s*<@!?(\d+)>\s*/i, '')
        .replace(/^\*\*manager partner:\*\*\s*<@!?(\d+)>\s*/i, '')
        .trim();

    normalized = stripOuterCodeBlock(normalized);
    return normalized.trim();
}

function stripOuterCodeBlock(text) {
    if (!text) return '';
    const trimmed = text.trim();
    const match = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```$/);
    if (match?.[1]) return match[1].trim();
    return trimmed
        .replace(/^```/, '')
        .replace(/```$/, '')
        .trim();
}
