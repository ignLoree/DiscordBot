const fs = require('fs');
const path = require('path');

const { collectGuildCatalog, writeCatalogFiles } = require('./buildIdsCatalog');

const DEFAULT_DELAY_MS = 15000;
const timers = new Map();
const pendingReasons = new Map();
const runningGuilds = new Set();
const rerunGuilds = new Set();

function getCatalogPath(baseDir) {
  return path.join(baseDir, 'Utils', 'Config', 'idsCatalog.js');
}

function addReason(guildId, reason) {
  const key = String(guildId || '');
  if (!key) return;
  if (!pendingReasons.has(key)) pendingReasons.set(key, new Set());
  pendingReasons.get(key).add(String(reason || 'unspecified'));
}

function consumeReasons(guildId) {
  const key = String(guildId || '');
  const reasons = pendingReasons.get(key);
  pendingReasons.delete(key);
  return Array.from(reasons || []);
}

async function runIdsCatalogSync(client, guildId) {
  const gid = String(guildId || '');
  if (!gid) return { changed: false, reason: 'missing-guild-id' };

  if (runningGuilds.has(gid)) {
    rerunGuilds.add(gid);
    return { changed: false, reason: 'already-running' };
  }

  runningGuilds.add(gid);
  try {
    const reasons = consumeReasons(gid);
    const guild = client.guilds.cache.get(gid) || await client.guilds.fetch(gid).catch(() => null);
    if (!guild) return { changed: false, reason: 'guild-not-found' };

    const IDs = require('./ids');
    const payload = await collectGuildCatalog(guild, IDs);
    const baseDir = path.resolve(process.cwd());
    const catalogPath = getCatalogPath(baseDir);
    const previous = fs.existsSync(catalogPath) ? fs.readFileSync(catalogPath, 'utf8') : '';

    if (previous === payload.catalogSource) {
      return { changed: false, reason: 'no-diff', triggers: reasons };
    }

    writeCatalogFiles(baseDir, payload);
    delete require.cache[require.resolve('./idsCatalog')];
    delete require.cache[require.resolve('./ids')];

    return { changed: true, triggers: reasons };
  } catch (error) {
    global.logger.error('[IDS AUTO SYNC] Failed:', error);
    return { changed: false, reason: 'error', error };
  } finally {
    runningGuilds.delete(gid);
    if (rerunGuilds.has(gid)) {
      rerunGuilds.delete(gid);
      queueIdsCatalogSync(client, gid, 'rerun', { delayMs: 3000 });
    }
  }
}

function queueIdsCatalogSync(client, guildId, reason = 'event', options = {}) {
  const gid = String(guildId || '');
  if (!gid) return;
  addReason(gid, reason);

  const delayMs = Number.isFinite(options.delayMs) ? Math.max(0, options.delayMs) : DEFAULT_DELAY_MS;
  const existing = timers.get(gid);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    timers.delete(gid);
    await runIdsCatalogSync(client, gid);
  }, delayMs);

  timers.set(gid, timer);
}

module.exports = {
  queueIdsCatalogSync,
  runIdsCatalogSync
};
