const { CustomRole } = require('../../Schemas/Community/communitySchemas');
const { runExpiredCustomRolesSweep } = require('../../Services/Community/customRoleExpiryService');

function isExpired(doc) {
  const expiresAt = doc?.expiresAt ? new Date(doc.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() <= Date.now();
}

async function resolveCustomRoleState({ guild, userId, client = null, cleanupExpired = true }) {
  if (!guild || !userId) {
    return { status: 'invalid', doc: null, role: null };
  }

  const doc = await CustomRole.findOne({ guildId: guild.id, userId: String(userId) }).lean().catch(() => null);
  if (!doc?.roleId) {
    return { status: 'none', doc: null, role: null };
  }

  if (isExpired(doc)) {
    if (cleanupExpired && client) {
      runExpiredCustomRolesSweep(client).catch(() => {});
    }
    return { status: 'expired', doc, role: null };
  }

  const role = guild.roles.cache.get(doc.roleId) || await guild.roles.fetch(doc.roleId).catch(() => null);
  if (!role) {
    await CustomRole.deleteOne({ guildId: guild.id, userId: String(userId) }).catch(() => {});
    return { status: 'missing_role', doc, role: null };
  }

  return { status: 'active', doc, role };
}

function buildExpiryText(doc) {
  if (!doc?.expiresAt) return 'Permanente';
  const ts = Math.floor(new Date(doc.expiresAt).getTime() / 1000);
  if (!Number.isFinite(ts) || ts <= 0) return 'Permanente';
  return `<t:${ts}:F> (<t:${ts}:R>)`;
}

module.exports = {
  resolveCustomRoleState,
  buildExpiryText
};
