const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { getOrCreatePassUser } = require('../../Services/Pass/passService');
const { registerProgress } = require('../../Services/Pass/objectiveService');
const { registerMissionProgress } = require('../../Services/Pass/missionService');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('coop-mission')
    .setDescription('Registra una missione cooperativa')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o =>
      o.setName('utente')
        .setDescription('Utente a cui registrare una missione cooperativa (default: autore)')
        .setRequired(false)
    )
    .addIntegerOption(o =>
      o.setName('amount')
        .setDescription('QuantitÃ  (default 1)')
        .setRequired(false)
    ),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const season = await requireActiveSeason(guildId);
    const target = interaction.options.getUser('utente') || interaction.user;
    const amount = interaction.options.getInteger('amount') || 1;
    const u = await getOrCreatePassUser({
      guildId,
      seasonId: season.seasonId,
      userId: target.id
    });
    await registerProgress({
      guildId,
      seasonId: season.seasonId,
      passUser: u,
      type: 'coop_missions',
      amount
    });
    await registerMissionProgress({
      guildId,
      seasonId: season.seasonId,
      passUser: u,
      type: 'coop_missions',
      amount
    });
    return interaction.reply({
      content: `âœ… Missione coop registrata per <@${target.id}> (x${amount}).`,
      allowedMentions: { users: [target.id] }
    });
  }
};
