const sessions = new Map();

function normalizeGuildId(guildId) {
  const value = String(guildId || "").trim();
  return value || null;
}

function getVoiceSession(guildId) {
  const key = normalizeGuildId(guildId);
  if (!key) return null;
  return sessions.get(key) || null;
}

function setVoiceSession(guildId, payload = {}) {
  const key = normalizeGuildId(guildId);
  if (!key) return null;
  const next = {
    mode: String(payload.mode || "unknown"),
    channelId: String(payload.channelId || ""),
    updatedAt: Date.now(),
  };
  sessions.set(key, next);
  return next;
}

function clearVoiceSession(guildId) {
  const key = normalizeGuildId(guildId);
  if (!key) return false;
  return sessions.delete(key);
}

function isDifferentVoiceSession(guildId, channelId) {
  const current = getVoiceSession(guildId);
  if (!current?.channelId) return false;
  return String(current.channelId) !== String(channelId || "");
}

module.exports = {
  getVoiceSession,
  setVoiceSession,
  clearVoiceSession,
  isDifferentVoiceSession,
};

