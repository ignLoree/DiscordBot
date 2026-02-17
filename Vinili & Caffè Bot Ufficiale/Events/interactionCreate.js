const { InteractionType, EmbedBuilder } = require('discord.js');
const { handleAutocomplete, handleSlashCommand } = require('./interaction/commandHandlers');
const { handleButtonInteraction } = require('./interaction/buttonHandlers');
const { handlePartnerModal } = require('./interaction/partnerModal');
const { handleSuggestionVote } = require('./interaction/suggestionHandlers');
const { handleTicketInteraction } = require('./interaction/ticketHandlers');
const { handleDmBroadcastModal } = require('./interaction/dmBroadcastModal');
const { handleVerifyInteraction } = require('./interaction/verifyHandlers');
const { handleCustomRoleInteraction } = require('./interaction/customRoleHandlers');
const { handlePauseButton } = require('./interaction/pauseHandlers');
const { handleEmbedBuilderInteraction } = require('./interaction/embedBuilderHandlers');
const IDs = require('../Utils/Config/ids');
const { buildErrorLogEmbed } = require('../Utils/Logging/errorLogEmbed');
const {
    checkButtonPermission,
    checkStringSelectPermission,
    checkModalPermission,
    buildGlobalPermissionDeniedEmbed,
    buildGlobalNotYourControlEmbed
} = require('../Utils/Moderation/commandPermissions');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction) return;
        if (interaction.replied || interaction.deferred) return;
        try {
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
            if (interaction.isButton && interaction.isButton()) {
                const gate = await checkButtonPermission(interaction);
                if (!gate.allowed) {
                    const deniedEmbed = gate.reason === 'not_owner'
                        ? buildGlobalNotYourControlEmbed()
                        : gate.reason === 'mono_guild'
                            ? buildGlobalPermissionDeniedEmbed([], 'bottone', 'Questo bot è utilizzabile solo sul server principale e sul server test di Vinili & Caffè.')
                            : buildGlobalPermissionDeniedEmbed(gate.requiredRoles || [], 'bottone');
                    const payload = { embeds: [deniedEmbed], flags: 1 << 6 };
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply(payload).catch(() => {});
                    } else {
                        await interaction.followUp(payload).catch(() => {});
                    }
                    return;
                }
            }
            if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
                const gate = await checkStringSelectPermission(interaction);
                if (!gate.allowed) {
                    const deniedEmbed = gate.reason === 'not_owner'
                        ? buildGlobalNotYourControlEmbed()
                        : gate.reason === 'mono_guild'
                            ? buildGlobalPermissionDeniedEmbed([], 'menu', 'Questo bot è utilizzabile solo sul server principale e sul server test di Vinili & Caffè.')
                            : buildGlobalPermissionDeniedEmbed(gate.requiredRoles || [], 'menu');
                    const payload = { embeds: [deniedEmbed], flags: 1 << 6 };
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply(payload).catch(() => {});
                    } else {
                        await interaction.followUp(payload).catch(() => {});
                    }
                    return;
                }
            }
            if (interaction.isModalSubmit && interaction.isModalSubmit()) {
                const gate = await checkModalPermission(interaction);
                if (!gate.allowed) {
                    const deniedEmbed = gate.reason === 'not_owner'
                        ? buildGlobalNotYourControlEmbed()
                        : gate.reason === 'mono_guild'
                            ? buildGlobalPermissionDeniedEmbed([], 'modulo', 'Questo bot è utilizzabile solo sul server principale e sul server test di Vinili & Caffè.')
                            : buildGlobalPermissionDeniedEmbed(gate.requiredRoles || [], 'modulo');
                    const payload = { embeds: [deniedEmbed], flags: 1 << 6 };
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply(payload).catch(() => {});
                    } else {
                        await interaction.followUp(payload).catch(() => {});
                    }
                    return;
                }
            }
            if (await handleTicketInteraction(interaction)) return;
            if (await handleEmbedBuilderInteraction(interaction, client)) return;
            if (await handlePartnerModal(interaction)) return;
            if (await handleSuggestionVote(interaction)) return;
            if (await handlePauseButton(interaction)) return;
            if (await handleCustomRoleInteraction(interaction)) return;
            if (await handleButtonInteraction(interaction, client)) return;
        } catch (err) {
            try {
                const errorChannelId = IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
                const errorChannel = errorChannelId
                    ? client.channels.cache.get(errorChannelId)
                    : null;
                if (errorChannel) {
                    const contextValue = interaction?.commandName || interaction?.customId || 'unknown';
                    const staffEmbed = buildErrorLogEmbed({
                        contextLabel: 'Contesto',
                        contextValue,
                        userTag: interaction?.user?.tag || 'unknown',
                        error: err
                    });
                    await errorChannel.send({ embeds: [staffEmbed] });
                }
                if (interaction?.isRepliable?.()) {
                    const payload = {
                        content: '<:vegax:1443934876440068179>  C\'è stato un errore nell\'esecuzione del comando.',
                        flags: 1 << 6
                    };
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply(payload);
                    } else {
                        await interaction.followUp(payload);
                    }
                }
            } catch (nestedErr) {
                global.logger?.error?.('[interactionCreate] nested error handling failed', nestedErr);
            }
        }
    },
};
