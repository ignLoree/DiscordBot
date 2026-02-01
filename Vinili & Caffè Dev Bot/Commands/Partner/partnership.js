const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { hasAnyRole } = require('../../Utils/Moderation/permissions');

module.exports = {
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
        const allowedRoles = ['1442568905582317740']
        const hasAllowedRole = hasAnyRole(interaction.member, allowedRoles);
        if (!hasAllowedRole && !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando!')
                        .setColor("Red")
                ],
                flags: 1 << 6
            });
        }
        const userRoles = ['1442568949605597264']
        const hasUserRole = hasAnyRole(interaction.manager, userRoles);
        if (!hasUserRole) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Questo utente non è verificato, fagli effettuare prima la verifica e poi riprova!')
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
        const row = new ActionRowBuilder().addComponents(descriptionInput);
        modal.addComponents(row);
        await interaction.showModal(modal);
    }
}