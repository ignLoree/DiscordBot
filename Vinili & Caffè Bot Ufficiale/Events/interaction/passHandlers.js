const { getOrCreatePassUser } = require('../../Services/Pass/passService.js');
const { requireActiveSeason } = require('../../Services/Pass/seasonService.js');
const { buildProfileEmbed } = require('../../UI/Pass/profile.js');
const { buildNodesEmbed } = require('../../UI/Pass/nodes');
const { buildMissionsEmbed } = require('../../UI/Pass/missions.js');
const { buildRaidEmbed } = require('../../UI/Pass/raid');
const { grantRewards } = require('../../Services/Pass/rewardService.js');
const { NodeModel } = require('../../Schemas/Pass/node.js');
const { sendPassDm } = require('../../Services/Pass/notifyService');

async function handlePassNav(interaction) {
  if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('pass_nav')) return false;
  const guildId = interaction.guild.id;
  const season = await requireActiveSeason(guildId);
  const user = await getOrCreatePassUser({
    guildId,
    seasonId: season.seasonId,
    userId: interaction.user.id
  });
  let embed;
  switch (interaction.values[0]) {
    case 'profile':
      embed = await buildProfileEmbed(season, user);
      break;
    case 'nodes':
      embed = await buildNodesEmbed(season, user, guildId);
      break;
    case 'missions':
      embed = await buildMissionsEmbed(season, user, guildId);
      break;
    case 'raid':
      embed = await buildRaidEmbed(season, guildId);
      break;
  }
  await interaction.update({ embeds: [embed] });
  return true;
}

async function handleClaimNode(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('claim_node:')) return false;
  const nodeId = interaction.customId.split(':')[1];
  const guildId = interaction.guild.id;
  const season = await requireActiveSeason(guildId);

  const u = await getOrCreatePassUser({
    guildId,
    seasonId: season.seasonId,
    userId: interaction.user.id
  });

  const node = await NodeModel.findOne({
    guildId,
    seasonId: season.seasonId,
    id: nodeId
  });

  if (!node) {
    await interaction.reply({
      content: '<:vegax:1443934876440068179> Nodo non completato.',
      flags: 1 << 6
    });
    return true;
  }

  const legacyId = node._id?.toString();
  const isClaimed =
    u.claimedRewards.includes(nodeId) ||
    (legacyId && u.claimedRewards.includes(legacyId));

  if (isClaimed) {
    if (legacyId && u.claimedRewards.includes(legacyId) && !u.claimedRewards.includes(nodeId)) {
      u.claimedRewards.push(nodeId);
      u.claimedRewards = u.claimedRewards.filter(n => n !== legacyId);
      await u.save();
    }
    await interaction.reply({
      content: '<:vegacheckmark:1443666279058772028> Reward già riscattata.',
      flags: 1 << 6
    });
    return true;
  }

  const isCompleted =
    u.completedNodes.includes(nodeId) ||
    (legacyId && u.completedNodes.includes(legacyId));

  if (!isCompleted) {
    await interaction.reply({
      content: '<:vegax:1443934876440068179> Nodo non completato.',
      flags: 1 << 6
    });
    return true;
  }

  if (legacyId && u.completedNodes.includes(legacyId) && !u.completedNodes.includes(nodeId)) {
    u.completedNodes.push(nodeId);
    u.completedNodes = u.completedNodes.filter(n => n !== legacyId);
    await u.save();
  }

  await grantRewards({
    guildId,
    seasonId: season.seasonId,
    userId: interaction.user.id,
    passUser: u,
    rewards: node.rewards,
    reason: `node_claim:${nodeId}`
  });

  if (!u.claimedRewards.includes(nodeId)) u.claimedRewards.push(nodeId);
  if (legacyId) {
    u.claimedRewards = u.claimedRewards.filter(n => n !== legacyId);
  }

  await u.save();
  await interaction.update({ components: [] });
  return true;
}

async function handleChoosePath(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('choose_path:')) return false;
  const [, nodeId, chosen] = interaction.customId.split(':');
  if (!['chaos', 'order'].includes(chosen)) return true;
  const guildId = interaction.guild.id;
  const season = await requireActiveSeason(guildId);

  const u = await getOrCreatePassUser({
    guildId,
    seasonId: season.seasonId,
    userId: interaction.user.id
  });

  if (u.path && u.path !== 'none') {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Percorso già scelto.', flags: 1 << 6 });
    return true;
  }

  const node = await NodeModel.findOne({
    guildId,
    seasonId: season.seasonId,
    id: nodeId
  });

  if (!node || node.type !== 'choice') {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Nodo non valido.', flags: 1 << 6 });
    return true;
  }

  const legacyId = node._id?.toString();
  const isCompleted =
    u.completedNodes.includes(nodeId) ||
    (legacyId && u.completedNodes.includes(legacyId));

  if (isCompleted) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Nodo già completato.', flags: 1 << 6 });
    return true;
  }

  u.path = chosen;
  u.completedNodes.push(nodeId);
  u.claimedRewards.push(nodeId);
  if (legacyId) {
    u.completedNodes = u.completedNodes.filter(n => n !== legacyId);
    u.claimedRewards = u.claimedRewards.filter(n => n !== legacyId);
  }
  await u.save();

  if (node.rewards) {
    await grantRewards({
      guildId,
      seasonId: season.seasonId,
      userId: interaction.user.id,
      passUser: u,
      rewards: node.rewards,
      reason: `node_complete:${nodeId}`
    });
  }

  await sendPassDm(
    interaction.user.id,
    `<:vegacheckmark:1443666279058772028> Hai completato il nodo ${node.title || nodeId}.`
  );

  await interaction.update({ content: `<:vegacheckmark:1443666279058772028> Percorso scelto: **${chosen}**`, components: [] });
  return true;
}

module.exports = { handlePassNav, handleClaimNode, handleChoosePath };