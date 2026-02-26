const RECENT_JOIN_GATE_KICKS = new Map();
const DEFAULT_TTL_MS = 5 * 60_000;

function nowMs() {
  return Date.now();
}

function buildKey(guildId, userId) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function pruneExpired(at = nowMs()) {
  for (const [key, value] of RECENT_JOIN_GATE_KICKS.entries()) {
    if (Number(value?.expiresAt || 0) <= at) {
      RECENT_JOIN_GATE_KICKS.delete(key);
    }
  }
}

function markJoinGateKick(guildId, userId, reason, ttlMs = DEFAULT_TTL_MS) {
  const key = buildKey(guildId, userId);
  if (!key || key === ":") return;
  const at = nowMs();
  pruneExpired(at);
  RECENT_JOIN_GATE_KICKS.set(key, {
    reason: String(reason || "").trim(),
    at,
    expiresAt: at + Math.max(1_000, Number(ttlMs || DEFAULT_TTL_MS)),
  });
}

function getRecentJoinGateKick(guildId, userId) {
  const key = buildKey(guildId, userId);
  if (!key || key === ":") return null;
  const at = nowMs();
  pruneExpired(at);
  const payload = RECENT_JOIN_GATE_KICKS.get(key) || null;
  if (!payload) return null;
  if (Number(payload.expiresAt || 0) <= at) {
    RECENT_JOIN_GATE_KICKS.delete(key);
    return null;
  }
  return payload;
}

function consumeRecentJoinGateKick(guildId, userId) {
  const key = buildKey(guildId, userId);
  if (!key || key === ":") return null;
  const payload = getRecentJoinGateKick(guildId, userId);
  if (payload) RECENT_JOIN_GATE_KICKS.delete(key);
  return payload;
}

module.exports = {
  markJoinGateKick,
  getRecentJoinGateKick,
  consumeRecentJoinGateKick,
};