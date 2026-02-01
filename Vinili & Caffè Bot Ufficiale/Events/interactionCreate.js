const { InteractionType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { handleAutocomplete, handleSlashCommand } = require('./interaction/commandHandlers');
const { handleButtonInteraction } = require('./interaction/buttonHandlers');
const { handlePartnerModal } = require('./interaction/partnerModal');
const { handleSuggestionVote } = require('./interaction/suggestionHandlers');
const { handleTicketInteraction } = require('./interaction/ticketHandlers');
const { handlePassNav, handleClaimNode, handleChoosePath } = require('./interaction/passHandlers');
const { handlePassGameAnswer } = require('./interaction/passGameHandlers');
const { handleHelpMenu } = require('./interaction/helpHandlers');
const { handleEngagementAnswer } = require('./interaction/engagementHandlers');
const { handleLastFmInteraction } = require('./interaction/lastfmHandlers');
const { handleVerifyInteraction } = require('./interaction/verifyHandlers');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction) return;
        try {
            if (await handlePassNav(interaction)) return;
            if (await handleClaimNode(interaction)) return;
            if (await handleChoosePath(interaction)) return;
            if (await handlePassGameAnswer(interaction)) return;
            if (await handleEngagementAnswer(interaction)) return;
            if (await handleHelpMenu(interaction)) return;
            if (await handleLastFmInteraction(interaction)) return;
            if (await handleVerifyInteraction(interaction)) return;
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
