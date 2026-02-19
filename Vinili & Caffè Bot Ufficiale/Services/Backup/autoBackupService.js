const fs = require("fs/promises");
const path = require("path");
const { createGuildBackup, deleteGuildBackup } = require("./serverBackupService");

const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TICK_EVERY_MS = 60 * 60 * 1000;

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

  return created;
}

function startAutoBackupLoop(client) {
  if (client._autoBackupLoopStarted) return;
  client._autoBackupLoopStarted = true;

  const runTick = async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
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
