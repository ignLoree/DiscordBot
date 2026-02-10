const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    expectsModal: true,
    data: new SlashCommandBuilder()
        .setName('partnership')
        .setDescription('Invia una partnership per il tuo server.')
        .addUserOption(option =>
            option
                .setName('manager')
                .setDescription('L\'utente con cui stai facendo la partnership.')
                .setRequired(true)
        ),

    async execute(interaction) {
        const manager = interaction.options.getUser('manager');

        const modal = new ModalBuilder()
            .setCustomId(`partnershipModal_${manager.id}`)
            .setTitle('Invia Partnership');

        const descriptionInput = new TextInputBuilder()
            .setCustomId('serverDescription')
            .setLabel('Descrizione del server')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Inserisci qui la descrizione del server...')
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(descriptionInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
    }
};
