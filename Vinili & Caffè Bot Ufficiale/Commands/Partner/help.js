const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { hasAnyRole } = require('../../Utils/Moderation/permissions');
const { buildOverviewEmbed } = require('../../Utils/Help/prefixHelpView');
const fs = require('fs');
const path = require('path');
const config = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Mostra le schermate help')
        .addStringOption(o =>
            o.setName('tipo')
                .setDescription('Schermata help da mostrare')
                .setRequired(false)
                .addChoices(
                    { name: 'Community', value: 'community' },
                    { name: 'Music', value: 'music' },
                    { name: 'Staff', value: 'staff' },
                    { name: 'High Staff', value: 'high_staff' },
                    { name: 'Partner Manager', value: 'partner_manager' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const tipo = interaction.options.getString('tipo') || 'all';
        const ROLE_ADMIN = ['1442568894349840435'];
        const ROLE_PARTNER_MANAGER = ['1442568905582317740'];
        const ROLE_STAFF = ['1442568910070349985'];
        const ROLE_USER = ['1442568949605597264'];

        const hasUserRole = hasAnyRole(interaction.member, ROLE_USER);
        const hasPartnerManagerRole = hasAnyRole(interaction.member, ROLE_PARTNER_MANAGER) || hasUserRole;
        const hasStaffRole = hasAnyRole(interaction.member, ROLE_STAFF) || hasUserRole;
        const hasHighStaffRole = hasAnyRole(interaction.member, ROLE_ADMIN) || hasUserRole;

        if (tipo === 'partner_manager' && !hasPartnerManagerRole) {
            return await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Non hai il permesso per vedere questa schermata!')
                        .setColor('Red')
                ],
                flags: 1 << 6
            });
        }

        if (tipo === 'staff' && !hasStaffRole) {
            return await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Non hai il permesso per vedere questa schermata!')
                        .setColor('Red')
                ],
                flags: 1 << 6
            });
        }

        if (tipo === 'high_staff' && !hasHighStaffRole) {
            return await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Non hai il permesso per vedere questa schermata!')
                        .setColor('Red')
                ],
                flags: 1 << 6
            });
        }

        if (tipo === 'partner_manager') {
            return await interaction.editReply({
                embeds: [buildPartnerManagerEmbed()]
            });
        }

        const prefixes = getPrefixConfig(interaction.client);
        const pages = [];
        if (tipo === 'community' || tipo === 'all') {
            pages.push(buildSectionEmbed('Community', {
                Community: {
                    slash: loadSlashCommandsFromFolder('Community'),
                    prefix: loadPrefixCommandsFromFolder('Community', prefixes)
                },
                Economy: {
                    slash: loadSlashCommandsFromFolder('Economy'),
                    prefix: loadPrefixCommandsFromFolder('Economy', prefixes)
                },
                Pass: {
                    slash: loadSlashCommandsFromFolder('Pass'),
                    prefix: loadPrefixCommandsFromFolder('Pass', prefixes)
                }
            }));
        }
        if (tipo === 'music' || tipo === 'all') {
            pages.push(buildMusicHelpEmbed({ prefixes }));
        }
        if ((tipo === 'staff' || tipo === 'all') && hasStaffRole) {
            pages.push(buildSectionEmbed('Staff', {
                Staff: {
                    slash: loadSlashCommandsFromFolder('Staff'),
                    prefix: loadPrefixCommandsFromFolder('Staff', prefixes)
                }
            }));
        }
        if ((tipo === 'high_staff' || tipo === 'all') && hasHighStaffRole) {
            pages.push(buildSectionEmbed('High Staff', {
                Admin: {
                    slash: loadSlashCommandsFromFolder('Admin'),
                    prefix: loadPrefixCommandsFromFolder('Admin', prefixes)
                }
            }));
        }
        if (tipo === 'all' && hasPartnerManagerRole) {
            pages.push(buildPartnerManagerEmbed());
        }

        if (pages.length === 0) {
            return await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Non ci sono schermate disponibili per te.')
                        .setColor('Red')
                ],
                flags: 1 << 6
            });
        }

        let pageIndex = 0;
        await interaction.editReply({
            embeds: [pages[pageIndex]],
            components: pages.length > 1 ? [buildRow(pageIndex, pages.length, interaction.user.id)] : []
        });

        if (pages.length <= 1) return;
        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({
            time: 120000,
            filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith('help_pages:')
        });
        collector.on('collect', async (btn) => {
            if (btn.customId.startsWith('help_pages:prev')) pageIndex -= 1;
            if (btn.customId.startsWith('help_pages:next')) pageIndex += 1;
            pageIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
            await btn.update({
                embeds: [pages[pageIndex]],
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
}

function getPrefixConfig(client) {
    const cfg = client?.config2 || {};
    return {
        defaultPrefix: cfg.prefix || '!',
        moderationPrefix: cfg.moderationPrefix || '?',
        musicPrefix: cfg.musicPrefix || '.'
    };
}

function loadSlashCommandsFromFolder(folderName) {
    const commandsRoot = path.join(__dirname, '..');
    const folderPath = path.join(commandsRoot, folderName);
    if (!fs.existsSync(folderPath)) return [];
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));
    const out = [];
    for (const file of files) {
        const filePath = path.join(folderPath, file);
        let command = null;
        try {
            delete require.cache[require.resolve(filePath)];
            command = require(filePath);
        } catch {
            command = null;
        }
        const fallbackName = path.basename(file, '.js');
        const meta = getCommandMeta(command, fallbackName);
        if (!meta.name) continue;
        out.push(meta);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

function loadPrefixCommandsFromFolder(folderName, prefixes) {
    const prefixRoot = path.join(__dirname, '..', '..', 'Prefix', folderName);
    if (!fs.existsSync(prefixRoot)) return [];
    const files = fs.readdirSync(prefixRoot).filter(f => f.endsWith('.js'));
    const out = [];
    for (const file of files) {
        const filePath = path.join(prefixRoot, file);
        let command = null;
        try {
            delete require.cache[require.resolve(filePath)];
            command = require(filePath);
        } catch {
            command = null;
        }
        if (!command || command.skipLoad || command.skipPrefix) continue;
        const fallbackName = path.basename(file, '.js');
        const name = command.name || fallbackName;
        const description = command.description || 'Senza descrizione';
        const prefix = resolvePrefixForCommand(command, folderName, prefixes);
        out.push({ name, description, prefix });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

function resolvePrefixForCommand(command, folderName, prefixes) {
    if (command?.prefixOverride) return command.prefixOverride;
    const folder = String(folderName || '').toLowerCase();
    if (folder === 'moderation') return prefixes.moderationPrefix;
    if (folder === 'music') return prefixes.musicPrefix;
    return prefixes.defaultPrefix;
}

function getCommandMeta(command, fallbackName) {
    let name = command?.data?.name || null;
    let description = command?.data?.description || null;
    if ((!name || !description) && command?.data?.toJSON) {
        const json = command.data.toJSON();
        name = name || json?.name || null;
        description = description || json?.description || null;
    }
    name = name || fallbackName;
    description = description || 'Senza descrizione';
    return { name, description };
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

function buildSectionEmbed(title, sections) {
    const embed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setTitle(`Comandi - ${title}`);
    for (const [sectionName, bucket] of Object.entries(sections)) {
        const lines = buildMergedLines(bucket?.slash || [], bucket?.prefix || []);
        if (lines.length === 0) {
            embed.addFields({ name: sectionName, value: 'Nessun comando disponibile.', inline: false });
            continue;
        }
        const chunks = chunkLines(lines, 1000);
        chunks.forEach((chunk, index) => {
            embed.addFields({
                name: index === 0 ? sectionName : `${sectionName} (cont.)`,
                value: chunk,
                inline: false
            });
        });
    }
    return embed;
}

function buildMergedLines(slashCommands, prefixCommands) {
    const prefixMap = new Map();
    for (const cmd of prefixCommands) {
        if (!cmd?.name) continue;
        prefixMap.set(cmd.name, cmd);
    }
    const lines = [];
    for (const cmd of slashCommands) {
        if (!cmd?.name) continue;
        const prefix = prefixMap.get(cmd.name);
        if (prefix) {
            lines.push(`� /${cmd.name} � ${cmd.description} (prefix: ${prefix.prefix}${prefix.name})`);
            prefixMap.delete(cmd.name);
        } else {
            lines.push(`� /${cmd.name} � ${cmd.description}`);
        }
    }
    for (const cmd of Array.from(prefixMap.values()).sort((a, b) => a.name.localeCompare(b.name))) {
        lines.push(`� ${cmd.prefix}${cmd.name} � ${cmd.description}`);
    }
    return lines;
}

function buildMusicHelpEmbed({ prefixes }) {
    const color = (config && config.embedColor) || '#6f4e37';
    const prefix = prefixes?.musicPrefix || '.';
    const embed = buildOverviewEmbed({
        color,
        prefixes: { music: prefix },
        lastFmUsername: null
    });
    embed.setTitle('Comandi - Music');
    return embed;
}

function buildPartnerManagerEmbed() {
    return new EmbedBuilder()
        .setDescription(`<:partnermanager:1443651916838998099> Questi sono i comandi che puoi usare da <@&1442568905582317740>:
                    
                    <:dot:1443660294596329582> \`!desc\` - Per inviare direttamente la descrizione (Solo ticket)
                    <:dot:1443660294596329582> \`/partnership\` - Per fare una partnership, bisogna inserire il manager (colui con cui state facendo la partner) e premere invio, nel riquadro inserire la descrzione e fare invia. (Solo ticket e <#1442569209849843823>)
                    <:dot:1443660294596329582> \`Partnership\` - Cliccando col tasto destro direttamente sul messaggio con la descrizione da mettere vi uscira "App > Partnership" il bot autocompilera il tutto e a voi bastera premere invio. (Solo ticket)
                    <:dot:1443660294596329582> \`/leaderboard\` - Per mostrare la classifica delle partnership (Sperimentale)
                    
                    <:attentionfromvega:1443651874032062505> Per segnalare un bug col bot apri un <#1442569095068254219> \`HIGH STAFF\``)
        .setColor('#6f4e37');
}

function buildRow(pageIndex, pageCount, userId) {
    const prev = new ButtonBuilder()
        .setCustomId(`help_pages:prev:${userId}`)
        .setLabel('Indietro')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex === 0);
    const next = new ButtonBuilder()
        .setCustomId(`help_pages:next:${userId}`)
        .setLabel('Avanti')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex >= pageCount - 1);
    return new ActionRowBuilder().addComponents(prev, next);
}
