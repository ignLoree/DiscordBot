const { ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { addCurrency } = require('../../Services/Economy/economyService');
const { addWin } = require('../../Services/Economy/engagementStatsService');
const { startQuizLoopNext } = require('../../Services/Economy/engagementService');
const CONFIG = require('../../config');

function getRewardsForType(type) {
  const rewards = CONFIG.engagement.rewards || {};
  return rewards[type] || { coffee: 1, vinyl: 0 };
}

async function handleEngagementAnswer(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('engage_answer:')) return false;
  const channelId = interaction.channel?.id;
  const client = interaction.client;
  const session = client.engagementSessions?.get(channelId);
  const parts = interaction.customId.split(':');
  const sessionId = parts[1];
  const choiceIndex = Number(parts[2]);
  
  if (!session || session.messageId !== interaction.message.id) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Nessun evento attivo in questo canale.', flags: 1 << 6 });
    return true;
  }

  if (session.sessionId !== sessionId) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Sessione non valida.', flags: 1 << 6 });
    return true;
  }

  if (session.ended) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Questo evento è già terminato.', flags: 1 << 6 });
    return true;
  }

  if (choiceIndex !== session.correctIndex) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Risposta errata.', flags: 1 << 6 });
    return true;
  }
  
  session.ended = true;
  if (session.timeout) clearTimeout(session.timeout);
  client.engagementSessions.delete(channelId);
  await interaction.deferUpdate();

  const disabled = interaction.message.components.map(row => {
    const newRow = new ActionRowBuilder();
    for (const comp of row.components) {
      newRow.addComponents(ButtonBuilder.from(comp).setDisabled(true));
    }
    return newRow;
  });

  const rewards = session.rewards || getRewardsForType(session.type);
  await addCurrency({
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    coffee: rewards.coffee || 0,
    vinyl: rewards.vinyl || 0
  });

  await addWin({ guildId: interaction.guild.id, userId: interaction.user.id, type: session.type });
  const partsText = [];
  if (rewards.coffee) partsText.push(`+${rewards.coffee} ☕ Caffè`);
  if (rewards.vinyl) partsText.push(`+${rewards.vinyl} 📀 Vinili`);
  const prizeText = partsText.length ? ` (${partsText.join(', ')})` : '';
  
  await interaction.message.edit({
    content: `${interaction.message.content}\n\n<a:VC_Winner:1448687700235256009> Vincitore: <@${interaction.user.id}>${prizeText}`,
    components: disabled
  }).catch(() => {});
  const loopCfg = CONFIG.engagementQuizLoop || {};
  if (loopCfg.enabled && interaction.channel?.id === loopCfg.channelId) {
    setTimeout(() => {
      startQuizLoopNext(interaction.client, interaction.channel).catch(() => {});
    }, 1000);
  }
  return true;
}

module.exports = { handleEngagementAnswer };
