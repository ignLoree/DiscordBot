const RolePersist = require("../../Schemas/Moderation/rolePersistSchema");

async function setRolePersist({ guildId, userId, roleId, setBy = null, reason = null }) {
  if (!guildId || !userId || !roleId) return null;
  return RolePersist.findOneAndUpdate(
    { guildId: String(guildId), userId: String(userId), roleId: String(roleId) },
    {
      $set: {
        setBy: setBy ? String(setBy) : null,
        reason: String(reason || "Nessun motivo fornito").slice(0, 512),
      },
      $setOnInsert: {
        guildId: String(guildId),
        userId: String(userId),
        roleId: String(roleId),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function clearRolePersist({ guildId, userId, roleId }) {
  if (!guildId || !userId || !roleId) return null;
  return RolePersist.deleteOne({
    guildId: String(guildId),
    userId: String(userId),
    roleId: String(roleId),
  }).catch(() => null);
}

async function listRolePersistByUser(guildId, userId) {
  if (!guildId || !userId) return [];
  return RolePersist.find({
    guildId: String(guildId),
    userId: String(userId),
  })
    .lean()
    .catch(() => []);
}

async function applyRolePersistForMember(member) {
  if (!member?.guild?.id || !member?.id) return;
  const rows = await listRolePersistByUser(member.guild.id, member.id);
  if (!rows.length) return;
  const me = member.guild.members.me;
  if (!me?.permissions?.has?.("ManageRoles")) return;
  for (const row of rows) {
    const role = member.guild.roles.cache.get(row.roleId);
    if (!role) continue;
    if (role.position >= me.roles.highest.position) continue;
    if (member.roles.cache.has(role.id)) continue;
    await member.roles.add(role.id, "Rolepersist rejoin restore").catch(() => {});
  }
}

module.exports = {
  setRolePersist,
  clearRolePersist,
  listRolePersistByUser,
  applyRolePersistForMember,
};
