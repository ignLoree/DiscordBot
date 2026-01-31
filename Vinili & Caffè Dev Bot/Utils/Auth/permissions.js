function hasAnyRole(member, roleIds) {
  if (!member?.roles?.cache) return false;
  const set = roleIds instanceof Set ? roleIds : new Set(roleIds);
  return member.roles.cache.some(r => set.has(r.id));
}

module.exports = { hasAnyRole };
