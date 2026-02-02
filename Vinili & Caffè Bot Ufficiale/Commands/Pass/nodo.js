const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { NodeModel } = require('../../Schemas/Pass/node');
const { getOrCreatePassUser, spendEnergyTickets } = require('../../Services/Pass/passService');
const { grantRewards } = require('../../Services/Pass/rewardService');
const { requireActiveSeason } = require('../../Services/Pass/seasonService');
const { sendPassDm } = require('../../Services/Pass/notifyService');
module.exports = {
  skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName('nodo')
    .setDescription('Completa un nodo')
    .addStringOption(o => o.setName('id').setDescription('ID nodo').setRequired(true))
    .addStringOption(o => o.setName('azione').setDescription('Azione')
      .addChoices(
        { name: 'dettagli', value: 'dettagli' },
        { name: 'tenta', value: 'tenta' },
        { name: 'riscatta', value: 'riscatta' }
      )
    ),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const season = await requireActiveSeason(guildId);
    const nodeId = interaction.options.getString('id', true);
    const action = interaction.options.getString('azione') || 'dettagli';
    const node = await NodeModel.findOne({
      guildId,
      seasonId: season.seasonId,
      id: nodeId
    });
    if (!node) throw new Error('Nodo non trovato.');
    const u = await getOrCreatePassUser({
      guildId,
      seasonId: season.seasonId,
      userId: interaction.user.id
    });
    const { id: nodeKey, legacyId } = getDocIds(node);
    const isDone = isCompleted(u.completedNodes, nodeKey, legacyId);
    const progress = getProgressValue(u.progress, nodeKey, legacyId);
    const target = typeof node.objective?.target === 'number' ? node.objective.target : null;
    const unlocked = isUnlocked(node, u);
    if (action === 'dettagli') {
      const embed = new EmbedBuilder()
        .setTitle(`\u{1F9E9} ${nodeKey} - ${node.title || ''}`.trim())
        .setDescription(node.description || '-')
        .addFields(
          { name: 'Tipo', value: node.type || '-', inline: true },
          { name: 'Stato', value: formatStatus(isDone, unlocked), inline: true },
          { name: 'Costo', value: formatCost(node.cost), inline: true }
        );
      if (node.type === 'choice') {
        embed.addFields({ name: 'Scelta', value: formatPath(u.path), inline: true });
      } else if (target !== null) {
        embed.addFields({ name: 'Progresso', value: `${progress}/${target}`, inline: true });
      }
      embed.addFields({ name: 'Reward', value: formatRewards(node.rewards) });
      return interaction.reply({ embeds: [embed] });
    }
    if (action === 'tenta') {
      if (!unlocked) {
        return interaction.reply({ content: 'Nodo bloccato.', flags: 1 << 6 });
      }
      if (isDone) {
        return interaction.reply({ content: 'Nodo già completato.', flags: 1 << 6 });
      }
      if (node.type === 'choice') {
        if (u.path && u.path !== 'none') {
          return interaction.reply({ content: 'Hai già scelto un percorso.', flags: 1 << 6 });
        }
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`choose_path:${nodeKey}:chaos`)
            .setLabel('Caos')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`choose_path:${nodeKey}:order`)
            .setLabel('Ordine')
            .setStyle(ButtonStyle.Primary)
        );
        return interaction.reply({
          content: 'Scegli il tuo percorso:',
          components: [row],
          flags: 1 << 6
        });
      }
      if (target !== null && progress < target) {
        return interaction.reply({
          content: `Progresso insufficiente: ${progress}/${target}.`,
          flags: 1 << 6
        });
      }
      await spendEnergyTickets(u, {
        energy: node.cost?.energy || 0,
        tickets: node.cost?.tickets || 0,
        fragments: node.cost?.fragments || null,
        reason: `node_cost:${nodeKey}`
      });
      if (!u.completedNodes.includes(nodeKey)) u.completedNodes.push(nodeKey);
      if (!u.claimedRewards.includes(nodeKey)) u.claimedRewards.push(nodeKey);
      if (legacyId) {
        u.completedNodes = u.completedNodes.filter(n => n !== legacyId);
        u.claimedRewards = u.claimedRewards.filter(n => n !== legacyId);
      }
      await u.save();
      await grantRewards({
        guildId,
        seasonId: season.seasonId,
        userId: interaction.user.id,
        passUser: u,
        rewards: node.rewards,
        reason: `node_complete:${nodeKey}`
      });
      await sendPassDm(
        interaction.user.id,
        `Hai completato il nodo ${node.title || nodeKey}.`
      );
      return interaction.reply({
        content: `\u2705 Nodo **${nodeKey}** completato! Reward assegnata.`
      });
    }
    if (action === 'riscatta') {
      const alreadyClaimed =
        u.claimedRewards.includes(nodeKey) ||
        (legacyId && u.claimedRewards.includes(legacyId));
      if (!isDone) {
        return interaction.reply({ content: 'Nodo non completato.', flags: 1 << 6 });
      }
      if (alreadyClaimed) {
        return interaction.reply({ content: 'Reward già riscattata.', flags: 1 << 6 });
      }
      await grantRewards({
        guildId,
        seasonId: season.seasonId,
        userId: interaction.user.id,
        passUser: u,
        rewards: node.rewards,
        reason: `node_claim:${nodeKey}`
      });
      if (!u.claimedRewards.includes(nodeKey)) u.claimedRewards.push(nodeKey);
      if (legacyId) {
        u.claimedRewards = u.claimedRewards.filter(n => n !== legacyId);
      }
      await u.save();
      return interaction.reply({ content: '\u2705 Reward riscattata.' });
    }
  }
};
function formatStatus(isDone, unlocked) {
  if (isDone) return 'Completato';
  if (unlocked) return 'Disponibile';
  return 'Bloccato';
}
function formatPath(path) {
  if (!path || path === 'none') return 'Da scegliere';
  if (path === 'chaos') return 'Caos';
  if (path === 'order') return 'Ordine';
  return path;
}
function isUnlocked(node, user) {
  const req = node.requirements || {};
  if (req.completedNodes) {
    for (const n of req.completedNodes) {
      if (!user.completedNodes.includes(n)) return false;
    }
  }
  if (req.path && req.path !== 'neutral') {
    if (user.path !== req.path) return false;
  }
  return true;
}
function formatCost(cost) {
  if (!cost) return '-';
  const parts = [];
  const energy = cost.energy || 0;
  const tickets = cost.tickets || 0;
  parts.push(`\u26A1 ${energy}`);
  parts.push(`\u{1F39F} ${tickets}`);
  if (cost.fragments) {
    const frag = Object.entries(cost.fragments)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    if (frag) parts.push(`\u{1F9E9} ${frag}`);
  }
  return parts.join(' | ');
}
function formatRewards(r) {
  if (!r) return '-';
  const parts = [];
  if (r.tickets) parts.push(`\u{1F39F} ${r.tickets}`);
  if (r.fragments) {
    parts.push(`\u{1F9E9} ${Object.entries(r.fragments).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  }
  return parts.join(' | ') || '-';
}
function getDocIds(doc) {
  if (!doc) return { id: undefined, legacyId: undefined };
  let id;
  if (typeof doc.get === 'function') {
    id = doc.get('id');
  }
  if (!id) id = doc.id;
  let legacyId;
  if (doc._id && typeof doc._id.toString === 'function') {
    legacyId = doc._id.toString();
  }
  if (legacyId === id) legacyId = undefined;
  return { id, legacyId };
}
function getProgressValue(progressMap, id, legacyId) {
  if (!progressMap || !id) return 0;
  const val = progressMap.get(id);
  if (typeof val === 'number') return val;
  if (legacyId) {
    const legacyVal = progressMap.get(legacyId);
    if (typeof legacyVal === 'number') return legacyVal;
  }
  return 0;
}
function isCompleted(list, id, legacyId) {
  if (!Array.isArray(list) || !id) return false;
  if (list.includes(id)) return true;
  if (legacyId && list.includes(legacyId)) return true;
  return false;
}
