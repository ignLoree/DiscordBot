const fs = require("fs");
const path = require("path");

const {
  getAutoModConfigSnapshot,
  updateAutoModConfig,
} = require("./automodService");
const {
  getAntiNukeStatusSnapshot,
  setAntiNukeConfigSnapshot,
} = require("./antiNukeService");

const DATA_DIR = path.resolve(__dirname, "../../Data/Security");
const SNAPSHOT_PATH = path.join(DATA_DIR, "securitySnapshots.json");
const PERMISSIONS_PATH = path.resolve(__dirname, "../../permissions.json");
const MAX_SNAPSHOTS = 30;

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

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

function readSnapshotStore() {
  ensureDataDir();
  const raw = readJsonSafe(SNAPSHOT_PATH, { snapshots: [] });
  const list = Array.isArray(raw?.snapshots) ? raw.snapshots : [];
  return { snapshots: list };
}

function writeSnapshotStore(store) {
  ensureDataDir();
  const payload = {
    snapshots: Array.isArray(store?.snapshots) ? store.snapshots.slice(0, MAX_SNAPSHOTS) : [],
  };
  return writeJsonSafe(SNAPSHOT_PATH, payload);
}

function makeSnapshotId() {
  const now = new Date();
  const base = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.floor(Math.random() * 9999)
    .toString()
    .padStart(4, "0");
  return `sec-${base}-${rand}`;
}

function createSecuritySnapshot({ guildId = "", actorId = "", reason = "manual" } = {}) {
  const permissionsRaw = fs.existsSync(PERMISSIONS_PATH)
    ? fs.readFileSync(PERMISSIONS_PATH, "utf8")
    : "{}\n";
  const antiNukeConfig = getAntiNukeStatusSnapshot(String(guildId || ""))?.config || {};
  const autoModConfig = getAutoModConfigSnapshot();

  const entry = {
    id: makeSnapshotId(),
    createdAt: Date.now(),
    guildId: String(guildId || ""),
    actorId: String(actorId || ""),
    reason: String(reason || "manual"),
    payload: {
      permissionsRaw,
      antiNukeConfig,
      autoModConfig,
    },
  };

  const store = readSnapshotStore();
  store.snapshots.unshift(entry);
  store.snapshots = store.snapshots.slice(0, MAX_SNAPSHOTS);
  const saved = writeSnapshotStore(store);
  return saved ? { ok: true, snapshot: entry } : { ok: false, reason: "save_failed" };
}

function listSecuritySnapshots(limit = 10) {
  const store = readSnapshotStore();
  return store.snapshots
    .slice(0, Math.max(1, Math.min(50, Number(limit || 10))))
    .map((s) => ({
      id: String(s.id || ""),
      createdAt: Number(s.createdAt || 0),
      guildId: String(s.guildId || ""),
      actorId: String(s.actorId || ""),
      reason: String(s.reason || ""),
    }));
}

function findSnapshot(idOrLast = "last") {
  const store = readSnapshotStore();
  if (!store.snapshots.length) return null;
  const key = String(idOrLast || "last").trim().toLowerCase();
  if (!key || key === "last") return store.snapshots[0];
  return store.snapshots.find((s) => String(s.id || "") === key) || null;
}

function restoreAutoModConfigSnapshot(snapshotCfg) {
  if (!snapshotCfg || typeof snapshotCfg !== "object") {
    return { ok: false, reason: "invalid_automod_snapshot" };
  }
  const steps = [
    ["thresholds", snapshotCfg.thresholds],
    ["panic", snapshotCfg.panic],
    ["shorteners", snapshotCfg.shorteners],
    ["profiles", snapshotCfg.profiles],
  ];
  for (const [pathExpr, value] of steps) {
    const result = updateAutoModConfig(pathExpr, value);
    if (!result?.ok) return { ok: false, reason: `automod_${pathExpr}_failed` };
  }
  return { ok: true };
}

function restoreSecuritySnapshot(idOrLast = "last") {
  const snapshot = findSnapshot(idOrLast);
  if (!snapshot) return { ok: false, reason: "not_found" };
  const payload = snapshot.payload || {};

  if (!writeJsonSafe(PERMISSIONS_PATH, readJsonSafeString(payload.permissionsRaw, "{}\n"))) {
    return { ok: false, reason: "permissions_restore_failed" };
  }

  const antiNukeResult = setAntiNukeConfigSnapshot(payload.antiNukeConfig || {});
  if (!antiNukeResult?.ok) return { ok: false, reason: "antinuke_restore_failed" };

  const autoModResult = restoreAutoModConfigSnapshot(payload.autoModConfig || {});
  if (!autoModResult?.ok) return { ok: false, reason: autoModResult.reason };

  return { ok: true, snapshot };
}

function readJsonSafeString(rawText, fallbackRaw = "{}\n") {
  try {
    const parsed = JSON.parse(String(rawText || "{}"));
    return parsed;
  } catch {
    try {
      return JSON.parse(String(fallbackRaw || "{}"));
    } catch {
      return {};
    }
  }
}

module.exports = {
  createSecuritySnapshot,
  listSecuritySnapshots,
  restoreSecuritySnapshot,
};
