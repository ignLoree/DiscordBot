const { SlashCommandBuilder } = require('discord.js');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { getOrCreatePassUser } = require('../../Services/Pass/passService');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('party')
    .setDescription('Attiva un party in vocale (minimo 2 utenti)'),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const season = await requireActiveSeason(guildId);
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: 'âŒ Devi essere in un canale vocale per attivare il party.',
        flags: 1 << 6
      });
    }
    const members = [...voiceChannel.members.values()].filter(m => !m.user.bot);
    if (members.length < 2) {
      return interaction.reply({
        content: 'âŒ Servono almeno 2 utenti in vocale per attivare il party.',
        flags: 1 << 6
      });
    }
    const now = new Date();
    for (const m of members) {
      const u = await getOrCreatePassUser({
        guildId,
        seasonId: season.seasonId,
        userId: m.id
      });
      u.stats.partyToday = true;
      u.stats.lastPartyAt = now;
      await u.save();
    }
    return interaction.reply({
      content: `âœ… Party attivato in ${voiceChannel} per ${members.length} utenti.`
    });
  }
};
