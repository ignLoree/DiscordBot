const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction || interaction.replied || interaction.deferred) return;

        try {
            const handleVerify = require('./interaction/verifyHandlers');
            const handleTicket = require('./interaction/ticketHandlers');

            if (await handleVerify.handleVerifyInteraction(interaction)) return;
            if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
                const { checkButtonPermission, checkStringSelectPermission, buildGlobalPermissionDeniedEmbed } = require('../Utils/Moderation/commandPermissions');
                const gate = interaction.isButton() ? await checkButtonPermission(interaction) : await checkStringSelectPermission(interaction);
                if (!gate.allowed) {
                    const embed = buildGlobalPermissionDeniedEmbed(gate.requiredRoles || [], interaction.isButton() ? 'bottone' : 'menu');
                    if (interaction.isRepliable?.()) await interaction.reply({ embeds: [embed], flags: 1 << 6 }).catch(() => {});
                    return;
                }
            }
            if (await handleTicket.handleTicketInteraction(interaction)) return;
        } catch (err) {
            global.logger.error('[Bot Test] interactionCreate', err);
            if (interaction?.isRepliable?.()) {
                await interaction.reply({ content: '<:vegax:1443934876440068179> Errore.', flags: 1 << 6 }).catch(() => {});
            }
        }
    }
};
