const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { getMinigame } = require('../../Services/Pass/minigameService');
const CONFIG = require('../../config');
function getDifficultyRewards(difficulty) {
  const rewards = CONFIG.pass.minigameRewards || {};
  return rewards[difficulty] || rewards.easy || { tickets: 0, fragments: {} };
}
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('minigioco')
    .setDescription('Avvia un minigioco')
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
      o.setName('tipo')
        .setDescription('Tipo minigioco')
        .setRequired(false)
        .addChoices(
          { name: 'math', value: 'math' },
          { name: 'scramble', value: 'scramble' },
          { name: 'logic', value: 'logic' }
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
    const tipo = interaction.options.getString('tipo') || null;
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
    const game = await getMinigame({
      guildId,
      seasonId: season.seasonId,
      difficulty,
      type: tipo
    });
    if (!game) {
      return interaction.reply({
        content: 'âŒ Nessun minigioco disponibile.',
        flags: 1 << 6
      });
    }
    const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const rewards = getDifficultyRewards(game.difficulty);
    const labels = ['A', 'B', 'C', 'D'];
    const rows = [];
    const buttons = game.options.slice(0, 4).map((opt, idx) => {
      const label = `${labels[idx]}: ${opt}`.slice(0, 80);
      return new ButtonBuilder()
        .setCustomId(`minigame_answer:${sessionId}:${idx}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary);
    });
    rows.push(new ActionRowBuilder().addComponents(buttons));
    const content =
      `ðŸŽ² Minigioco (${game.difficulty}) - ${game.title}\n` +
      `${game.description}\n` +
      `ðŸ¤– Prompt: ${game.prompt}\n` +
      game.options.map((o, i) => `${labels[i]}) ${o}`).join('\n');
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
        await msg.edit({ content: `${content}\n\nâ° Tempo scaduto.`, components: disabled });
      } catch {}
    }, Math.max(10, timeLimit) * 1000);
    client.passGames.set(channelId, {
      sessionId,
      type: 'minigame',
      guildId,
      seasonId: season.seasonId,
      messageId: msg.id,
      channelId,
      correctIndex: game.answerIndex,
      rewards,
      difficulty: game.difficulty,
      ended: false,
      timeout
    });
  }
};
