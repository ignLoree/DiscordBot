const { EmbedBuilder } = require('discord.js');
const { RaidState } = require('../../Schemas/Pass/raidState');

async function buildRaidEmbed(season, guildId) {
  const raid = await RaidState.findOne({
    guildId,
    seasonId: season.seasonId
  });
  if (!raid || !raid.active) {
    return new EmbedBuilder()
      .setTitle('🐉 Raid')
      .setDescription('<:vegax:1443934876440068179> Nessun raid attivo');
  }
  return new EmbedBuilder()
    .setTitle('🐉 Raid Boss')
    .addFields(
      {
        name: '💔 HP',
        value: `${raid.boss.hpNow}/${raid.boss.hpMax}`,
        inline: true
      },
      { name: '📊 Fase', value: `${raid.boss.phase}`, inline: true }
    );
}

module.exports = { buildRaidEmbed };