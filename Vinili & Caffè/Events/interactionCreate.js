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
            global.logger.error(err);
            try {
                const errorChannelId = IDs.channels.errorLogChannel;
                const errorChannel = errorChannelId
                    ? client.channels.cache.get(errorChannelId)
                    : null;
                if (errorChannel) {
                    const rawErrorText =
                        err?.stack?.slice(0, 1900) ||
                        err?.message ||
                        '<:vegax:1443934876440068179> Errore sconosciuto';
                    const errorText =
                        rawErrorText.length > 1000 ? `${rawErrorText.slice(0, 1000)}...` : rawErrorText;
                    const cmdName = interaction?.commandName || interaction?.customId || 'unknown';
                    const userTag = interaction?.user?.tag || 'unknown';
                    const staffEmbed = new EmbedBuilder()
                        .setColor('#6f4e37')
                        .addFields(
                            { name: '<:dot:1443660294596329582> Comando', value: `\`\`\`${cmdName}\`\`\`` },
                            { name: '<:dot:1443660294596329582> Utente', value: `\`\`\`${userTag}\`\`\`` },
                            { name: '<:dot:1443660294596329582> Errore', value: `\`\`\`${errorText}\`\`\`` }
                        )
                        .setTimestamp();
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
            } catch (innerErr) {
                global.logger.error('[INTERACTION ERROR HANDLER] Failed to send error feedback:', innerErr);
            }
        }
    },
};
