const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { safeReply } = require('../../Utils/Moderation/interaction');
const fs = require('fs');
const path = require('path');

const FLAG_MAP = {
    official: 'restart_official',
    dev: 'restart_dev'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restart')
        .setDescription('Riavvia uno dei bot tramite loader.')
        .addStringOption(opt => opt
            .setName('target')
            .setDescription('Quale bot riavviare')
            .setRequired(true)
            .addChoices(
                { name: 'Ufficiale', value: 'official' },
                { name: 'Dev', value: 'dev' }
            ))
        .addStringOption(opt => opt
            .setName('scope')
            .setDescription('Cosa vuoi riavviare')
            .setRequired(false)
            .addChoices(
                { name: 'Full (riavvia bot)', value: 'full' },
                { name: 'Handlers (events+triggers+commands+prefix)', value: 'handlers' },
                { name: 'Commands', value: 'commands' },
                { name: 'Prefix', value: 'prefix' },
                { name: 'Events', value: 'events' },
                { name: 'Triggers', value: 'triggers' },
                { name: 'Services', value: 'services' },
                { name: 'Utils', value: 'utils' },
                { name: 'Schemas', value: 'schemas' },
                { name: 'All (tutte le cartelle)', value: 'all' }
            ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            const target = interaction.options.getString('target');
            const scope = interaction.options.getString('scope') || 'full';
            const flag = FLAG_MAP[target];
            if (!flag) {
                return safeReply(interaction, { content: 'Target non valido.', flags: 1 << 6 });
            }
            const isOfficial = process.cwd().toLowerCase().includes('ufficiale');
            const currentTarget = isOfficial ? 'official' : 'dev';
            if (scope === 'full') {
                const flagPath = path.resolve(process.cwd(), '..', flag);
                fs.writeFileSync(flagPath, `${new Date().toISOString()} | ${interaction.user.id}\n`, 'utf8');
                return safeReply(interaction, { content: `Riavvio ${target} richiesto.`, flags: 1 << 6 });
            }

            if (target !== currentTarget) {
                const remoteFlag = path.resolve(process.cwd(), '..', `reload_${target}.json`);
                fs.writeFileSync(remoteFlag, JSON.stringify({
                    scope,
                    by: interaction.user.id,
                    at: new Date().toISOString()
                }, null, 2), 'utf8');
                return safeReply(interaction, { content: `Reload ${scope} richiesto su ${target}.`, flags: 1 << 6 });
            }

            const baseDir = process.cwd();
            const clearCacheByDir = (dirName) => {
                const abs = path.join(baseDir, dirName);
                if (!fs.existsSync(abs)) return;
                for (const key of Object.keys(require.cache)) {
                    if (key.startsWith(abs)) {
                        delete require.cache[key];
                    }
                }
            };
            const reloadCommands = async () => {
                clearCacheByDir('Commands');
                const commandFolders = fs.readdirSync(path.join(baseDir, 'Commands'));
                await interaction.client.handleCommands(commandFolders, './Commands');
            };
            const reloadPrefix = async () => {
                clearCacheByDir('Prefix');
                const folders = fs.readdirSync(path.join(baseDir, 'Prefix'));
                await interaction.client.prefixCommands(folders, './Prefix');
            };
            const reloadEvents = () => {
                clearCacheByDir('Events');
                interaction.client.handleEvents('./Events');
            };
            const reloadTriggers = () => {
                clearCacheByDir('Triggers');
                const triggerFiles = fs.readdirSync(path.join(baseDir, 'Triggers')).filter((f) => f.endsWith('.js'));
                interaction.client.handleTriggers(triggerFiles, './Triggers');
            };

            await interaction.client.reloadScope(scope);
            await safeReply(interaction, { content: `Reload ${scope} completato per ${target}.`, flags: 1 << 6 });
        } catch (error) {
            global.logger.error(error);
            await safeReply(interaction, { content: 'Errore durante il riavvio.', flags: 1 << 6 });
        }
    }
};
