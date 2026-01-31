const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { getOrCreateRaid, applyRaidDamage } = require('../../Services/Pass/raidService');
const { getOrCreatePassUser, spendEnergyTickets } = require('../../Services/Pass/passService');
const { registerProgress } = require('../../Services/Pass/objectiveService')
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Raid cooperativo del server')
    .addStringOption(o => o.setName('azione').setDescription('Azione')
      .addChoices(
        { name: 'stato', value: 'stato' },
        { name: 'contribuisci', value: 'contribuisci' }
      )
    ),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const season = await requireActiveSeason(guildId);
    const action = interaction.options.getString('azione') || 'stato';
    const raid = await getOrCreateRaid({ guildId, seasonId: season.seasonId });
    if (action === 'stato') {
      const embed = new EmbedBuilder()
        .setTitle('ðŸ‰ Raid Boss')
        .setDescription(raid.active ? `ðŸ•°ï¸ Attivo fino a <t:${Math.floor(new Date(raid.boss.endsAt).getTime() / 1000)}:R>` : 'Nessun raid attivo.')
        .addFields(
          { name: 'ðŸ’” HP', value: `${raid.boss.hpNow}/${raid.boss.hpMax}`, inline: true },
          { name: 'ðŸ“Š Fase', value: `${raid.boss.phase}`, inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    }
    if (!raid.active) throw new Error('Nessun raid attivo.');
    const u = await getOrCreatePassUser({ guildId, seasonId: season.seasonId, userId: interaction.user.id });
    await spendEnergyTickets(u, { energy: 1, tickets: 0 });
    const dmg = 50 + Math.floor(Math.random() * 51);
    await applyRaidDamage({ raid, userId: interaction.user.id, amount: dmg });
    u.stats.raidDamage += dmg;
    await u.save();
    await registerProgress({
      guildId,
      seasonId: season.seasonId,
      passUser: u,
      type: 'raid_contribute',
      amount: 1
    });
    return interaction.reply({ content: `âš”ï¸ Hai inflitto **${dmg}** danni al boss! (Energia -1)` });
  }
};
