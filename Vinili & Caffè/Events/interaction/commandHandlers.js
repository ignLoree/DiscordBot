const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const { safeReply: safeReplyHelper } = require('../../Utils/Moderation/reply');
const { applyDefaultFooterToEmbeds } = require('../../Utils/Embeds/defaultFooter');
const {
    checkSlashPermission,
    getSlashRequiredRoles,
    buildGlobalPermissionDeniedEmbed
} = require('../../Utils/Moderation/commandPermissions');
const { getUserCommandCooldownSeconds, consumeUserCooldown } = require('../../Utils/Moderation/commandCooldown');
const {
    buildCooldownErrorEmbed,
    buildBusyCommandErrorEmbed,
    buildCommandTimeoutErrorEmbed,
    buildInternalCommandErrorEmbed
} = require('../../Utils/Moderation/commandErrorEmbeds');
const { buildErrorLogEmbed } = require('../../Utils/Logging/errorLogEmbed');
const IDs = require('../../Utils/Config/ids');
const SLASH_COOLDOWN_BYPASS_ROLE_ID = IDs.roles.Staff;
const COMMAND_EXECUTION_TIMEOUT_MS = 60 * 1000;

/** Nome della categoria ticket (stesso usato in ticketHandlers) per consentire comandi Partner nelle chat ticket. */
const TICKETS_CATEGORY_NAME = '⁰⁰・ 　　　　    　    TICKETS 　　　    　    ・';

const PARTNER_LEADERBOARD_CHANNEL_IDS = new Set([
    IDs.channels?.partnersChat,
    IDs.channels?.staffCmds,
    IDs.channels?.highCmds
].filter(Boolean).map(String));
const STAFF_ALLOWED_CHANNEL_IDS = new Set([
    String(IDs.channels?.staffCmds || ''),
    String(IDs.channels?.highCmds || '')
].filter(Boolean));
/** Guild in cui le restrizioni canale per slash non si applicano (comandi usabili in qualsiasi canale). */
const GUILD_ALLOWED_COMMANDS_ANY_CHANNEL = IDs.guilds?.test || null;

function isChannelInTicketCategory(channel) {
    if (!channel?.guild?.channels?.cache) return false;
    const cache = channel.guild.channels.cache;
    const first = channel.parent ?? (channel.parentId ? cache.get(channel.parentId) : null);
    if (!first) return false;
    const category = first.type === ChannelType.GuildCategory ? first : (first.parentId ? cache.get(first.parentId) : null);
    return category && category.name === TICKETS_CATEGORY_NAME;
}

function getSlashChannelRestrictionError(commandName, command, channel) {
    if (!command || !channel) return null;
    if (GUILD_ALLOWED_COMMANDS_ANY_CHANNEL && channel.guild?.id === GUILD_ALLOWED_COMMANDS_ANY_CHANNEL) return null;
    const category = String(command.category || '').toLowerCase();
    const name = String(commandName || '').toLowerCase();
    const channelId = channel.id;

    if (category === 'admin') return null;

    if (category === 'partner') {
        if (name === 'leaderboard') {
            if (PARTNER_LEADERBOARD_CHANNEL_IDS.size > 0 && !PARTNER_LEADERBOARD_CHANNEL_IDS.has(String(channelId))) {
                const list = [...PARTNER_LEADERBOARD_CHANNEL_IDS].map((id) => `<#${id}>`).join(', ');
                return `Il comando leaderboard è usabile solo in ${list}.`;
            }
            return null;
        }
        if (!isChannelInTicketCategory(channel)) {
            return 'Questo comando Partner è usabile solo nei canali della categoria ticket.';
        }
        return null;
    }

    if (category === 'staff') {
        if (!STAFF_ALLOWED_CHANNEL_IDS.has(String(channelId))) {
            const channels = [...STAFF_ALLOWED_CHANNEL_IDS].map((id) => `<#${id}>`).join(' e ');
            return `I comandi Staff sono usabili solo in ${channels}.`;
        }
        return null;
    }

    return null;
}

const getCommandKey = (name, type) => `${name}:${type || 1}`;

function runWithTimeout(taskPromise, timeoutMs, label = 'command') {
    let timeoutHandle = null;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
            const err = new Error(`${label} execution timed out after ${timeoutMs}ms`);
            err.code = 'COMMAND_TIMEOUT';
            reject(err);
        }, timeoutMs);
    });
    return Promise.race([taskPromise, timeoutPromise]).finally(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
    });
}

function sanitizeEditPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
    if (!Object.prototype.hasOwnProperty.call(payload, 'flags')) return payload;
    const next = { ...payload };
    delete next.flags;
    return next;
}

