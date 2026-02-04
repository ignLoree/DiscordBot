const { safeReply } = require('../../Utils/Moderation/interaction');
const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { hasAnyRole } = require('../../Utils/Moderation/permissions');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Partnership')
        .setType(ApplicationCommandType.Message),

    async execute(interaction) {
        if (!interaction.inGuild()) return;
        const categoryId = interaction.channel?.parentId || interaction.channel?.parent?.id;
        if (categoryId !== '1442569056795230279') {
            return safeReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Questo comando Ã¨ disponibile solo nella categoria ticket.')
                        .setColor("Red")
                ],
                flags: 1 << 6
            });
        }
        const manager = interaction.targetMessage?.author;
        if (!manager) return;
        const allowedRoles = ['1442568905582317740'];
        const hasAllowedRole = hasAnyRole(interaction.member, allowedRoles);
        if (!hasAllowedRole) {
            return safeReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando!')
                        .setColor("Red")
                ],
                flags: 1 << 6
            });
        }
        const modal = new ModalBuilder()
            .setCustomId(`partnershipModal_${manager.id}`)
            .setTitle('Invia Partnership');
        const descriptionInput = new TextInputBuilder()
            .setCustomId('serverDescription')
            .setLabel("Descrizione del server")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Inserisci qui la descrizione del server...")
            .setRequired(true);
        const messageContent = (interaction.targetMessage?.content || '').trim();
        if (messageContent) {
            descriptionInput.setValue(messageContent.slice(0, 4000));
        } else {
            const embedDesc = interaction.targetMessage?.embeds?.[0]?.description || '';
            if (embedDesc) {
                descriptionInput.setValue(String(embedDesc).slice(0, 4000));
            }
        }
        const row = new ActionRowBuilder().addComponents(descriptionInput);
        modal.addComponents(row);
        await interaction.showModal(modal);
    }
};


