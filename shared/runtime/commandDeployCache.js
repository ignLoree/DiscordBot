const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const CACHE_DIR = path.join(os.tmpdir(), "vinili-caffe-command-cache");

function ensureCacheDir() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    // tmp dir may be read-only or missing
  }
}

function getStatePath(botKey) {
  return path.join(CACHE_DIR, `${String(botKey || "bot")}.json`);
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function hashPayload(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function getScopeKey({ clientId, guildId }) {
  return guildId ? `guild:${clientId}:${guildId}` : `global:${clientId}`;
}

function getCommandDeployState(botKey) {
  const filePath = getStatePath(botKey);
  if (!fs.existsSync(filePath)) return {};
  return safeReadJson(filePath) || {};
}

function isCommandDeployRequired(botKey, scope, commands) {
  const state = getCommandDeployState(botKey);
  const scopeKey = getScopeKey(scope);
  const nextHash = hashPayload(commands);
  const previousHash = state[scopeKey] || null;
  return {
    hash: nextHash,
    previousHash,
    required: previousHash !== nextHash,
    scopeKey,
  };
}

function markCommandDeployComplete(botKey, scope, hash) {
  try {
    ensureCacheDir();
    const state = getCommandDeployState(botKey);
    state[getScopeKey(scope)] = hash;
    fs.writeFileSync(getStatePath(botKey), JSON.stringify(state, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

function clearCommandDeployCache(botKey) {
  const filePath = getStatePath(botKey);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

module.exports = { isCommandDeployRequired, markCommandDeployComplete, clearCommandDeployCache };