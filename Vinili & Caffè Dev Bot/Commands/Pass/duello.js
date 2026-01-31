const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { getOrCreatePassUser } = require('../../Services/Pass/passService');
const { registerProgress } = require('../../Services/Pass/objectiveService');
const { registerMissionProgress } = require('../../Services/Pass/missionService');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('duello-win')
    .setDescription('Registra una vittoria 1v1')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o =>
      o.setName('utente')
        .setDescription('Utente a cui registrare la vittoria (default: autore)')
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
      type: 'duel_wins',
      amount
    });
    await registerMissionProgress({
      guildId,
      seasonId: season.seasonId,
      passUser: u,
      type: 'duel_wins',
      amount
    });
    return interaction.reply({
      content: `âœ… Duello registrato per <@${target.id}> (x${amount}).`,
      allowedMentions: { users: [target.id] }
    });
  }
};
