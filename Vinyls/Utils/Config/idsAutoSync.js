const fs = require("fs");
const path = require("path");
const { collectGuildCatalog, writeCatalogFiles } = require("./buildIdsCatalog");
const DEFAULT_DELAY_MS = 15000;
const BOT_ROOT = path.resolve(__dirname, "..", "..");
const PROJECT_ROOT = path.resolve(BOT_ROOT, "..");
const timers = new Map();
const pendingReasons = new Map();
const runningGuilds = new Set();
const rerunGuilds = new Set();
let loggedDisabledNotice = false;

function getCatalogPath(baseDir) {
  return path.join(baseDir, "Utils", "Config", "idsCatalog.js");
}

function addReason(guildId, reason) {
  const key = String(guildId || "");
  if (!key) return;
  if (!pendingReasons.has(key)) pendingReasons.set(key, new Set());
  pendingReasons.get(key).add(String(reason || "unspecified"));
}

function consumeReasons(guildId) {
  const key = String(guildId || "");
  const reasons = pendingReasons.get(key);
  pendingReasons.delete(key);
  return Array.from(reasons || []);
}

function readIdsAutoSyncWriteFromEnvFile() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (!fs.existsSync(envPath)) return null;
  try {
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(/^\s*IDS_AUTOSYNC_WRITE\s*=\s*(.+)/m);
    return match ? String(match[1]).trim().replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

function isIdsAutoSyncWriteEnabled() {
  let raw = process.env.IDS_AUTOSYNC_WRITE;
  if (raw == null || raw === "" || String(raw).trim() === "0") {
    raw = readIdsAutoSyncWriteFromEnvFile();
  }
  if (raw == null || raw === "") return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

async function runIdsCatalogSync(client, guildId) {
  const gid = String(guildId || "");
  if (!gid) return { changed: false, reason: "missing-guild-id" };

  const writeEnabled = isIdsAutoSyncWriteEnabled();
  const envValue = process.env.IDS_AUTOSYNC_WRITE ?? readIdsAutoSyncWriteFromEnvFile();
  global.logger?.info?.("[IDS AUTO SYNC] run:", { guildId: gid, writeEnabled, envValue: envValue != null ? String(envValue) : "undefined" });

  if (!writeEnabled) {
    if (!loggedDisabledNotice) {
      loggedDisabledNotice = true;
      global.logger?.info?.("[IDS AUTO SYNC] Runtime write disabled (set IDS_AUTOSYNC_WRITE=1 in .env).");
    }
    consumeReasons(gid);
    return { changed: false, reason: "write-disabled" };
  }

  if (runningGuilds.has(gid)) {
    rerunGuilds.add(gid);
    return { changed: false, reason: "already-running" };
  }

  runningGuilds.add(gid);
  try {
    const reasons = consumeReasons(gid);
    let guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
    if (!guild) {
      global.logger?.warn?.("[IDS AUTO SYNC] guild-not-found:", gid);
      return { changed: false, reason: "guild-not-found" };
    }
    guild = await guild.fetch().catch(() => guild) || guild;

    const IDs = require("./ids");
    const payload = await collectGuildCatalog(guild, IDs);
    const baseDir = BOT_ROOT;
    const catalogPath = getCatalogPath(baseDir);
    const previous = fs.existsSync(catalogPath) ? fs.readFileSync(catalogPath, "utf8") : "";

    const categoryCount = (payload.categoriesLines || []).length;
    const channelCount = (payload.channelsLines || []).length;
    global.logger?.info?.("[IDS AUTO SYNC] collected:", { categories: categoryCount, channels: channelCount, path: catalogPath });

    if (previous === payload.catalogSource) {
      global.logger?.info?.("[IDS AUTO SYNC] no-diff, file unchanged");
      return { changed: false, reason: "no-diff", triggers: reasons };
    }

    writeCatalogFiles(baseDir, payload);
    delete require.cache[require.resolve("./idsCatalog")];
    delete require.cache[require.resolve("./ids")];
    global.logger?.info?.("[IDS AUTO SYNC] written:", catalogPath);

    return { changed: true, triggers: reasons };
  } catch (error) {
    global.logger.error("[IDS AUTO SYNC] Failed:", error);
    return { changed: false, reason: "error", error };
  } finally {
    runningGuilds.delete(gid);
    if (rerunGuilds.has(gid)) {
      rerunGuilds.delete(gid);
      queueIdsCatalogSync(client, gid, "rerun", { delayMs: 3000 });
    }
  }
}

function queueIdsCatalogSync(client, guildId, reason = "event", options = {}) {
  const gid = String(guildId || "");
  if (!gid) return;
  addReason(gid, reason);

  const delayMs = Number.isFinite(options.delayMs) ? Math.max(0, options.delayMs) : DEFAULT_DELAY_MS;
  const existing = timers.get(gid);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => { timers.delete(gid); await runIdsCatalogSync(client, gid); }, delayMs);
  timer.unref?.();

  timers.set(gid, timer);
}

module.exports = { queueIdsCatalogSync, runIdsCatalogSync };