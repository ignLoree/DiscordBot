const RATE_LIMIT_BUCKET = new Map();
const RATE_LIMIT_WINDOW_MS = 6_000;

const PREFIX_SENSITIVE_COMMANDS = new Set([
  "security",
  "perm",
  "temprole",
  "restart",
]);

function cleanup(now = Date.now()) {
  for (const [key, row] of RATE_LIMIT_BUCKET.entries()) {
    if (!row || now - Number(row.at || 0) > RATE_LIMIT_WINDOW_MS * 4) {
      RATE_LIMIT_BUCKET.delete(key);
    }
  }
}

function shouldRateLimitPrefix(commandName) {
  const name = String(commandName || "").trim().toLowerCase();
  if (!name) return false;
  if (name === "ticket") return false;
  return PREFIX_SENSITIVE_COMMANDS.has(name);
}

function shouldRateLimitByCategory(command) {
  const category = String(command?.category || "").trim().toLowerCase();
  const name = String(command?.name || "").trim().toLowerCase();
  if (!name || name === "ticket") return false;
  return ["staff", "admin"].includes(category);
}

function shouldRateLimitSlash(command) {
  const name = String(command?.name || "").trim().toLowerCase();
  if (!name || name === "ticket") return false;
  if (shouldRateLimitByCategory(command)) {
    return true;
  }
  return PREFIX_SENSITIVE_COMMANDS.has(name);
}

function consumeKey(key, windowMs = RATE_LIMIT_WINDOW_MS) {
  const now = Date.now();
  cleanup(now);
  const row = RATE_LIMIT_BUCKET.get(key);
  if (row && now - Number(row.at || 0) < windowMs) {
    const remainingMs = Math.max(1, windowMs - (now - Number(row.at || 0)));
    return { ok: false, remainingMs };
  }
  RATE_LIMIT_BUCKET.set(key, { at: now });
  return { ok: true, remainingMs: 0 };
}

function consumePrefixRateLimit({ guildId, userId, commandName, command }) {
  const shouldLimit =
    shouldRateLimitByCategory(command) || shouldRateLimitPrefix(commandName);
  if (!shouldLimit) return { ok: true, remainingMs: 0 };
  const resolvedName = String(command?.name || commandName || "").toLowerCase();
  const key = `p:${String(guildId || "")}:${String(userId || "")}:${resolvedName}`;
  return consumeKey(key, RATE_LIMIT_WINDOW_MS);
}

function consumeSlashRateLimit({ guildId, userId, command }) {
  if (!shouldRateLimitSlash(command)) return { ok: true, remainingMs: 0 };
  const key = `s:${String(guildId || "")}:${String(userId || "")}:${String(command?.name || "").toLowerCase()}`;
  return consumeKey(key, RATE_LIMIT_WINDOW_MS);
}

module.exports = {
  consumePrefixRateLimit,
  consumeSlashRateLimit,
};
