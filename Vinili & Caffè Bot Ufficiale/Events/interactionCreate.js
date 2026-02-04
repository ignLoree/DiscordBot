const { InteractionType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { handleAutocomplete, handleSlashCommand } = require('./interaction/commandHandlers');
const { handleButtonInteraction } = require('./interaction/buttonHandlers');
const { handlePartnerModal } = require('./interaction/partnerModal');
const { handleSuggestionVote } = require('./interaction/suggestionHandlers');
const { handleTicketInteraction } = require('./interaction/ticketHandlers');
const { handleDmBroadcastModal } = require('./interaction/dmBroadcastModal');
const { handleHelpMenu } = require('./interaction/helpHandlers');
const { handleLastFmInteraction } = require('./interaction/lastfmHandlers');
const { handleVerifyInteraction } = require('./interaction/verifyHandlers');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction) return;
        try {
            if (await handleHelpMenu(interaction)) return;
            if (await handleLastFmInteraction(interaction)) return;
            if (await handleVerifyInteraction(interaction)) return;
            if (await handleDmBroadcastModal(interaction, client)) return;
            if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
                await handleAutocomplete(interaction, client);
                return;
            }
            if (interaction.isMessageContextMenuCommand()) {
                await handleSlashCommand(interaction, client);
                return;
            }
            if (interaction.isChatInputCommand()) {
                await handleSlashCommand(interaction, client);
                return;
            }
            if (await handleTicketInteraction(interaction)) return;
            if (await handlePartnerModal(interaction)) return;
            if (await handleSuggestionVote(interaction)) return;
            if (await handleButtonInteraction(interaction, client)) return;
        } catch (err) {
            global.logger.error(err);
        }
    },
};
