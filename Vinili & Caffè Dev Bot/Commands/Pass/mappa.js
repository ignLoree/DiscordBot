const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { NodeModel } = require('../../Schemas/Pass/node');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { getOrCreatePassUser } = require('../../Services/Pass/passService');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('mappa')
    .setDescription('Mappa nodi')
    .addIntegerOption(o => o.setName('zona').setDescription('Zona').addChoices(
      { name: '1', value: 1 }, { name: '2', value: 2 }, { name: '3', value: 3 }, { name: '4', value: 4 }
    ))
    .addBooleanOption(o => o.setName('solo_disponibili').setDescription('Mostra solo nodi sbloccati')),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const season = await requireActiveSeason(guildId);
    const u = await getOrCreatePassUser({ guildId, seasonId: season.seasonId, userId: interaction.user.id });
    const zone = interaction.options.getInteger('zona') ?? 1;
    const only = interaction.options.getBoolean('solo_disponibili') ?? false;
    const nodes = await NodeModel.find({ guildId, seasonId: season.seasonId, zone }).lean();
    const lines = nodes
      .filter(n => !only || isUnlocked(n, u))
      .map(n => {
        const done = u.completedNodes.includes(n.id);
        const unlocked = isUnlocked(n, u);
        const icon = done ? 'âœ…' : (unlocked ? '\u23F3' : '\u{1F512}');
        const desc = n.description ? ` - ${truncate(n.description, 80)}` : '';
        return `${icon} **${n.id}** - ${n.title} \`${n.type}\`${desc}`;
      });
    const embed = new EmbedBuilder()
      .setTitle(`ðŸ—ºï¸ Mappa Pass - Zona ${zone}`)
      .setDescription(lines.join('\n') || 'Nessun nodo trovato.')
      .setFooter({ text: 'Usa /nodo id:<id> per dettagli e tentare' });
    await interaction.reply({ embeds: [embed] });
  }
};
function truncate(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}
function isUnlocked(node, user) {
  const req = node.requirements || {};
  if (req.completedNodes) {
    for (const n of req.completedNodes) if (!user.completedNodes.includes(n)) return false;
  }
  if (req.path && req.path !== 'neutral') {
    if (user.path !== req.path) return false;
  }
  return true;
}