async function handleAutocomplete(interaction, client) {
    const cmd = client.commands.get(getCommandKey(interaction.commandName, interaction.commandType));
    if (!cmd?.autocomplete) return;
    try {
        await cmd.autocomplete(interaction, client);
    } catch (err) {
        global.logger.error(err);
    }
}

async function handleSlashCommand(interaction, client) {
    const command = client.commands.get(getCommandKey(interaction.commandName, interaction.commandType));
    if (!command) return;
    const expectsModal = command?.expectsModal === true;
    const isAdminCommand = String(command?.category || '').toLowerCase() === 'admin';
    if (!client.interactionCommandLocks) client.interactionCommandLocks = new Set();
    const interactionLockId = `${interaction.guildId || 'dm'}:${interaction.user.id}`;

    if (interaction.guildId && interaction.channel) {
        const channelError = getSlashChannelRestrictionError(interaction.commandName, command, interaction.channel);
        if (channelError) {
            return interaction.reply({ content: channelError, flags: 1 << 6 });
        }
    }

    if (!(await checkSlashPermission(interaction))) {
        const requiredRoles = getSlashRequiredRoles(interaction);
        const embed = interaction.commandName === 'dmbroadcast'
            ? buildGlobalPermissionDeniedEmbed([], 'comando', 'Solo i developer del bot possono usare questo comando.')
            : buildGlobalPermissionDeniedEmbed(requiredRoles);
        return interaction.reply({
            embeds: [embed],
            flags: 1 << 6
        });
    }
    const memberRoleCache = interaction.member?.roles?.cache;
    const memberRoleArray = interaction.member?.roles;
    const hasSlashCooldownBypass = Boolean(
        (memberRoleCache && typeof memberRoleCache.has === 'function' && memberRoleCache.has(SLASH_COOLDOWN_BYPASS_ROLE_ID))
        || (Array.isArray(memberRoleArray) && memberRoleArray.includes(SLASH_COOLDOWN_BYPASS_ROLE_ID))
    );

    if (!hasSlashCooldownBypass && !expectsModal) {
        const cooldownSeconds = await getUserCommandCooldownSeconds({
            guildId: interaction.guildId,
            userId: interaction.user.id,
            member: interaction.member
        });
        const cooldownResult = consumeUserCooldown({
            client,
            guildId: interaction.guildId,
            userId: interaction.user.id,
            cooldownSeconds
        });
        if (!cooldownResult.ok) {
            const remaining = Math.max(1, Math.ceil(cooldownResult.remainingMs / 1000));
            return interaction.reply({
                embeds: [buildCooldownErrorEmbed(remaining)],
                flags: 1 << 6
            });
        }
    }
    if (client.interactionCommandLocks.has(interactionLockId)) {
        return interaction.reply({
            embeds: [buildBusyCommandErrorEmbed()],
            flags: 1 << 6
        });
    }
    client.interactionCommandLocks.add(interactionLockId);

    const originalReply = interaction.reply.bind(interaction);
    const originalFollowUp = interaction.followUp?.bind(interaction);
    const originalEditReply = interaction.editReply.bind(interaction);
    const originalChannelSend = interaction.channel?.send?.bind(interaction.channel);
    const wrappedInteraction = Object.create(interaction);
    wrappedInteraction.deferReply = (...args) => {
        if (isAdminCommand) return interaction.deferReply(...args);
        const first = args?.[0];
        if (!first || typeof first !== 'object' || Array.isArray(first)) {
            return interaction.deferReply({ flags: 1 << 6 });
        }
        if (!Object.prototype.hasOwnProperty.call(first, 'flags')) {
            return interaction.deferReply({ ...first, flags: 1 << 6 });
        }
        return interaction.deferReply(...args);
    };
    wrappedInteraction.showModal = (...args) => interaction.showModal(...args);
    wrappedInteraction.deferUpdate = (...args) => interaction.deferUpdate(...args);
    wrappedInteraction.update = (...args) => interaction.update(...args);
    wrappedInteraction.fetchReply = (...args) => interaction.fetchReply(...args);
    wrappedInteraction.deleteReply = (...args) => interaction.deleteReply(...args);
    wrappedInteraction.reply = async (payload) => {
        payload = applyDefaultFooterToEmbeds(payload, interaction.guild);
        if (interaction.deferred) {
            return interaction.editReply(sanitizeEditPayload(payload));
        }
        return originalReply(payload);
    };

    if (originalFollowUp) {
        wrappedInteraction.followUp = async (payload) => {
            payload = applyDefaultFooterToEmbeds(payload, interaction.guild);
            if (interaction.deferred && !interaction.replied) {
                try {
                    return await interaction.editReply(sanitizeEditPayload(payload));
                } catch { }
            }
            try {
                return await originalFollowUp(payload);
            } catch (err) {
                if (err?.code === 'InteractionNotReplied') {
                    return originalReply(payload);
                }
                throw err;
            }
        };
    }

    wrappedInteraction.editReply = async (payload) => {
        const withFooter = applyDefaultFooterToEmbeds(payload, interaction.guild);
        return originalEditReply(sanitizeEditPayload(withFooter));
    };
    if (originalChannelSend) {
        const wrappedChannel = Object.create(interaction.channel);
        wrappedChannel.send = async (payload) => originalChannelSend(applyDefaultFooterToEmbeds(payload, interaction.guild));
        wrappedInteraction.channel = wrappedChannel;
    }

    const getTimestamp = () => {
        const d = new Date();
        return d.toISOString().replace('T', ' ').split('.')[0];
    };

    const safeReply = async (payload) => safeReplyHelper(interaction, payload);

    let deferTimer;
    let commandFailed = false;
    try {
        if (!expectsModal) {
            deferTimer = setTimeout(() => {
                if (!interaction.replied && !interaction.deferred) {
                    const deferPayload = isAdminCommand ? {} : { flags: 1 << 6 };
                    interaction.deferReply(deferPayload).catch(() => { });
                }
            }, 1500);
        }
        await runWithTimeout(
            Promise.resolve(command.execute(wrappedInteraction, client)),
            COMMAND_EXECUTION_TIMEOUT_MS,
            `app:${interaction.commandName || 'unknown'}`
        );
    } catch (error) {
        commandFailed = true;
        const errorChannelId = IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
        const errorChannel = errorChannelId
            ? client.channels.cache.get(errorChannelId)
            : null;
        const staffEmbed = buildErrorLogEmbed({
            contextLabel: 'Comando',
            contextValue: interaction.commandName || 'unknown',
            userTag: interaction.user?.tag || interaction.user?.id || '—',
            error
        });
        const errorText =
            (error?.stack || error?.message || String(error))?.slice(0, 1000) ||
            '<:vegax:1443934876440068179> Errore sconosciuto';
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('error_pending')
                .setLabel('In risoluzione')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('error_solved')
                .setLabel('Risolto')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('error_unsolved')
                .setLabel('Irrisolto')
                .setStyle(ButtonStyle.Danger)
        );
        let msg;
        if (errorChannel) {
            try {
                msg = await errorChannel.send({
                    embeds: [staffEmbed],
                    components: [row]
                });
            } catch (_) {}
        }
        if (msg) {
            const collector = msg.createMessageComponentCollector({
                time: 1000 * 60 * 60 * 24,
                filter: (i) => i.isButton()
            });
            collector.on('collect', async (btn) => {
                try {
                    if (!btn.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                        return await btn.reply({
                            content: "<:vegax:1443934876440068179> Non hai i permessi per fare questo comando.",
                            flags: 1 << 6
                        });
                    }
                    await btn.deferUpdate();
                    const updatedEmbed = EmbedBuilder.from(staffEmbed);
                    if (btn.customId === 'error_pending')
                        updatedEmbed.setColor('#f1c40f');
                    if (btn.customId === 'error_solved')
                        updatedEmbed.setColor('#2ecc71');
                    if (btn.customId === 'error_unsolved')
                        updatedEmbed.setColor('#e74c3c');
                    await msg.edit({ embeds: [updatedEmbed] });
                } catch (_) {}
            });
            collector.on('end', async () => {
                try {
                    row.components.forEach(b => b.setDisabled(true));
                    await msg.edit({ components: [row] });
                } catch { }
            });
        }
        const userEmbed = error?.code === 'COMMAND_TIMEOUT'
            ? buildCommandTimeoutErrorEmbed()
            : buildInternalCommandErrorEmbed(errorText);
        await safeReply({
            embeds: [userEmbed],
            flags: 1 << 6
        });
    } finally {
        if (!expectsModal && interaction.deferred && !interaction.replied) {
            const fallbackPayload = commandFailed
                ? { content: '<:vegax:1443934876440068179> Comando terminato con errore.' }
                : { content: '<:vegacheckmark:1443666279058772028> Comando eseguito.' };
            await interaction.editReply(fallbackPayload).catch(() => { });
        }
        if (deferTimer) clearTimeout(deferTimer);
        client.interactionCommandLocks.delete(interactionLockId);
    }
}

module.exports = { handleAutocomplete, handleSlashCommand };
