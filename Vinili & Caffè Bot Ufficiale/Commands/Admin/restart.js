const { SlashCommandBuilder } = require('discord.js');
const { safeReply } = require('../../Utils/Moderation/reply');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const RESTART_FLAG = 'restart.json';
const RESTART_NOTIFY_PREFIX = 'restart_notify_';
const RESTART_WATCH_PREFIX = 'restart_watch_';

function pullLatest() {
    try {
        const repoRoot = path.resolve(process.cwd(), '..');
        if (!fs.existsSync(path.join(repoRoot, '.git'))) return;
        const branch = process.env.GIT_BRANCH || 'main';
        child_process.spawnSync('git', ['pull', 'origin', branch, '--ff-only'], { cwd: repoRoot, stdio: 'inherit' });
        child_process.spawnSync('git', ['submodule', 'update', '--init', '--recursive'], { cwd: repoRoot, stdio: 'inherit' });
    } catch {}
}

function writeRestartNotify(target, payload) {
    try {
        const flagPath = path.resolve(process.cwd(), '..', `${RESTART_NOTIFY_PREFIX}${target}.json`);
        fs.writeFileSync(flagPath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {}
}

function writeRestartWatch(target, payload) {
    try {
        const flagPath = path.resolve(process.cwd(), '..', `${RESTART_WATCH_PREFIX}${target}.json`);
        fs.writeFileSync(flagPath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {}
}

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
                { name: 'Dev', value: 'dev' },
                { name: 'Entrambi', value: 'both' }
            ))
        .addStringOption(opt => opt
            .setName('scope')
            .setDescription('Cosa vuoi riavviare')
            .setRequired(false)
            .addChoices(
                { name: 'Full', value: 'full' },
                { name: 'Handlers', value: 'handlers' },
                { name: 'Commands', value: 'commands' },
                { name: 'Prefix', value: 'prefix' },
                { name: 'Events', value: 'events' },
                { name: 'Triggers', value: 'triggers' },
                { name: 'Services', value: 'services' },
                { name: 'Utils', value: 'utils' },
                { name: 'Schemas', value: 'schemas' },
                { name: 'All', value: 'all' }
            )),

    async execute(interaction) {
        try {
            const target = interaction.options.getString('target');
            const scope = interaction.options.getString('scope') || 'full';
            if (target !== 'official' && target !== 'dev' && target !== 'both') {
                return safeReply(interaction, { content: 'Target non valido.', flags: 1 << 6 });
            }
            const isOfficial = process.cwd().toLowerCase().includes('ufficiale');
            const currentTarget = isOfficial ? 'official' : 'dev';
            const requestedAt = new Date().toISOString();
            const requestId = `${Date.now()}_${interaction.id || interaction.user.id}`;
            const channelId = interaction.channelId || null;
            if (scope === 'full') {
                const targets = target === 'both' ? ['official', 'dev'] : [target];
                const flagPath = path.resolve(process.cwd(), '..', RESTART_FLAG);
                fs.writeFileSync(flagPath, JSON.stringify({
                    targets,
                    respectDelay: target === 'both',
                    by: interaction.user.id,
                    at: requestedAt
                }, null, 2), 'utf8');
                for (const t of targets) {
                    writeRestartNotify(t, {
                        channelId,
                        by: interaction.user.id,
                        at: requestedAt,
                        scope: 'full',
                        target: t,
                        requestId
                    });
                    writeRestartWatch(t, {
                        channelId,
                        by: interaction.user.id,
                        at: requestedAt,
                        scope: 'full',
                        target: t,
                        requestId
                    });
                }
                return safeReply(interaction, { content: `Riavvio ${target} richiesto. Ti avviso qui quando Ã¨ completato.`, flags: 1 << 6 });
            }

            if (target === 'both') {
                const otherTarget = currentTarget === 'official' ? 'dev' : 'official';
                const remoteFlag = path.resolve(process.cwd(), '..', `reload_${otherTarget}.json`);
                fs.writeFileSync(remoteFlag, JSON.stringify({
                    scope,
                    gitPull: true,
                    by: interaction.user.id,
                    at: requestedAt,
                    channelId,
                    requestId,
                    target: otherTarget
                }, null, 2), 'utf8');
                const start = Date.now();
                pullLatest();
                await interaction.client.reloadScope(scope);
                const elapsed = Math.max(1, Math.round((Date.now() - start) / 1000));
                return safeReply(interaction, {
                    content: `Reload ${scope} completato su ${currentTarget} in ${elapsed}s. Conferma per ${otherTarget} in arrivo qui.`,
                    flags: 1 << 6
                });
            }

            if (target !== currentTarget) {
                const remoteFlag = path.resolve(process.cwd(), '..', `reload_${target}.json`);
                fs.writeFileSync(remoteFlag, JSON.stringify({
                    scope,
                    gitPull: true,
                    by: interaction.user.id,
                    at: requestedAt,
                    channelId,
                    requestId,
                    target
                }, null, 2), 'utf8');
                return safeReply(interaction, { content: `Reload ${scope} richiesto su ${target}. Ti avviso qui quando Ã¨ completato.`, flags: 1 << 6 });
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

            const start = Date.now();
            pullLatest();
            await interaction.client.reloadScope(scope);
            const elapsed = Math.max(1, Math.round((Date.now() - start) / 1000));
            await safeReply(interaction, { content: `Reload ${scope} completato per ${target} in ${elapsed}s.`, flags: 1 << 6 });
        } catch (error) {
            global.logger.error(error);
            await safeReply(interaction, { content: 'Errore durante il riavvio.', flags: 1 << 6 });
        }
    }
};
