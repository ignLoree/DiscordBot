const { InteractionType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { handleAutocomplete, handleSlashCommand } = require('./interaction/commandHandlers');
const { handleButtonInteraction } = require('./interaction/buttonHandlers');
const { handleHelpMenu } = require('./interaction/helpHandlers');
const { handleLastFmInteraction } = require('./interaction/lastfmHandlers');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction) return;
        try {
            if (await handleHelpMenu(interaction)) return;
            if (await handleLastFmInteraction(interaction)) return;
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
            if (await handleButtonInteraction(interaction, client)) return;
        } catch (err) {
            global.logger.error(err);
        }
    },
};
