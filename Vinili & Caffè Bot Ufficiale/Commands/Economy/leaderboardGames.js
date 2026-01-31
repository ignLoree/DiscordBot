const { SlashCommandBuilder } = require('discord.js');
const { EngagementStats } = require('../../Schemas/Engagement/engagementStats');
function pickField(type) {
  if (type === 'quiz') return 'winsQuiz';
  if (type === 'scramble') return 'winsScramble';
  if (type === 'flag') return 'winsFlag';
  if (type === 'player') return 'winsPlayer';
  return 'winsTotal';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard-giochi')
    .setDescription('Classifica giochi community')
    .addStringOption(o =>
      o.setName('tipo')
        .setDescription('Tipo classifica')
        .setRequired(false)
        .addChoices(
          { name: 'quiz', value: 'quiz' },
          { name: 'scramble', value: 'scramble' },
          { name: 'flag', value: 'flag' },
          { name: 'calciatore', value: 'player' },
          { name: 'totale', value: 'total' }
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const type = interaction.options.getString('tipo') || 'total';
    const field = pickField(type);
    const rows = await EngagementStats.find({ guildId })
      .sort({ [field]: -1 })
      .limit(10)
      .lean();
    if (!rows.length) {
      return interaction.reply({ content: '<:vegax:1443934876440068179> Nessun dato disponibile.' });
    }
    const lines = [];
    let idx = 1;
    for (const row of rows) {
      const user = await interaction.client.users.fetch(row.userId).catch(() => null);
      const name = user ? user.username : row.userId;
      if (type === 'total') {
        const quiz = row.winsQuiz || 0;
        const scramble = row.winsScramble || 0;
        const flag = row.winsFlag || 0;
        const player = row.winsPlayer || 0;
        const total = row.winsTotal || (quiz + scramble + flag + player);
        lines.push(`**${idx}.** ${name} - Quiz: ${quiz} | Indovina la parola: ${scramble} | Bandiere: ${flag} | Calciatore: ${player} | Totale: ${total}`);
      } else {
        const count = row[field] || 0;
        lines.push(`**${idx}.** ${name} - ${count}`);
      }
      idx += 1;
    }
    return interaction.reply({
      content: `<a:VC_Winner:1448687700235256009> Classifica ${type}:\n${lines.join('\n')}`
    });
  }
};
