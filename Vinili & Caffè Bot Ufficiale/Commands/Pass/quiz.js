const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { getQuizQuestion } = require('../../Services/Pass/quizService');
const CONFIG = require('../../config');
function getDifficultyRewards(difficulty) {
  const rewards = CONFIG.pass.quizRewards || {};
  return rewards[difficulty] || rewards.easy || { tickets: 0, fragments: {} };
}
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Avvia un quiz')
    .addStringOption(o =>
      o.setName('difficulty')
        .setDescription('DifficoltÃ ')
        .setRequired(false)
        .addChoices(
          { name: 'easy', value: 'easy' },
          { name: 'medium', value: 'medium' },
          { name: 'hard', value: 'hard' }
        )
    )
    .addStringOption(o =>
      o.setName('source')
        .setDescription('Sorgente domande')
        .setRequired(false)
        .addChoices(
          { name: 'auto', value: 'auto' },
          { name: 'local', value: 'local' },
          { name: 'external', value: 'external' }
        )
    )
    .addIntegerOption(o =>
      o.setName('tempo')
        .setDescription('Tempo limite in secondi (default 40)')
        .setRequired(false)
    ),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const season = await requireActiveSeason(guildId);
    const difficulty = interaction.options.getString('difficulty') || 'easy';
    const source = interaction.options.getString('source') || 'auto';
    const timeLimit = interaction.options.getInteger('tempo') || 40;
    const client = interaction.client;
    if (!client.passGames) client.passGames = new Map();
    const channelId = interaction.channel?.id;
    if (!channelId) return;
    if (client.passGames.has(channelId)) {
      return interaction.reply({
        content: `âŒ C'Ã¨ giÃ  un gioco attivo in questo canale.`,
        flags: 1 << 6
      });
    }
    const question = await getQuizQuestion({
      guildId,
      seasonId: season.seasonId,
      difficulty,
      source
    });
    if (!question) {
      return interaction.reply({
        content: 'âŒ Nessuna domanda disponibile.',
        flags: 1 << 6
      });
    }
    const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const rewards = getDifficultyRewards(question.difficulty);
    const labels = ['A', 'B', 'C', 'D'];
    const rows = [];
    const buttons = question.options.slice(0, 4).map((opt, idx) => {
      const label = `${labels[idx]}: ${opt}`.slice(0, 80);
      return new ButtonBuilder()
        .setCustomId(`quiz_answer:${sessionId}:${idx}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary);
    });
    rows.push(new ActionRowBuilder().addComponents(buttons));
    const content =
      `â” Quiz (${question.difficulty})\n` +
      `â“ Domanda: ${question.question}\n` +
      question.options.map((o, i) => `${labels[i]}) ${o}`).join('\n');
    await interaction.reply({ content, components: rows });
    const msg = await interaction.fetchReply();
    const timeout = setTimeout(async () => {
      const active = client.passGames.get(channelId);
      if (!active || active.sessionId !== sessionId || active.ended) return;
      active.ended = true;
      client.passGames.delete(channelId);
      try {
        const disabled = rows.map(row => {
          const newRow = ActionRowBuilder.from(row);
          newRow.components = newRow.components.map(b => ButtonBuilder.from(b).setDisabled(true));
          return newRow;
        });
        await msg.edit({ content: `${content}\n\n â° Tempo scaduto.`, components: disabled });
      } catch {}
    }, Math.max(10, timeLimit) * 1000);
    client.passGames.set(channelId, {
      sessionId,
      type: 'quiz',
      guildId,
      seasonId: season.seasonId,
      messageId: msg.id,
      channelId,
      correctIndex: question.answerIndex,
      rewards,
      difficulty: question.difficulty,
      ended: false,
      timeout
    });
  }
};
