const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { topPass, topRaid } = require('../../Services/Pass/leaderboardService');
const { fetchMembersSafe } = require('../../Utils/Moderation/discordFetch');
module.exports = {
    skipDeploy: true,
    data: new SlashCommandBuilder()
        .setName('classifica')
        .setDescription('Classifiche del Pass')
        .addStringOption(o => o.setName('tipo').setDescription('Tipo')
            .addChoices(
                { name: 'pass', value: 'pass' },
                { name: 'raid', value: 'raid' }
            )
        ),
    async execute(interaction) {
        const guildId = interaction.guild.id;
        const season = await requireActiveSeason(guildId);
        const type = interaction.options.getString('tipo') || 'pass';
        const rows = type === 'raid'
            ? await topRaid({ guildId, seasonId: season.seasonId, limit: 10 })
            : await topPass({ guildId, seasonId: season.seasonId, limit: 10 });
        const ids = rows.map(r => r.userId);
        const members = await fetchMembersSafe(interaction.guild, ids);
        const lines = rows.map((r, i) => {
            const member = members?.get(r.userId);
            const name = member?.user?.username || r.userId;
            if (type === 'raid') return `**${i + 1}.** ${name} â€” ðŸ‰ ${r.raidDamage}`;
            return `**${i + 1}.** ${name} â€” âœ… ${r.completedCount} | ðŸŽŸï¸ ${r.tickets}`;
        });
        const embed = new EmbedBuilder()
            .setTitle(`ðŸ† Classifica â€” ${type.toUpperCase()}`)
            .setDescription(lines.join('\n') || 'Nessun dato.');
        await interaction.reply({ embeds: [embed] });
    }
};
