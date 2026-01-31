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
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            const target = interaction.options.getString('target');
            const flag = FLAG_MAP[target];
            if (!flag) {
                return safeReply(interaction, { content: 'Target non valido.', flags: 1 << 6 });
            }
            const flagPath = path.resolve(process.cwd(), '..', flag);
            fs.writeFileSync(flagPath, `${new Date().toISOString()} | ${interaction.user.id}\n`, 'utf8');
            await safeReply(interaction, { content: `Riavvio ${target} richiesto.`, flags: 1 << 6 });
        } catch (error) {
            global.logger.error(error);
            await safeReply(interaction, { content: 'Errore durante il riavvio.', flags: 1 << 6 });
        }
    }
};
