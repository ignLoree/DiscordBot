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
    .setName('evento')
    .setDescription('Registra partecipazione a un evento')
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
      type: 'event_participation',
      amount: 1
    });
    await registerMissionProgress({
      guildId,
      seasonId: season.seasonId,
      passUser: u,
      type: 'event_participation',
      amount: 1
    });
    if (CONFIG.pass.eventRewards) {
      await grantRewards({
        guildId,
        seasonId: season.seasonId,
        userId: target.id,
        passUser: u,
        rewards: CONFIG.pass.eventRewards,
        reason: 'event_participation'
      });
    }
return interaction.reply({
      content: `âœ… Partecipazione evento registrata per <@${target.id}>.`,
      allowedMentions: { users: [target.id] }
    });
  }
};
