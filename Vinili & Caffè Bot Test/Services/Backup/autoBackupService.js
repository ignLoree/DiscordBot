const fs = require("fs/promises");
const path = require("path");
const { createGuildBackup, deleteGuildBackup, pruneGuildBackups, validateAndHealGuildBackups, } = require("./serverBackupService");

const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TICK_EVERY_MS = 60 * 60 * 1000;
const MAX_MANUAL_BACKUPS = 50;
const MAX_AUTOMATIC_BACKUPS = 1;
const MAX_MANUAL_BACKUP_AGE_DAYS = 45;
const MIN_MANUAL_BACKUPS_TO_KEEP = 8;

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
  const marker = await readMarker(guild.id);
  const lastCreatedAt = Number(marker?.createdAtMs || 0);
  if (Date.now() - lastCreatedAt < AUTO_BACKUP_INTERVAL_MS) return null;

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

  runTick().catch(() => {});
  client._autoBackupTick = setInterval(runTick, TICK_EVERY_MS);
}

module.exports = {
  startAutoBackupLoop,
};
