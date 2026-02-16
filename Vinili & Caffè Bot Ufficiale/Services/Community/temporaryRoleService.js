const TemporaryRoleGrant = require('../../Schemas/Moderation/temporaryRoleGrantSchema');

const CHECK_INTERVAL_MS = 60 * 1000;
let cleanupLoopHandle = null;

async function grantTemporaryRole({
  guild,
  userId,
  roleId,
  grantedBy = null,
  durationMs
}) {
  if (!guild || !userId || !roleId) {
    return { ok: false, reason: 'invalid_input' };
  }
  const safeDuration = Number(durationMs || 0);
  if (!Number.isFinite(safeDuration) || safeDuration <= 0) {
    return { ok: false, reason: 'invalid_duration' };
  }

  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (!member) return { ok: false, reason: 'member_not_found' };

  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return { ok: false, reason: 'role_not_found' };

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) return { ok: false, reason: 'bot_member_not_found' };
  if (!me.permissions.has('ManageRoles')) return { ok: false, reason: 'missing_manage_roles' };
  if (role.position >= me.roles.highest.position) return { ok: false, reason: 'role_above_bot' };

  const hadRoleBefore = member.roles.cache.has(role.id);
  if (!hadRoleBefore) {
    const added = await member.roles.add(role.id).catch(() => null);
    const nowHasRole = Boolean(added?.roles?.cache?.has(role.id) || member.roles.cache.has(role.id));
    if (!nowHasRole) {
      return { ok: false, reason: 'add_failed' };
    }
  }

  const expiresAt = new Date(Date.now() + safeDuration);
  await TemporaryRoleGrant.findOneAndUpdate(
    { guildId: guild.id, userId: member.id, roleId: role.id },
    {
      $set: {
        grantedBy: grantedBy ? String(grantedBy) : null,
        removeOnExpire: !hadRoleBefore,
        expiresAt
      },
      $setOnInsert: {
        guildId: guild.id,
        userId: member.id,
        roleId: role.id
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { ok: true, expiresAt, hadRoleBefore };
}

async function revokeTemporaryRole({ guild, userId, roleId }) {
  if (!guild || !userId || !roleId) return { ok: false, reason: 'invalid_input' };
  const doc = await TemporaryRoleGrant.findOneAndDelete({
    guildId: guild.id,
    userId: String(userId),
    roleId: String(roleId)
  }).lean().catch(() => null);

  if (!doc) return { ok: true, removedRecord: false, removedRole: false };

  let removedRole = false;
  if (doc.removeOnExpire) {
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (member?.roles?.cache?.has(roleId)) {
      await member.roles.remove(roleId).catch(() => {});
      removedRole = true;
    }
  }

  return { ok: true, removedRecord: true, removedRole };
}

async function clearTemporaryRolesForUser({ guild, userId }) {
  if (!guild || !userId) return { ok: false, removed: 0 };
  const docs = await TemporaryRoleGrant.find({ guildId: guild.id, userId: String(userId) }).lean().catch(() => []);
  if (!docs.length) return { ok: true, removed: 0 };

  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (member) {
    for (const doc of docs) {
      if (!doc.removeOnExpire) continue;
      if (!member.roles.cache.has(doc.roleId)) continue;
      await member.roles.remove(doc.roleId).catch(() => {});
    }
  }

  const result = await TemporaryRoleGrant.deleteMany({
    guildId: guild.id,
    userId: String(userId)
  }).catch(() => null);

  return { ok: true, removed: Number(result?.deletedCount || 0) };
}

async function listTemporaryRolesForUser({ guildId, userId }) {
  if (!guildId || !userId) return [];
  const now = new Date();
  return TemporaryRoleGrant.find({
    guildId: String(guildId),
    userId: String(userId),
    expiresAt: { $gt: now }
  }).sort({ expiresAt: 1, roleId: 1 }).lean().catch(() => []);
}

async function removeExpiredTemporaryRoles(client) {
  if (!client) return;
  const now = new Date();
  const expired = await TemporaryRoleGrant.find({ expiresAt: { $lte: now } }).lean().catch(() => []);
  if (!expired.length) return;

  for (const item of expired) {
    const guild = client.guilds.cache.get(item.guildId) || await client.guilds.fetch(item.guildId).catch(() => null);
    if (!guild) {
      await TemporaryRoleGrant.deleteOne({ _id: item._id }).catch(() => {});
      continue;
    }

    if (item.removeOnExpire) {
      const member = guild.members.cache.get(item.userId) || await guild.members.fetch(item.userId).catch(() => null);
      if (!member) {
        await TemporaryRoleGrant.deleteOne({ _id: item._id }).catch(() => {});
        continue;
      }
      if (!member.roles.cache.has(item.roleId)) {
        await TemporaryRoleGrant.deleteOne({ _id: item._id }).catch(() => {});
        continue;
      }

      const role = guild.roles.cache.get(item.roleId) || await guild.roles.fetch(item.roleId).catch(() => null);
      if (!role) {
        await TemporaryRoleGrant.deleteOne({ _id: item._id }).catch(() => {});
        continue;
      }

      const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
      const canManageRoles = Boolean(me?.permissions?.has?.('ManageRoles'));
      const canReachRole = Boolean(me && role.position < me.roles.highest.position);
      if (!canManageRoles || !canReachRole) {
        continue;
      }

      const removed = await member.roles.remove(item.roleId).catch(() => null);
      const stillHasRole = Boolean(removed?.roles?.cache?.has(item.roleId) || member.roles.cache.has(item.roleId));
      if (stillHasRole) {
        continue;
      }
    }

    await TemporaryRoleGrant.deleteOne({ _id: item._id }).catch(() => {});
  }
}

function startTemporaryRoleCleanupLoop(client) {
  if (!client) return null;
  if (cleanupLoopHandle) return cleanupLoopHandle;
  cleanupLoopHandle = setInterval(() => {
    removeExpiredTemporaryRoles(client).catch(() => {});
  }, CHECK_INTERVAL_MS);
  return cleanupLoopHandle;
}

module.exports = {
  grantTemporaryRole,
  revokeTemporaryRole,
  clearTemporaryRolesForUser,
  listTemporaryRolesForUser,
  removeExpiredTemporaryRoles,
  startTemporaryRoleCleanupLoop
};
