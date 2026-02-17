const AUTORESPONDER_CACHE_TTL_MS = 30 * 1000;
const autoResponderCache = new Map();

function getGuildAutoResponderCache(guildId) {
  const key = String(guildId || "");
  if (!key) return null;
  const cached = autoResponderCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.at >= AUTORESPONDER_CACHE_TTL_MS) {
    autoResponderCache.delete(key);
    return null;
  }
  return cached.rules;
}

function setGuildAutoResponderCache(guildId, rules) {
  const key = String(guildId || "");
  if (!key) return;
  autoResponderCache.set(key, {
    at: Date.now(),
    rules: Array.isArray(rules) ? rules : [],
  });
}

function invalidateGuildAutoResponderCache(guildId) {
  const key = String(guildId || "");
  if (!key) return;
  autoResponderCache.delete(key);
}

module.exports = {
  getGuildAutoResponderCache,
  setGuildAutoResponderCache,
  invalidateGuildAutoResponderCache,
};
