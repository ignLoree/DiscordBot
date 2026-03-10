
const EPHEMERAL_TTL_SHORT_MS = 8_000;
const EPHEMERAL_TTL_NORMAL_MS = 12_000;
const EPHEMERAL_TTL_LONG_MS = 18_000;
const EPHEMERAL_TTL_PING_ONLY_MS = 3_000;

function scheduleMessageDeletion(message, ttlMs) {
  if (!message || typeof message.delete !== "function") return;
  const timer = setTimeout(() => message.delete().catch(() => { }), ttlMs);
  if (typeof timer.unref === "function") timer.unref();
}

module.exports = { EPHEMERAL_TTL_SHORT_MS, EPHEMERAL_TTL_NORMAL_MS, EPHEMERAL_TTL_LONG_MS, EPHEMERAL_TTL_PING_ONLY_MS, scheduleMessageDeletion };