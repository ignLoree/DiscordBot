const { safeReply } = require('../../Utils/Moderation/reply');
const { EmbedBuilder, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
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
        const userRoles = ['1442568949605597264'];
        let managerMember = interaction.guild?.members?.cache?.get(manager.id) || null;
        if (!managerMember) {
            try {
                managerMember = await interaction.guild.members.fetch(manager.id);
            } catch {
                managerMember = null;
            }
        }
        const hasUserRole = managerMember ? hasAnyRole(managerMember, userRoles) : false;
        if (!hasUserRole) {
            return safeReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setDescription("<:vegax:1443934876440068179> Questo utente non è verificato, fagli effettuare prima la verifica e poi riprova!")
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

