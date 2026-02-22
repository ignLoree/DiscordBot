const fs = require("fs");
const path = require("path");

const JOIN_GATE_CONFIG_PATH = path.resolve(
  __dirname,
  "../../Utils/Config/joinGateConfig.json",
);

const VALID_ACTIONS = new Set(["log", "timeout", "kick", "ban"]);

const DEFAULT_JOIN_GATE_CONFIG = {
  enabled: true,
  dmPunishedMembers: true,
  noAvatar: {
    enabled: true,
    action: "log",
  },
  newAccounts: {
    enabled: true,
    minAgeDays: 3,
    action: "kick",
  },
  botAdditions: {
    enabled: true,
    action: "kick",
  },
  unverifiedBotAdditions: {
    enabled: true,
    action: "kick",
  },
  suspiciousAccount: {
    enabled: true,
    action: "log",
  },
  advertisingName: {
    enabled: true,
    action: "kick",
  },
  usernameFilter: {
    enabled: true,
    postJoinEnabled: true,
    action: "kick",
    strictWords: [
      "discord staff",
      "discord support",
      "nitro free",
      "steam gift",
      "free nitro",
      "airdrop",
    ],
    wildcardWords: [
      "*discord*support*",
      "*discord*staff*",
      "*nitro*free*",
      "*steam*gift*",
      "*crypto*airdrop*",
    ],
  },
};

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath, value) {
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function normalizeAction(action, fallback = "log") {
  const raw = String(action || "").trim().toLowerCase();
  return VALID_ACTIONS.has(raw) ? raw : fallback;
}

function normalizeStringArray(raw, fallback = []) {
  if (!Array.isArray(raw)) return [...fallback];
  return raw
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 120);
}

function sanitizeJoinGateConfig(rawConfig) {
  const source = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  const out = JSON.parse(JSON.stringify(DEFAULT_JOIN_GATE_CONFIG));
  out.enabled =
    typeof source.enabled === "boolean"
      ? source.enabled
      : DEFAULT_JOIN_GATE_CONFIG.enabled;
  out.dmPunishedMembers =
    typeof source.dmPunishedMembers === "boolean"
      ? source.dmPunishedMembers
      : DEFAULT_JOIN_GATE_CONFIG.dmPunishedMembers;

  const mergeRule = (key) => {
    const srcRule = source?.[key] || {};
    const dstRule = out[key];
    dstRule.enabled =
      typeof srcRule.enabled === "boolean" ? srcRule.enabled : dstRule.enabled;
    dstRule.action = normalizeAction(srcRule.action, dstRule.action);
  };

  mergeRule("noAvatar");
  mergeRule("newAccounts");
  mergeRule("botAdditions");
  mergeRule("unverifiedBotAdditions");
  mergeRule("suspiciousAccount");
  mergeRule("advertisingName");
  mergeRule("usernameFilter");
  out.usernameFilter.postJoinEnabled =
    typeof source?.usernameFilter?.postJoinEnabled === "boolean"
      ? source.usernameFilter.postJoinEnabled
      : DEFAULT_JOIN_GATE_CONFIG.usernameFilter.postJoinEnabled;

  const minAgeDays = Number(source?.newAccounts?.minAgeDays);
  if (Number.isFinite(minAgeDays)) {
    out.newAccounts.minAgeDays = Math.max(0, Math.min(3650, Math.floor(minAgeDays)));
  }

  out.usernameFilter.strictWords = normalizeStringArray(
    source?.usernameFilter?.strictWords,
    DEFAULT_JOIN_GATE_CONFIG.usernameFilter.strictWords,
  );
  out.usernameFilter.wildcardWords = normalizeStringArray(
    source?.usernameFilter?.wildcardWords,
    DEFAULT_JOIN_GATE_CONFIG.usernameFilter.wildcardWords,
  );

  return out;
}

let joinGateConfig = sanitizeJoinGateConfig(
  readJsonSafe(JOIN_GATE_CONFIG_PATH, DEFAULT_JOIN_GATE_CONFIG),
);
writeJsonSafe(JOIN_GATE_CONFIG_PATH, joinGateConfig);

function getJoinGateConfigSnapshot() {
  return JSON.parse(JSON.stringify(joinGateConfig));
}

function setJoinGateConfigSnapshot(rawConfig) {
  const sanitized = sanitizeJoinGateConfig(rawConfig);
  const saved = writeJsonSafe(JOIN_GATE_CONFIG_PATH, sanitized);
  if (!saved) return { ok: false, reason: "save_failed" };
  joinGateConfig = sanitized;
  return { ok: true, config: getJoinGateConfigSnapshot() };
}

function setByPath(target, pathExpr, value) {
  const pathParts = String(pathExpr || "")
    .split(".")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!pathParts.length) return false;
  if (pathParts.some((p) => ["__proto__", "prototype", "constructor"].includes(p))) {
    return false;
  }
  let ref = target;
  for (let i = 0; i < pathParts.length - 1; i += 1) {
    const key = pathParts[i];
    if (!ref[key] || typeof ref[key] !== "object" || Array.isArray(ref[key])) {
      ref[key] = {};
    }
    ref = ref[key];
  }
  ref[pathParts[pathParts.length - 1]] = value;
  return true;
}

function parseScalar(raw) {
  const value = String(raw || "").trim();
  if (!value.length) return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function updateJoinGateConfig(pathExpr, rawValue) {
  const next = getJoinGateConfigSnapshot();
  const scalar = parseScalar(rawValue);
  if (!setByPath(next, pathExpr, scalar)) {
    return { ok: false, reason: "invalid_path" };
  }
  return setJoinGateConfigSnapshot(next);
}

module.exports = {
  VALID_ACTIONS,
  DEFAULT_JOIN_GATE_CONFIG,
  getJoinGateConfigSnapshot,
  setJoinGateConfigSnapshot,
  updateJoinGateConfig,
};
