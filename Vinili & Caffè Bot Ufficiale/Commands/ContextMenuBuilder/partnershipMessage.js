const { safeReply } = require('../../Utils/Moderation/reply');

const IDs = require('../../Utils/Config/ids');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Partnership')
        .setType(ApplicationCommandType.Message),

    async execute(interaction) {
        if (!interaction.inGuild()) return;
        const categoryId = interaction.channel?.parentId || interaction.channel?.parent?.id;
        if (categoryId !== IDs.channels.mediaExemptCategory) {
            return safeReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Questo comando è disponibile solo nella categoria ticket.')
                        .setColor("Red")
                ],
                flags: 1 << 6
            });
        }
        const manager = interaction.targetMessage?.author;
        if (!manager) return;
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



