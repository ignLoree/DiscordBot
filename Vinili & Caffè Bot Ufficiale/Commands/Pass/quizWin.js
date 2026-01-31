const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { getOrCreatePassUser } = require('../../Services/Pass/passService');
const { registerProgress } = require('../../Services/Pass/objectiveService');
const { registerMissionProgress } = require('../../Services/Pass/missionService');
const { isSameDay, startOfToday } = require('../../Utils/Pass/time');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('quiz-win')
    .setDescription('Registra una vittoria al quiz')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o =>
      o.setName('utente')
        .setDescription('Utente a cui registrare la vittoria (default: autore)')
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
      type: 'quiz_win',
      amount: 1
    });
    await registerMissionProgress({
      guildId,
      seasonId: season.seasonId,
      passUser: u,
      type: 'quiz_win',
      amount: 1
    });
    const today = startOfToday();
    u.stats.lastQuizWinAt = new Date();
    const lastCombo = u.stats.lastPartyQuizComboAt;
    const canAwardCombo =
      u.stats.partyToday &&
      (!lastCombo || !isSameDay(lastCombo, today));
    if (canAwardCombo) {
      await registerProgress({
        guildId,
        seasonId: season.seasonId,
        passUser: u,
        type: 'party_quiz_combo',
        amount: 1
      });
      u.stats.lastPartyQuizComboAt = today;
    }
    await u.save();
    return interaction.reply({
      content: `âœ… Quiz registrato per <@${target.id}>.`,
      allowedMentions: { users: [target.id] }
    });
  }
};
