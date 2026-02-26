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
const {
  getJoinGateConfigSnapshot,
  setJoinGateConfigSnapshot,
} = require("./joinGateService");
const {
  getJoinRaidConfigSnapshot,
  setJoinRaidConfigSnapshot,
} = require("./joinRaidService");
const {
  writeSecuritySnapshot,
  listSecuritySnapshots: listSecuritySnapshotsFromBackup,
  readSecuritySnapshot,
  getEffectiveGuildIdForSecurity,
} = require("../Backup/serverBackupService");

const PERMISSIONS_PATH = path.resolve(__dirname, "../../permissions.json");
const MAX_SNAPSHOTS_LIST = 30;

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

async function createSecuritySnapshot({ guildId = "", actorId = "", reason = "manual" } = {}) {
  const permissionsRaw = fs.existsSync(PERMISSIONS_PATH)
    ? fs.readFileSync(PERMISSIONS_PATH, "utf8")
    : "{}\n";
  const antiNukeConfig = getAntiNukeStatusSnapshot(String(guildId || ""))?.config || {};
  const autoModConfig = getAutoModConfigSnapshot();
  const joinGateConfig = getJoinGateConfigSnapshot();
  const joinRaidConfig = getJoinRaidConfigSnapshot();

  const payload = {
    permissionsRaw,
    antiNukeConfig,
    autoModConfig,
    joinGateConfig,
    joinRaidConfig,
  };

  try {
    const result = await writeSecuritySnapshot(guildId, payload, {
      actorId: String(actorId || ""),
      reason: String(reason || "manual"),
    });
    if (!result?.ok) return { ok: false, reason: "save_failed" };
    return { ok: true, snapshot: result.snapshot };
  } catch (err) {
    return { ok: false, reason: "save_failed" };
  }
}

async function listSecuritySnapshots(limit = 10, guildId = "") {
  const effectiveGuildId = getEffectiveGuildIdForSecurity(guildId);
  const list = await listSecuritySnapshotsFromBackup(effectiveGuildId, Math.max(1, Math.min(50, Number(limit || 10))));
  return list.map((s) => ({
    id: String(s.id || ""),
    createdAt: Number(s.createdAt || 0),
    guildId: String(s.guildId || ""),
    actorId: String(s.actorId || ""),
    reason: String(s.reason || ""),
  }));
}

async function findSnapshot(idOrLast = "last", guildId = "") {
  const effectiveGuildId = getEffectiveGuildIdForSecurity(guildId);
  const key = String(idOrLast || "last").trim().toLowerCase();
  if (!key || key === "last") {
    const list = await listSecuritySnapshotsFromBackup(effectiveGuildId, 1);
    if (!list.length) return null;
    const entry = await readSecuritySnapshot(effectiveGuildId, list[0].id).catch(() => null);
    return entry;
  }
  const list = await listSecuritySnapshotsFromBackup(effectiveGuildId, MAX_SNAPSHOTS_LIST);
  const found = list.find((s) => String(s.id || "").toLowerCase() === key);
  if (!found) return null;
  return readSecuritySnapshot(effectiveGuildId, found.id).catch(() => null);
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

async function restoreSecuritySnapshot(idOrLast = "last", guildId = "") {
  const effectiveGuildId = getEffectiveGuildIdForSecurity(guildId);
  const snapshot = await findSnapshot(idOrLast, effectiveGuildId);
  if (!snapshot) return { ok: false, reason: "not_found" };
  const payload = snapshot.payload || {};

  const permissionsValue = readJsonSafeString(payload.permissionsRaw, "{}\n");
  if (!writeJsonSafe(PERMISSIONS_PATH, permissionsValue)) {
    return { ok: false, reason: "permissions_restore_failed" };
  }

  const antiNukeResult = setAntiNukeConfigSnapshot(payload.antiNukeConfig || {});
  if (!antiNukeResult?.ok) return { ok: false, reason: "antinuke_restore_failed" };

  const autoModResult = restoreAutoModConfigSnapshot(payload.autoModConfig || {});
  if (!autoModResult?.ok) return { ok: false, reason: autoModResult.reason };

  const joinGateResult = setJoinGateConfigSnapshot(payload.joinGateConfig || {});
  if (!joinGateResult?.ok) return { ok: false, reason: "joingate_restore_failed" };

  const joinRaidResult = setJoinRaidConfigSnapshot(payload.joinRaidConfig || {});
  if (!joinRaidResult?.ok) return { ok: false, reason: "joinraid_restore_failed" };

  return { ok: true, snapshot };
}

module.exports = {
  createSecuritySnapshot,
  listSecuritySnapshots,
  restoreSecuritySnapshot,
};