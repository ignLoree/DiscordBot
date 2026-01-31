const { SlashCommandBuilder } = require('discord.js');
const { Wallet } = require('../../Schemas/Economy/wallet');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard-valute')
    .setDescription('Classifica valute community')
    .addStringOption(o =>
      o.setName('valuta')
        .setDescription('Valuta per ordinare la classifica')
        .setRequired(false)
        .addChoices(
          { name: 'caffè', value: 'coffee' },
          { name: 'vinili', value: 'vinyl' }
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const currency = interaction.options.getString('valuta') || 'coffee';
    let rows = await Wallet.find({ guildId }).limit(50).lean();
    if (!rows.length) {
      return interaction.reply({ content: '<:vegax:1443934876440068179> Nessun dato disponibile.' });
    }
    rows = rows.sort((a, b) => (b[currency] || 0) - (a[currency] || 0));
    const top = rows.slice(0, 10);
    const lines = [];
    let idx = 1;
    for (const row of top) {
      const user = await interaction.client.users.fetch(row.userId).catch(() => null);
      const name = user ? user.username : row.userId;
      const coffee = row.coffee || 0;
      const vinyl = row.vinyl || 0;
      lines.push(`**${idx}.** ${name} - ☕ Caffè: ${coffee} | 📀 Vinili: ${vinyl}`);
      idx += 1;
    }
    return interaction.reply({
      content: `<:VC_Wallet:1462794843746205815> Classifica valute (ordine: ${currency}):\n${lines.join('\n')}`
    });
  }
};