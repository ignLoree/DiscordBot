const { SlashCommandBuilder } = require('discord.js');
const { safeReply } = require('../../Utils/Moderation/reply');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const RESTART_FLAG = 'restart.json';

function pullLatest() {
    try {
        const repoRoot = path.resolve(process.cwd(), '..');
        if (!fs.existsSync(path.join(repoRoot, '.git'))) return;
        const branch = process.env.GIT_BRANCH || 'main';
        child_process.spawnSync('git', ['pull', 'origin', branch, '--ff-only'], { cwd: repoRoot, stdio: 'inherit' });
        child_process.spawnSync('git', ['submodule', 'update', '--init', '--recursive'], { cwd: repoRoot, stdio: 'inherit' });
    } catch {}
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restart')
        .setDescription('Riavvia il bot o ricarica moduli.')
        .addStringOption((opt) =>
            opt
                .setName('scope')
                .setDescription('Cosa vuoi ricaricare')
                .setRequired(false)
                .addChoices(
                    { name: 'Full (riavvio processo)', value: 'full' },
                    { name: 'Handlers', value: 'handlers' },
                    { name: 'Commands', value: 'commands' },
                    { name: 'Prefix', value: 'prefix' },
                    { name: 'Events', value: 'events' },
                    { name: 'Triggers', value: 'triggers' },
                    { name: 'Services', value: 'services' },
                    { name: 'Utils', value: 'utils' },
                    { name: 'Schemas', value: 'schemas' },
                    { name: 'All', value: 'all' }
                )
        ),

    async execute(interaction) {
        try {
            const scope = interaction.options.getString('scope') || 'full';
            const requestedAt = new Date().toISOString();
            const channelId = interaction.channelId || null;

            if (scope === 'full') {
                await safeReply(interaction, {
                    content: 'Riavvio richiesto. Ti avviso qui quando è completato.',
                    flags: 1 << 6
                });

                const notifyPath = path.resolve(process.cwd(), '..', 'restart_notify.json');
                fs.writeFileSync(
                    notifyPath,
                    JSON.stringify({ channelId, by: interaction.user.id, at: requestedAt, scope: 'full' }, null, 2),
                    'utf8'
                );

                const flagPath = path.resolve(process.cwd(), '..', RESTART_FLAG);
                fs.writeFileSync(flagPath, JSON.stringify({ at: requestedAt, by: interaction.user.id }, null, 2), 'utf8');
                return;
            }

            const start = Date.now();
            pullLatest();
            await interaction.client.reloadScope(scope);
            const elapsed = Math.max(1, Math.round((Date.now() - start) / 1000));
            return safeReply(interaction, {
                content: `Reload ${scope} completato in ${elapsed}s.`,
                flags: 1 << 6
            });
        } catch (error) {
            global.logger.error(error);
            return safeReply(interaction, { content: 'Errore durante il restart/reload.', flags: 1 << 6 });
        }
    }
};
