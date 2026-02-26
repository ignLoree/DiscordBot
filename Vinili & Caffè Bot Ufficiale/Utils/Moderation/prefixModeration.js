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
  if (!guild || !Array.isArray(userIds) || userIds.length === 0)
    return new Map();
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
    const fetched = await guild.members
      .fetch({ user: missing })
      .catch(() => null);
    if (fetched) {
      for (const [id, member] of fetched.entries()) {
        result.set(id, member);
        setCachedMember(guild.id, id, member);
      }
    }
  }
  return result;
}

function extractUserId(raw, message) {
  const mention = message.mentions?.users?.first();
  if (mention) return mention.id;
  if (!raw) return null;
  const match = String(raw).match(/^<@!?(\d+)>$/);
  if (match) return match[1];
  if (/^\d{17,20}$/.test(raw)) return raw;
  return null;
}

async function resolveTarget(message, args, index = 0) {
  const raw = args?.[index];
  const userId = extractUserId(raw, message);
  if (!userId) return { user: null, member: null, userId: null };
  const user = await message.client.users.fetch(userId).catch(() => null);
  const member = user ? await fetchMemberSafe(message.guild, user.id) : null;
  return { user, member, userId };
}

function getReason(args, startIndex) {
  const reason = Array.isArray(args)
    ? args.slice(startIndex).join(" ").trim()
    : "";
  return reason || "Nessun motivo fornito";
}

module.exports = {
  fetchMemberSafe,
  fetchMembersSafe,
  extractUserId,
  resolveTarget,
  getReason,
};