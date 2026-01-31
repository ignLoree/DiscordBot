const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { getOrCreatePassUser } = require('../../Services/Pass/passService');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('inventario')
    .setDescription('Mostra il tuo inventario'),
  async execute(interaction) {
    const season = await requireActiveSeason(interaction.guild.id);
    const u = await getOrCreatePassUser({
      guildId: interaction.guild.id,
      seasonId: season.seasonId,
      userId: interaction.user.id
    });
    const fragments = [...u.fragments.entries()]
      .map(([k, v]) => `${k}: ${v}`)
      .join(' | ') || '-';
    const embed = new EmbedBuilder()
      .setTitle('\u{1F392} Inventario')
      .addFields(
        { name: '\u{1F39F} Ticket', value: `${u.tickets}`, inline: true },
        { name: '\u{1F9E9} Frammenti', value: fragments }
      );
    await interaction.reply({ embeds: [embed] });
  }
};
