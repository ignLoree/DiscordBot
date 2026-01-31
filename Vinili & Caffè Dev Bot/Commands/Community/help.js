const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const CATEGORY_ORDER = [
    'Community',
    'Music',
    'Economy',
    'Pass',
    'Partner',
    'Moderation',
    'Admin',
    'Staff'
];
const DEFAULT_COLOR = '#6f4e37';
const DEFAULT_FOOTER_TEXT = '© 2025 Vinili & Caffè. Tutti i diritti riservati.';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Mostra l\'elenco dei comandi'),
    async execute(interaction, client) {
        const disabledCommands = Array.isArray(client.config?.disabledCommands)
            ? client.config.disabledCommands
            : [];
        const commands = [...client.commands.values()]
            .filter(cmd => cmd?.data?.name)
            .filter(cmd => !cmd.skipDeploy)
            .filter(cmd => !disabledCommands.includes(cmd.data.name))
            .filter(cmd => canUseCommand(cmd, interaction, client));
        const grouped = new Map();
        for (const cmd of commands) {
            const category = cmd.category || 'Altro';
            if (!grouped.has(category)) grouped.set(category, []);
            grouped.get(category).push(cmd);
        }
        if (grouped.size === 0) {
            return interaction.reply({
                content: '? Non ci sono comandi disponibili per te.',
                flags: 1 << 6
            });
        }
        const categories = Array.from(grouped.keys());
        const orderedCategories = [
            ...CATEGORY_ORDER.filter(c => grouped.has(c)),
            ...categories.filter(c => !CATEGORY_ORDER.includes(c)).sort((a, b) => a.localeCompare(b))
        ];
        const pages = orderedCategories.map((category, index) => ({
            category,
            embed: buildEmbed(category, grouped.get(category), index, orderedCategories.length)
        }));
        let pageIndex = 0;
        const response = await interaction.reply({
            embeds: [pages[pageIndex].embed],
            components: pages.length > 1 ? [buildRow(pageIndex, pages.length, interaction.user.id)] : [],
            withResponse: true
        });
        const message = response?.resource?.message || await interaction.fetchReply();
        if (pages.length <= 1) return;
        const collector = message.createMessageComponentCollector({
            time: 120000,
            filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith('help_')
        });
        collector.on('collect', async (btn) => {
            if (btn.customId.startsWith('help_prev')) pageIndex -= 1;
            if (btn.customId.startsWith('help_next')) pageIndex += 1;
            pageIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
            await btn.update({
                embeds: [pages[pageIndex].embed],
                components: [buildRow(pageIndex, pages.length, interaction.user.id)]
            });
        });
        collector.on('end', async () => {
            try {
                const row = buildRow(pageIndex, pages.length, interaction.user.id);
                row.components.forEach(component => component.setDisabled(true));
                await message.edit({ components: [row] });
            } catch { }
        });
    }
};

function hasAnyRole(member, roleIds) {
    if (!member || !Array.isArray(roleIds) || roleIds.length === 0) return false;
    return roleIds.some(roleId => member.roles?.cache?.has(roleId));
}
function canUseCommand(command, interaction, client) {
    if (!interaction.inGuild()) {
        return !command.staffOnly && !command.adminOnly && !command.partnerManagerOnly;
    }
    const isAdminPerm = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    if (command.adminOnly) {
        const adminRoleIds = Array.isArray(client.config?.adminRoleIds)
            ? client.config.adminRoleIds
            : [];
        return isAdminPerm || hasAnyRole(interaction.member, adminRoleIds);
    }
    if (command.staffOnly) {
        let staffRoleIds = Array.isArray(client.config?.staffRoleIds)
            ? client.config.staffRoleIds
            : [];
        if (Array.isArray(command.staffRoleIds)) {
            staffRoleIds = command.staffRoleIds;
        }
        return isAdminPerm || hasAnyRole(interaction.member, staffRoleIds);
    }
    if (command.partnerManagerOnly) {
        const partnerRoleIds = Array.isArray(client.config?.prefixStaffRoleIds)
            ? client.config.prefixStaffRoleIds
            : [];
        return isAdminPerm || hasAnyRole(interaction.member, partnerRoleIds);
    }
    return true;
}
function chunkLines(lines, maxLength = 1000) {
    const chunks = [];
    let current = '';
    for (const line of lines) {
        const next = current ? `${current}\n${line}` : line;
        if (next.length > maxLength) {
            if (current) chunks.push(current);
            current = line;
        } else {
            current = next;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}
function buildEmbed(category, commands, pageIndex, pageCount) {
    const lines = commands
        .sort((a, b) => a.data.name.localeCompare(b.data.name))
        .map(cmd => `• /${cmd.data.name} — ${cmd.data.description || 'Senza descrizione'}`);
    const embed = new EmbedBuilder()
        .setColor(DEFAULT_COLOR)
        .setTitle(`Comandi - ${category}`)
        .setFooter({ text: `Pagina ${pageIndex + 1}/${pageCount} • ${DEFAULT_FOOTER_TEXT}` });
    if (lines.length === 0) {
        embed.setDescription('Nessun comando disponibile in questa categoria.');
        return embed;
    }
    const chunks = chunkLines(lines, 1000);
    if (chunks.length === 1) {
        embed.setDescription(chunks[0]);
        return embed;
    }
    chunks.forEach((chunk, index) => {
        embed.addFields({
            name: index === 0 ? 'Comandi' : 'Comandi (cont.)',
            value: chunk,
            inline: false
        });
    });
    return embed;
}
function buildRow(pageIndex, pageCount, userId) {
    const prev = new ButtonBuilder()
        .setCustomId(`help_prev:${userId}`)
        .setLabel('Indietro')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex === 0);
    const next = new ButtonBuilder()
        .setCustomId(`help_next:${userId}`)
        .setLabel('Avanti')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex >= pageCount - 1);
    return new ActionRowBuilder().addComponents(prev, next);
}