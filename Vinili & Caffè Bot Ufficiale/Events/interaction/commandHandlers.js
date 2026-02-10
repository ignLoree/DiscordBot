const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { safeReply: safeReplyHelper } = require('../../Utils/Moderation/reply');
const { applyDefaultFooterToEmbeds } = require('../../Utils/Embeds/defaultFooter');
const { checkSlashPermission } = require('../../Utils/Moderation/commandPermissions');
const { getUserCommandCooldownSeconds, consumeUserCooldown } = require('../../Utils/Moderation/commandCooldown');
const IDs = require('../../Utils/Config/ids');
const SLASH_COOLDOWN_BYPASS_ROLE_ID = IDs.roles.staff;
const COMMAND_EXECUTION_TIMEOUT_MS = 60 * 1000;

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
    if (!client.interactionCommandLocks) client.interactionCommandLocks = new Set();
    const interactionLockId = `${interaction.guildId || 'dm'}:${interaction.user.id}`;

    if (!checkSlashPermission(interaction)) {
        return interaction.reply({
            content: "<:vegax:1443934876440068179> Non hai il permesso per fare questo comando.",
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
                content: `<:attentionfromvega:1443651874032062505> Cooldown attivo: aspetta **${remaining}s** prima di usare un altro comando.`,
                flags: 1 << 6
            });
        }
    }
    if (client.interactionCommandLocks.has(interactionLockId)) {
        return interaction.reply({
            content: "<:attentionfromvega:1443651874032062505> Hai già un comando in esecuzione, attendi un attimo.",
            flags: 1 << 6
        });
    }
    client.interactionCommandLocks.add(interactionLockId);

    const originalReply = interaction.reply.bind(interaction);
    const originalFollowUp = interaction.followUp?.bind(interaction);
    const originalEditReply = interaction.editReply.bind(interaction);
    const originalChannelSend = interaction.channel?.send?.bind(interaction.channel);
    const wrappedInteraction = Object.create(interaction);
    wrappedInteraction.reply = async (payload) => {
        payload = applyDefaultFooterToEmbeds(payload, interaction.guild);
        if (interaction.deferred) {
            return interaction.editReply(payload);
        }
        return originalReply(payload);
    };

    if (originalFollowUp) {
        wrappedInteraction.followUp = async (payload) => {
            payload = applyDefaultFooterToEmbeds(payload, interaction.guild);
            if (interaction.deferred && !interaction.replied) {
                try {
                    return await interaction.editReply(payload);
                } catch { }
            }
            return originalFollowUp(payload);
        };
    }

    wrappedInteraction.editReply = async (payload) => originalEditReply(applyDefaultFooterToEmbeds(payload, interaction.guild));
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
    try {
        if (!expectsModal) {
            deferTimer = setTimeout(() => {
                if (!interaction.replied && !interaction.deferred) {
                    interaction.deferReply({ flags: 1 << 6 }).catch(() => { });
                }
            }, 1500);
        }
        await runWithTimeout(
            Promise.resolve(command.execute(wrappedInteraction, client)),
            COMMAND_EXECUTION_TIMEOUT_MS,
            `app:${interaction.commandName || 'unknown'}`
        );
    } catch (error) {
        if (error?.code === 'COMMAND_TIMEOUT') {
            global.logger.warn(`[INTERACTION TIMEOUT] ${interaction.commandName || 'unknown'} by ${interaction.user?.tag || interaction.user?.id}`);
        }
        global.logger.error(
            `\x1b[31m[${getTimestamp()}] [INTERACTION_CREATE]\x1b[0m`,
            error
        );
        const errorChannelId = client.config?.commandErrorChannel;
        const errorChannel = errorChannelId
            ? client.channels.cache.get(errorChannelId)
            : null;
        const rawErrorText =
            error?.stack?.slice(0, 1900) ||
            error?.message ||
            '<:vegax:1443934876440068179> Errore sconosciuto';
        const errorText =
            rawErrorText.length > 1000 ? `${rawErrorText.slice(0, 1000)}...` : rawErrorText;
        const staffEmbed = new EmbedBuilder()
            .setColor('#6f4e37')
            .addFields(
                { name: '<:dot:1443660294596329582> Comando', value: `\`\`\`${interaction.commandName}\`\`\`` },
                { name: '<:dot:1443660294596329582> Utente', value: `\`\`\`${interaction.user.tag}\`\`\`` },
                { name: '<:dot:1443660294596329582> Errore', value: `\`\`\`${errorText}\`\`\`` }
            )
            .setTimestamp();
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
            } catch (err) {
                global.logger.error(err);
            }
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
                } catch (err) {
                    global.logger.error(err);
                }
            });
            collector.on('end', async () => {
                try {
                    row.components.forEach(b => b.setDisabled(true));
                    await msg.edit({ components: [row] });
                } catch { }
            });
        }
        const userEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setDescription(
                error?.code === 'COMMAND_TIMEOUT'
                    ? '<:attentionfromvega:1443651874032062505> Il comando è scaduto dopo 60 secondi. Riprova.'
                    : `<:vegax:1443934876440068179> C'è stato un errore nell'esecuzione del comando.\n\`\`\`${errorText}\`\`\``
            );
        await safeReply({
            embeds: [userEmbed],
            flags: 1 << 6
        });
    } finally {
        if (deferTimer) clearTimeout(deferTimer);
        client.interactionCommandLocks.delete(interactionLockId);
    }
}

module.exports = { handleAutocomplete, handleSlashCommand };
