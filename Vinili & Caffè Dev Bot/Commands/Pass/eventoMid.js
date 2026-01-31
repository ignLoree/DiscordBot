const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { getOrCreatePassUser } = require('../../Services/Pass/passService');
const { registerProgress } = require('../../Services/Pass/objectiveService');
const { registerMissionProgress } = require('../../Services/Pass/missionService');
const { grantRewards } = require('../../Services/Pass/rewardService');
const CONFIG = require('../../config');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('evento-midseason')
    .setDescription('Registra partecipazione evento di meta stagione')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o =>
      o.setName('utente')
        .setDescription('Utente a cui registrare la partecipazione (default: autore)')
        .setRequired(false)
    ),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const season = await requireActiveSeason(guildId);
    const target = interaction.options.getUser('utente') || interaction.user;
    const u = await getOrCreatePassUser({
      guildId,
      seasonId: season.seasonId,
      userId: target.id
    });
    await registerProgress({
      guildId,
      seasonId: season.seasonId,
      passUser: u,
      type: 'midseason_event',
      amount: 1
    });
    await registerMissionProgress({
      guildId,
      seasonId: season.seasonId,
      passUser: u,
      type: 'midseason_event',
      amount: 1
    });
    if (CONFIG.pass.midseasonRewards) {
      await grantRewards({
        guildId,
        seasonId: season.seasonId,
        userId: target.id,
        passUser: u,
        rewards: CONFIG.pass.midseasonRewards,
        reason: 'midseason_event'
      });
    }
return interaction.reply({
      content: `âœ… Evento metÃ  stagione registrato per <@${target.id}>.`,
      allowedMentions: { users: [target.id] }
    });
  }
};
