const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const NoDmPreference = require("../Schemas/Community/noDmPreferenceSchema");
const DATA_PATH = path.join(__dirname, "..", "Data", "noDmList.json");
const BACKUP_PATH = `${DATA_PATH}.bak`;
const TMP_PATH = `${DATA_PATH}.tmp`;
let cache = null;
let writeQueue = Promise.resolve();
let migrationPromise = null;

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

function normalizeData(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [guildId, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const unique = new Set(list.map((id) => String(id)).filter((id) => id && id !== "undefined" && id !== "null"),);
    out[String(guildId)] = [...unique];
  }
  return out;
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeData(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function loadFileData() {
  if (cache !== null) return cache;

  const main = await readJsonIfExists(DATA_PATH);
  if (main) {
    cache = main;
    return cache;
  }

  const backup = await readJsonIfExists(BACKUP_PATH);
  if (backup) {
    cache = backup;
    await atomicWrite(cache).catch(() => { });
    return cache;
  }

  cache = {};
  return cache;
}

async function atomicWrite(data) {
  const dir = path.dirname(DATA_PATH);
  await fs.mkdir(dir, { recursive: true });
  const payload = JSON.stringify(normalizeData(data), null, 2);

  await fs.writeFile(TMP_PATH, payload, "utf8");
  await fs.copyFile(DATA_PATH, BACKUP_PATH).catch(() => { });
  await fs.rename(TMP_PATH, DATA_PATH);
  await fs.copyFile(DATA_PATH, BACKUP_PATH).catch(() => { });
}

async function saveFileData(data) {
  cache = normalizeData(data);
  await atomicWrite(cache);
}

function withWriteLock(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

async function mirrorAddToFile(guildId, userId) {
  await withWriteLock(async () => {
    const data = await loadFileData();
    const key = String(guildId);
    const uid = String(userId);
    const list = Array.isArray(data[key]) ? [...data[key]] : [];
    if (!list.includes(uid)) list.push(uid);
    data[key] = list;
    await saveFileData(data);
  });
}

async function mirrorRemoveFromFile(guildId, userId) {
  await withWriteLock(async () => {
    const data = await loadFileData();
    const key = String(guildId);
    const uid = String(userId);
    const list = Array.isArray(data[key]) ? data[key] : [];
    data[key] = list.filter((id) => String(id) !== uid);
    await saveFileData(data);
  });
}

async function migrateFileToDbOnce() {
  if (!isDbReady()) return;
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const data = await loadFileData();
    const ops = [];
    for (const [guildId, list] of Object.entries(data)) {
      for (const userId of list) {
        ops.push({
          updateOne: {
            filter: { guildId: String(guildId), userId: String(userId) },
            update: {
              $setOnInsert: {
                guildId: String(guildId),
                userId: String(userId),
              },
            },
            upsert: true,
          },
        });
      }
    }

    if (ops.length > 0) {
      await NoDmPreference.bulkWrite(ops, { ordered: false }).catch(() => { });
    }
  })();

  return migrationPromise;
}

/** Categorie supportate per preferenze DM (chiavi interne). */
const DM_CATEGORIES = Object.freeze(["weekly", "bump", "broadcast", "invites", "perks"]);
const DM_CATEGORY_ALL = "all";

/** Etichette per lista admin no-dm-list. */
const DM_CATEGORY_LABELS = Object.freeze({
  weekly: "Promemoria settimanali",
  bump: "Avvisi Bump",
  broadcast: "Avvisi dallo staff",
  invites: "Inviti",
  perks: "Livelli e perk",
});

async function getNoDmSet(guildId) {
  const key = String(guildId);

  if (isDbReady()) {
    await migrateFileToDbOnce();
    const rows = await NoDmPreference.find(
      { guildId: key },
      { _id: 0, userId: 1, categories: 1 },
    ).lean();
    return new Set(
      rows
        .filter((row) => {
          const cat = row.categories;
          return !cat || cat.length === 0 || (Array.isArray(cat) && cat.includes(DM_CATEGORY_ALL));
        })
        .map((row) => String(row.userId)),
    );
  }

  const data = await loadFileData();
  const list = Array.isArray(data[key]) ? data[key] : [];
  return new Set(list);
}

/**
 * Preferenze no-DM per un utente. blockAll = nessun DM; disabled = set di categorie disattivate.
 * @returns {{ blockAll: boolean, disabled: Set<string> }}
 */
async function getNoDmPreferences(guildId, userId) {
  const key = String(guildId);
  const uid = String(userId);

  if (isDbReady()) {
    await migrateFileToDbOnce();
    const doc = await NoDmPreference.findOne(
      { guildId: key, userId: uid },
      { _id: 0, categories: 1 },
    ).lean();
    if (!doc) return { blockAll: false, disabled: new Set() };
    const cat = doc.categories;
    if (!cat || !Array.isArray(cat) || cat.length === 0) return { blockAll: true, disabled: new Set([DM_CATEGORY_ALL]) };
    if (cat.includes(DM_CATEGORY_ALL)) return { blockAll: true, disabled: new Set([DM_CATEGORY_ALL]) };
    return { blockAll: false, disabled: new Set(cat) };
  }

  const data = await loadFileData();
  const list = Array.isArray(data[key]) ? data[key] : [];
  const inList = list.some((id) => String(id) === uid);
  return inList ? { blockAll: true, disabled: new Set([DM_CATEGORY_ALL]) } : { blockAll: false, disabled: new Set() };
}

/**
 * Imposta le categorie disattivate per un utente. categories: ["all"] = blocca tutto; [] = ricevi tutto; ["weekly","bump"] = solo quelle.
 */
async function setNoDmCategories(guildId, userId, categories) {
  const key = String(guildId);
  const uid = String(userId);
  const list = Array.isArray(categories) ? categories.filter(Boolean).map(String) : [];

  if (isDbReady()) {
    await migrateFileToDbOnce();
    if (list.length === 0) {
      await NoDmPreference.deleteOne({ guildId: key, userId: uid });
      await mirrorRemoveFromFile(key, uid).catch(() => {});
      return;
    }
    await NoDmPreference.updateOne(
      { guildId: key, userId: uid },
      { $set: { guildId: key, userId: uid, categories: list } },
      { upsert: true },
    );
    await mirrorAddToFile(key, uid).catch(() => {});
    return;
  }

  if (list.includes(DM_CATEGORY_ALL)) await mirrorAddToFile(key, uid);
  else await mirrorRemoveFromFile(key, uid);
}

async function shouldBlockDm(guildId, userId, category) {
  const prefs = await getNoDmPreferences(guildId, userId).catch(() => ({ blockAll: false, disabled: new Set() }));
  if (prefs.blockAll) return true;
  if (!category) return false;
  return prefs.disabled.has(category);
}

/**
 * Tutte le preferenze no-DM della guild (per lista admin). Ritorna [{ userId, blockAll, disabled: string[] }].
 */
async function getAllNoDmPreferences(guildId) {
  const key = String(guildId);

  if (isDbReady()) {
    await migrateFileToDbOnce();
    const rows = await NoDmPreference.find({ guildId: key }, { _id: 0, userId: 1, categories: 1 }).lean();
    return rows.map((row) => {
      const uid = String(row.userId);
      const cat = row.categories;
      if (!cat || !Array.isArray(cat) || cat.length === 0)
        return { userId: uid, blockAll: true, disabled: [] };
      if (cat.includes(DM_CATEGORY_ALL))
        return { userId: uid, blockAll: true, disabled: [] };
      return { userId: uid, blockAll: false, disabled: [...cat] };
    });
  }

  const data = await loadFileData();
  const list = Array.isArray(data[key]) ? data[key] : [];
  return list.map((uid) => ({ userId: String(uid), blockAll: true, disabled: [] }));
}

async function addNoDm(guildId, userId) {
  const key = String(guildId);
  const uid = String(userId);

  if (isDbReady()) {
    await migrateFileToDbOnce();
    await NoDmPreference.updateOne(
      { guildId: key, userId: uid },
      { $set: { guildId: key, userId: uid, categories: [DM_CATEGORY_ALL] } },
      { upsert: true },
    );
    await mirrorAddToFile(key, uid).catch(() => {});
    return;
  }

  await mirrorAddToFile(key, uid);
}

async function removeNoDm(guildId, userId) {
  const key = String(guildId);
  const uid = String(userId);

  if (isDbReady()) {
    await migrateFileToDbOnce();
    await NoDmPreference.deleteOne({ guildId: key, userId: uid });
    await mirrorRemoveFromFile(key, uid).catch(() => { });
    return;
  }

  await mirrorRemoveFromFile(key, uid);
}

/**
 * Invia un DM all'utente. Con bypassNoDm: true non applica il filtro no-dm (per moderazione, ticket, security, ecc.).
 * @param {import("discord.js").User} user
 * @param {import("discord.js").MessageCreateOptions} payload
 * @param {{ guildId?: string, bypassNoDm?: boolean, category?: string }} options - category: chiave categoria (weekly, bump, broadcast, invites, perks)
 * @returns {Promise<import("discord.js").Message|null>} Il messaggio inviato o null
 */
async function sendDm(user, payload, options = {}) {
  const { guildId, bypassNoDm = false, category = null } = options;
  if (!user?.send) return null;
  if (bypassNoDm) {
    return user.send(payload).catch(() => null);
  }
  if (!guildId) return user.send(payload).catch(() => null);
  if (category) {
    const block = await shouldBlockDm(guildId, user.id, category).catch(() => false);
    if (block) return null;
  } else {
    const set = await getNoDmSet(guildId).catch(() => new Set());
    if (set.has(String(user.id))) return null;
  }
  return user.send(payload).catch(() => null);
}

module.exports = {
  getNoDmSet,
  addNoDm,
  removeNoDm,
  sendDm,
  getNoDmPreferences,
  setNoDmCategories,
  shouldBlockDm,
  getAllNoDmPreferences,
  DM_CATEGORIES,
  DM_CATEGORY_ALL,
  DM_CATEGORY_LABELS,
};