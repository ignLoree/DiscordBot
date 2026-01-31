const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Ottieni informazioni su un ruolo.')
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Ottieni informazioni su un ruolo.')
                .addRoleOption(option => option
                    .setName('ruolo')
                    .setDescription('Il ruolo di cui vuoi ottenere le informazioni.')
                    .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('Ottieni la lista dei ruoli del server.')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand()
        await interaction.deferReply()
        switch (sub) {
            case 'info':
                try {
                    const role = interaction.options.getRole('ruolo');
                    const perms = {
                        administrator: 'Administrator',
                        manageGuild: 'Manage Server',
                        manageRoles: 'Manage Roles',
                        manageChannels: 'Manage Channels',
                        manageMessages: 'Manage Messages',
                        manageWebhooks: 'Manage Webhooks',
                        manageNicknames: 'Manage Nicknames',
                        manageEmojis: 'Manage Emojis',
                        kickMembers: 'Kick Members',
                        banMembers: 'Ban Members',
                        mentionEveryone: 'Mention Everyone',
                        timeoutMembers: 'Timeout Members',
                    };
                    const color = role.color ? ('00000' + role.color.toString(16)).slice(-6) : null;
                    const embed = {
                        fields: [
                            { name: 'ID', value: role.id, inline: true },
                            { name: 'Nome', value: role.name, inline: true },
                            { name: 'Colore', value: color ? `#${color}` : 'Nessuno', inline: true },
                            { name: 'Menzione', value: `\`<@&${role.id}>\``, inline: true },
                            { name: 'Sollevato', value: role.hoist ? 'Si' : 'No', inline: true },
                            { name: 'Posizione', value: role.position.toString(), inline: true },
                            { name: 'Menzionabile', value: role.mentionable ? 'Si' : 'No', inline: true },
                        ],
                        footer: {
                            text: `Ruolo Creato`,
                        },
                        timestamp: new Date(role.createdAt),
                    };
                    if (color) {
                        embed.color = role.color;
                    }
                    if (role.permissions) {
                        let infoPerms = []
                        if (role.permissions.has(PermissionFlagsBits.Administrator)) infoPerms.push(perms['administrator']);
                        if (role.permissions.has(PermissionFlagsBits.ManageGuild)) infoPerms.push(perms['manageGuild'])
                        if (role.permissions.has(PermissionFlagsBits.ManageRoles)) infoPerms.push(perms['manageRoles'])
                        if (role.permissions.has(PermissionFlagsBits.ManageChannels)) infoPerms.push(perms['manageChannels'])
                        if (role.permissions.has(PermissionFlagsBits.ManageMessages)) infoPerms.push(perms['manageMessages'])
                        if (role.permissions.has(PermissionFlagsBits.ManageWebhooks)) infoPerms.push(perms['manageWebhooks'])
                        if (role.permissions.has(PermissionFlagsBits.ManageNicknames)) infoPerms.push(perms['manageNicknames'])
                        if (role.permissions.has(PermissionFlagsBits.KickMembers)) infoPerms.push(perms['kickMembers'])
                        if (role.permissions.has(PermissionFlagsBits.BanMembers)) infoPerms.push(perms['banMembers'])
                        if (role.permissions.has(PermissionFlagsBits.MentionEveryone)) infoPerms.push(perms['mentionEveryone'])
                        if (role.permissions.has(PermissionFlagsBits.ModerateMembers)) infoPerms.push(perms['timeoutMembers'])
                        if (infoPerms.length) {
                            embed.fields.push({ name: 'Permessi', value: infoPerms.join(', '), inline: false });
                        }
                    }
                    await interaction.editReply({ embeds: [embed] });
                } catch (error) {
                    global.logger.error(error);
                }
                break;
            case 'list':
                try {
                    const roles = interaction.guild.roles.cache.map(r => {
                        if (r.id === interaction.guild.id) {
                            return '';
                        }
                        return `<@&${r.id}>`;
                    }).join('\n') || 'Nessuno';
                    if (roles.length > 4096) {
                        const chunkSize = 4096;
                        const chunks = [];
                        for (let i = 0; i < roles.length; i += chunkSize) {
                            chunks.push(roles.substring(i, i + chunkSize));
                        }
                        const embeds = chunks.map((chunk, index) => {
                            let description = chunk;
                            if (index === 0) {
                                title = `Ruoli [${interaction.guild.roles.cache.size}]`
                                description = `${chunk}`;
                            } else if (index === chunks.length - 1) {
                                description = `${chunk}\n@everyone`;
                                title = null;
                            }
                            return {
                                title: title,
                                description: description,
                                color: 0x6f4e37,
                            };
                        });
                        await interaction.editReply({ embeds: embeds });
                    } else {
                        const embed = {
                            title: `Ruoli [${interaction.guild.roles.cache.size}]`,
                            description: `${roles}\n@everyone`,
                            color: 0x6f4e37,
                        }
                        await interaction.editReply({ embeds: [embed] });
                    }
                } catch (error) {
                    global.logger.error(error);
                }
                break;
        }
    }
}