const fs = require("fs/promises");
const path = require("path");
const {
  createGuildBackup,
  deleteGuildBackup,
  pruneGuildBackups,
  validateAndHealGuildBackups,
} = require("./serverBackupService");

const TICK_EVERY_MS = 60 * 60 * 1000;
const MIN_BACKUP_GAP_MS = 50 * 60 * 1000;
const MAX_MANUAL_BACKUPS = 50;
const MAX_AUTOMATIC_BACKUPS = 1;
const MAX_MANUAL_BACKUP_AGE_DAYS = 45;
const MIN_MANUAL_BACKUPS_TO_KEEP = 8;

function getLocalHourKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}`;
}

function getMsUntilNextHourBoundary(date = new Date()) {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return Math.max(1_000, next.getTime() - date.getTime());
}

function getMarkerPath(guildId) {
  return path.join(
    __dirname,
    "..",
    "..",
    "Data",
    "Backups",
    String(guildId),
    "__auto_latest.json",
  );
}

async function readMarker(guildId) {
  const markerPath = getMarkerPath(guildId);
  const raw = await fs.readFile(markerPath, "utf8").catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeMarker(guildId, payload) {
  const markerPath = getMarkerPath(guildId);
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(markerPath, JSON.stringify(payload, null, 2), "utf8");
}

async function runGuildAutoBackup(guild) {
  const now = new Date();
  const currentHourKey = getLocalHourKey(now);
  const marker = await readMarker(guild.id);
  const lastCreatedAt = Number(marker?.createdAtMs || 0);
  const lastHourKey = String(marker?.hourKey || "");
  if (lastHourKey === currentHourKey) return null;
  if (Date.now() - lastCreatedAt < MIN_BACKUP_GAP_MS) return null;

  const previousAutoId = String(marker?.backupId || "")
    .trim()
    .toUpperCase();

  const created = await createGuildBackup(guild, { source: "automatic" });

  if (previousAutoId && previousAutoId !== created.backupId) {
    await deleteGuildBackup(guild.id, previousAutoId).catch(() => null);
  }

  await writeMarker(guild.id, {
    backupId: created.backupId,
    createdAtMs: Date.now(),
    hourKey: currentHourKey,
  });

  await pruneGuildBackups(guild.id, {
    maxManual: MAX_MANUAL_BACKUPS,
    maxAutomatic: MAX_AUTOMATIC_BACKUPS,
    maxManualAgeDays: MAX_MANUAL_BACKUP_AGE_DAYS,
    minManualToKeep: MIN_MANUAL_BACKUPS_TO_KEEP,
  }).catch(() => null);

  await validateAndHealGuildBackups(guild.id, { limit: 30 }).catch(() => null);

  return created;
}

function startAutoBackupLoop(client) {
  if (client._autoBackupLoopStarted) return;
  client._autoBackupLoopStarted = true;

  const runTick = async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        await validateAndHealGuildBackups(guild.id, { limit: 20 }).catch(() => null);
        const result = await runGuildAutoBackup(guild);
        if (result) {
          global.logger?.info?.(
            `[backup.auto] ${guild.id} -> ${result.backupId}`,
          );
        }
      } catch (error) {
        global.logger?.error?.("[backup.auto] failed:", error);
      }
    }
  };

  const bootNow = new Date();
  if (bootNow.getMinutes() === 0) {
    runTick().catch(() => {});
  }

  const scheduleHourly = () => {
    runTick().catch(() => {});
    client._autoBackupTick = setInterval(runTick, TICK_EVERY_MS);
  };

  const waitMs = getMsUntilNextHourBoundary(bootNow);
  client._autoBackupTickStarter = setTimeout(scheduleHourly, waitMs);
}

module.exports = {
  startAutoBackupLoop,
};



