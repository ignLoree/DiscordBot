const { EmbedBuilder } = require('discord.js');
const IDs = require('../Utils/Config/ids');
const { safeReply } = require('../Utils/Moderation/reply');
const { buildErrorLogEmbed } = require('../Utils/Logging/errorLogEmbed');

const MAIN_GUILD_ID = IDs.guilds?.main || null;
const TEST_GUILD_ID = IDs.guilds?.test || '1462458562507964584';

function isSponsorGuild(guildId) {
    const list = IDs.guilds?.sponsorGuildIds || [];
    return Array.isArray(list) && list.includes(guildId);
}

function isAllowedGuildTest(guildId) {
    if (!guildId) return false;
    if (guildId === MAIN_GUILD_ID) return false;
    return guildId === TEST_GUILD_ID || isSponsorGuild(guildId);
}


module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction || interaction.replied || interaction.deferred) return;
        if (interaction.guildId && !isAllowedGuildTest(interaction.guildId)) return;
        if (!interaction.guildId && (interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isModalSubmit?.())) {
            if (interaction.isRepliable?.()) await interaction.reply({ content: 'Questo comando va usato in un server.', flags: 1 << 6 }).catch(() => {});
            return;
        }

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
            try {
                const errorChannelId = IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
                const errorChannel = errorChannelId
                    ? (client.channels.cache.get(errorChannelId) || await client.channels.fetch(errorChannelId).catch(() => null))
                    : null;
                if (errorChannel?.isTextBased?.()) {
                    const contextValue = interaction?.commandName || interaction?.customId || 'unknown';
                    const staffEmbed = buildErrorLogEmbed({
                        contextLabel: 'Contesto',
                        contextValue,
                        userTag: interaction?.user?.tag || 'unknown',
                        error: err
                    });
                    await errorChannel.send({ embeds: [staffEmbed] }).catch(() => {});
                }
            } catch (logErr) {
                global.logger.error('[Bot Test] interactionCreate error-log', logErr);
            }
            if (interaction?.isRepliable?.()) {
                await safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Red')
                            .setDescription('<:vegax:1472992044140990526> Errore durante l\'esecuzione dell\'interazione.')
                    ],
                    flags: 1 << 6
                });
            }
        }
    }
};
