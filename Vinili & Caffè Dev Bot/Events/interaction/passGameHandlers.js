const { ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { getOrCreatePassUser } = require('../../Services/Pass/passService');
const { registerProgress } = require('../../Services/Pass/objectiveService');
const { registerMissionProgress } = require('../../Services/Pass/missionService');
const { grantRewards } = require('../../Services/Pass/rewardService');
const { isSameDay, startOfToday } = require('../../Utils/Pass/time');

async function handlePassGameAnswer(interaction) {
  if (!interaction.isButton()) return false;
  const isQuiz = interaction.customId.startsWith('quiz_answer:');
  const isMini = interaction.customId.startsWith('minigame_answer:');
  if (!isQuiz && !isMini) return false;
  const channelId = interaction.channel?.id;
  const client = interaction.client;
  const session = client.passGames?.get(channelId);

  if (!session || session.messageId !== interaction.message.id) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Nessun gioco attivo in questo canale.', flags: 1 << 6 });
    return true;
  }

  const parts = interaction.customId.split(':');
  const sessionId = parts[1];
  const choiceIndex = Number(parts[2]);

  if (session.sessionId !== sessionId) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Sessione non valida.', flags: 1 << 6 });
    return true;
  }

  if (session.ended) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Questo gioco è già terminato.', flags: 1 << 6 });
    return true;
  }

  if (choiceIndex !== session.correctIndex) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Risposta errata.', flags: 1 << 6 });
    return true;
  }

  session.ended = true;
  if (session.timeout) clearTimeout(session.timeout);
  client.passGames.delete(channelId);
  await interaction.deferUpdate();

  const disabled = interaction.message.components.map(row => {
    const newRow = new ActionRowBuilder();
    for (const comp of row.components) {
      newRow.addComponents(ButtonBuilder.from(comp).setDisabled(true));
    }
    return newRow;
  });

  const winnerText = `<a:VC_Winner:1448687700235256009> Vincitore: <@${interaction.user.id}>`;
  const newContent = `${interaction.message.content}\n\n${winnerText}`;
  await interaction.message.edit({ content: newContent, components: disabled }).catch(() => { });
  const u = await getOrCreatePassUser({
    guildId: session.guildId,
    seasonId: session.seasonId,
    userId: interaction.user.id
  });

  if (session.type === 'quiz') {
    await registerProgress({
      guildId: session.guildId,
      seasonId: session.seasonId,
      passUser: u,
      type: 'quiz_win',
      amount: 1
    });

    await registerMissionProgress({
      guildId: session.guildId,
      seasonId: session.seasonId,
      passUser: u,
      type: 'quiz_win',
      amount: 1
    });

    const today = startOfToday();
    u.stats.lastQuizWinAt = new Date();
    const lastCombo = u.stats.lastPartyQuizComboAt;
    const canAwardCombo = u.stats.partyToday && (!lastCombo || !isSameDay(lastCombo, today));

    if (canAwardCombo) {
      await registerProgress({
        guildId: session.guildId,
        seasonId: session.seasonId,
        passUser: u,
        type: 'party_quiz_combo',
        amount: 1
      });
      u.stats.lastPartyQuizComboAt = today;
    }
  } else {
    await registerProgress({
      guildId: session.guildId,
      seasonId: session.seasonId,
      passUser: u,
      type: 'minigame_win',
      amount: 1
    });
    await registerMissionProgress({
      guildId: session.guildId,
      seasonId: session.seasonId,
      passUser: u,
      type: 'minigame_win',
      amount: 1
    });
  }
  if (session.rewards) {
    await grantRewards({
      guildId: session.guildId,
      seasonId: session.seasonId,
      userId: interaction.user.id,
      passUser: u,
      rewards: session.rewards,
      reason: session.type === 'quiz' ? 'quiz_win' : 'minigame_win'
    });
  }
  await u.save();
  return true;
}

module.exports = { handlePassGameAnswer };