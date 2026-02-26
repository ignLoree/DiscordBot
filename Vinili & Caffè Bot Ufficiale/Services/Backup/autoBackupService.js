const fs = require("fs/promises");
const path = require("path");
const cron = require("node-cron");
const { createGuildBackup, deleteGuildBackup, pruneGuildBackups, validateAndHealGuildBackups, } = require("./serverBackupService");

const MIN_BACKUP_GAP_MS = 50 * 60 * 1000;
const MAX_MANUAL_BACKUPS = 50;
const MAX_AUTOMATIC_BACKUPS = 1;
const MAX_MANUAL_BACKUP_AGE_DAYS = 45;
const MIN_MANUAL_BACKUPS_TO_KEEP = 8;
const AUTO_BACKUP_TIMEZONE = "Europe/Rome";
const STARTUP_CATCHUP_WINDOW_MINUTES = 10;

function getZonedParts(date = new Date(), timeZone = AUTO_BACKUP_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter
    .formatToParts(date)
    .reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  return {
    year: Number(parts.year || 0),
    month: Number(parts.month || 0),
    day: Number(parts.day || 0),
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
  };
}

function getZonedDayKey(date = new Date(), timeZone = AUTO_BACKUP_TIMEZONE) {
  const parts = getZonedParts(date, timeZone);
  const y = String(parts.year).padStart(4, "0");
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shouldRunStartupCatchup(date = new Date()) {
  const parts = getZonedParts(date, AUTO_BACKUP_TIMEZONE);
  return parts.hour === 0 && parts.minute <= STARTUP_CATCHUP_WINDOW_MINUTES;
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
  const currentDayKey = getZonedDayKey(now);
  const marker = await readMarker(guild.id);
  const lastCreatedAt = Number(marker?.createdAtMs || 0);
  const lastDayKey = String(marker?.dayKey || marker?.hourKey || "").split("T")[0];
  if (lastDayKey === currentDayKey) return null;
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
    dayKey: currentDayKey,
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

  if (shouldRunStartupCatchup()) {
    runTick().catch(() => {});
  }

  client._autoBackupCron = cron.schedule(
    "0 0 * * *",
    () => {
      runTick().catch(() => {});
    },
    {
      timezone: AUTO_BACKUP_TIMEZONE,
    },
  );
}

module.exports = {
  startAutoBackupLoop,
};