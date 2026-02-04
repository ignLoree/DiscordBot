const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { safeReply: safeReplyHelper } = require('../../Utils/Moderation/interaction');
const { applyDefaultFooterToEmbeds } = require('../../Utils/Embeds/defaultFooter');

const getCommandKey = (name, type) => `${name}:${type || 1}`;

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
    const disabledCommands = Array.isArray(client.config?.disabledCommands)
        ? client.config.disabledCommands
        : [];
    const disabledSubcommands = client.config?.disabledSubcommands || {};
    const subcommand = interaction.options?.getSubcommand?.(false);
    if (disabledCommands.includes(interaction.commandName)) {
        return interaction.reply({
            content: "<:vegax:1443934876440068179> Questo comando è disabilitato al momento.",
            flags: 1 << 6
        });
    }

    if (command.staffOnly) {
        const sub = interaction.options?.getSubcommand?.(false);
        let staffRoleIds = Array.isArray(client.config?.staffRoleIds)
            ? client.config.staffRoleIds
            : [];
        if (sub && command.staffRoleIdsBySubcommand && Array.isArray(command.staffRoleIdsBySubcommand[sub])) {
            staffRoleIds = command.staffRoleIdsBySubcommand[sub];
        } else if (Array.isArray(command.staffRoleIds)) {
            staffRoleIds = command.staffRoleIds;
        }
        const hasStaffRole = staffRoleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId));
        const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
        if (!interaction.inGuild() || (!hasStaffRole && !isAdmin)) {
            return interaction.reply({
                content: "<:vegax:1443934876440068179> Questo comando è solo per lo Staff.",
                flags: 1 << 6
            });
        }
    }

    if (command.partnerManagerOnly) {
        const partnerRoleIds = Array.isArray(client.config?.prefixStaffRoleIds)
            ? client.config.prefixStaffRoleIds
            : [];
        const hasPartnerRole = partnerRoleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId));
        const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
        if (!interaction.inGuild() || (!hasPartnerRole && !isAdmin)) {
            return interaction.reply({
                content: "<:vegax:1443934876440068179> Questo comando è solo per i Partner Manager.",
                flags: 1 << 6
            });
        }
    }

    if (command.adminOnly) {
        const adminRoleIds = Array.isArray(client.config?.adminRoleIds)
            ? client.config.adminRoleIds
            : [];
        const hasAdminRole = adminRoleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId));
        const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
        if (!interaction.inGuild() || (!hasAdminRole && !isAdmin)) {
            return interaction.reply({
                content: "<:vegax:1443934876440068179> Questo comando è solo per l'High Staff.",
                flags: 1 << 6
            });
        }
    }

    if (subcommand && Array.isArray(disabledSubcommands[interaction.commandName])) {
        if (disabledSubcommands[interaction.commandName].includes(subcommand)) {
            return interaction.reply({
                content: "<:vegax:1443934876440068179> Questo subcommand è disabilitato al momento.",
                flags: 1 << 6
            });
        }
    }

    const originalReply = interaction.reply.bind(interaction);
    const originalFollowUp = interaction.followUp?.bind(interaction);
    const originalEditReply = interaction.editReply.bind(interaction);
    const originalChannelSend = interaction.channel?.send?.bind(interaction.channel);
    interaction.reply = async (payload) => {
        payload = applyDefaultFooterToEmbeds(payload, interaction.guild);
        if (interaction.deferred) {
            return interaction.editReply(payload);
        }
        return originalReply(payload);
    };

    if (originalFollowUp) {
        interaction.followUp = async (payload) => {
            payload = applyDefaultFooterToEmbeds(payload, interaction.guild);
            if (interaction.deferred && !interaction.replied) {
                try {
                    return await interaction.editReply(payload);
                } catch { }
            }
            return originalFollowUp(payload);
        };
    }

    interaction.editReply = async (payload) => originalEditReply(applyDefaultFooterToEmbeds(payload, interaction.guild));
    if (originalChannelSend) {
        interaction.channel.send = async (payload) => originalChannelSend(applyDefaultFooterToEmbeds(payload, interaction.guild));
    }

    const getTimestamp = () => {
        const d = new Date();
        return d.toISOString().replace('T', ' ').split('.')[0];
    };

    const safeReply = async (payload) => safeReplyHelper(interaction, payload);

    let deferTimer;
    try {
        deferTimer = setTimeout(() => {
            if (!interaction.replied && !interaction.deferred) {
                interaction.deferReply().catch(() => { });
            }
        }, 3000);
        await command.execute(interaction, client);
    } catch (error) {
        global.logger.error(
            `\x1b[31m[${getTimestamp()}] [INTERACTION_CREATE]\x1b[0m`,
            error
        );
        const errorChannelId = client.config2?.commandErrorChannel;
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
            .setDescription(`<:vegax:1443934876440068179> C'è stato un errore nell'esecuzione del comando.
                \`\`\`${errorText}\`\`\``);
        await safeReply({
            embeds: [userEmbed],
            flags: 1 << 6
        });
    } finally {
        if (deferTimer) clearTimeout(deferTimer);
    }
}

module.exports = { handleAutocomplete, handleSlashCommand };
