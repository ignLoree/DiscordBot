const { NodeModel } = require('../../Schemas/Pass/node');
const { grantRewards } = require('./rewardService');
const { sendPassDm } = require('./notifyService');

async function registerProgress({
  guildId,
  seasonId,
  passUser,
  type,
  amount = 1
}) {
  const nodes = await NodeModel.find({
    guildId,
    seasonId,
    'objective.kind': type
  });
  for (const item of nodes) {
    await processObjective(passUser, item, amount, guildId, seasonId);
  }
}

async function processObjective(passUser, item, amount, guildId, seasonId) {
  const { id, legacyId } = getDocIds(item);
  let target = item.objective?.target;
  if (typeof target !== 'number') {
    if (item.objective?.kind !== 'complete_pass') return;
    target = 1;
  }
  await normalizeNodeIds(passUser, id, legacyId);
  if (isCompleted(passUser.completedNodes, id, legacyId)) return;
  const current = getProgressValue(passUser.progress, id, legacyId);
  const updated = current + amount;
  passUser.progress.set(id, updated);
  await passUser.save();
  if (updated >= target) {
    if (!passUser.completedNodes.includes(id)) passUser.completedNodes.push(id);
    if (legacyId) {
      passUser.completedNodes = passUser.completedNodes.filter(n => n !== legacyId);
    }
    await passUser.save();
    await grantRewards({
      guildId,
      seasonId,
      userId: passUser.userId,
      passUser,
      rewards: item.rewards,
      reason: `objective_complete:${id}`
    });
    if (!passUser.claimedRewards.includes(id)) passUser.claimedRewards.push(id);
    if (legacyId) {
      passUser.claimedRewards = passUser.claimedRewards.filter(n => n !== legacyId);
    }
    await passUser.save();
    await sendPassDm(
      passUser.userId,
      `<:vegacheckmark:1443666279058772028> Hai completato il nodo ${item.title || id}. Ricordati di fare /pass per visualizzare i tuoi progressi!`
    );
    if (item.objective?.kind === 'complete_pass') {
      await handlePassCompletion(passUser.userId, guildId);
    }
  }
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

async function normalizeNodeIds(passUser, id, legacyId) {
  if (!passUser || !id || !legacyId) return;
  let changed = false;
  if (passUser.progress.has(legacyId) && !passUser.progress.has(id)) {
    passUser.progress.set(id, passUser.progress.get(legacyId));
    passUser.progress.delete(legacyId);
    changed = true;
  }
  if (passUser.completedNodes.includes(legacyId) && !passUser.completedNodes.includes(id)) {
    passUser.completedNodes.push(id);
    passUser.completedNodes = passUser.completedNodes.filter(n => n !== legacyId);
    changed = true;
  }
  if (changed) await passUser.save();
}

async function handlePassCompletion(userId, guildId) {
  try {
    const client = global.botClient;
    if (!client) return;
    const roleId = client.config2?.passCompleteRoleId;
    const channelId = client.config2?.passCompleteChannelId;
    if (roleId && guildId) {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member && !member.roles.cache.has(roleId)) {
          await member.roles.add(roleId).catch(() => {});
        }
      }
    }

    if (channelId) {
      const channel = client.channels.cache.get(channelId);
      if (channel) {
        await channel.send({ content: `<a:VC_Winner:1448687700235256009> <@${userId}> ha completato il Pass!` }).catch(() => {});
      }
    }
  } catch {
  }
}

module.exports = { registerProgress };