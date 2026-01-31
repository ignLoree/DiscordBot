const memberCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

function getCacheKey(guildId, userId) {
  return `${guildId}:${userId}`;
}
function getCachedMember(guildId, userId) {
  const key = getCacheKey(guildId, userId);
  const entry = memberCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    memberCache.delete(key);
    return null;
  }
  return entry.member;
}
function setCachedMember(guildId, userId, member) {
  const key = getCacheKey(guildId, userId);
  memberCache.set(key, { member, ts: Date.now() });
}
async function fetchMemberSafe(guild, userId) {
  if (!guild || !userId) return null;
  const cached = getCachedMember(guild.id, userId);
  if (cached) return cached;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) setCachedMember(guild.id, userId, member);
  return member;
}
async function fetchMembersSafe(guild, userIds) {
  if (!guild || !Array.isArray(userIds) || userIds.length === 0) return new Map();
  const result = new Map();
  const missing = [];
  for (const id of userIds) {
    const cached = getCachedMember(guild.id, id);
    if (cached) {
      result.set(id, cached);
    } else {
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    const fetched = await guild.members.fetch({ user: missing }).catch(() => null);
    if (fetched) {
      for (const [id, member] of fetched.entries()) {
        result.set(id, member);
        setCachedMember(guild.id, id, member);
      }
    }
  }
  return result;
}
module.exports = { fetchMemberSafe, fetchMembersSafe };
