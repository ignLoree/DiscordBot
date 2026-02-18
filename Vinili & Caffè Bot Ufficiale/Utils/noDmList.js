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
    const unique = new Set(
      list
        .map((id) => String(id))
        .filter((id) => id && id !== "undefined" && id !== "null"),
    );
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
    await atomicWrite(cache).catch(() => {});
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
  await fs.copyFile(DATA_PATH, BACKUP_PATH).catch(() => {});
  await fs.rename(TMP_PATH, DATA_PATH);
  await fs.copyFile(DATA_PATH, BACKUP_PATH).catch(() => {});
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
      await NoDmPreference.bulkWrite(ops, { ordered: false }).catch(() => {});
    }
  })();

  return migrationPromise;
}

async function getNoDmSet(guildId) {
  const key = String(guildId);

  if (isDbReady()) {
    await migrateFileToDbOnce();
    const rows = await NoDmPreference.find(
      { guildId: key },
      { _id: 0, userId: 1 },
    ).lean();
    return new Set(rows.map((row) => String(row.userId)));
  }

  const data = await loadFileData();
  const list = Array.isArray(data[key]) ? data[key] : [];
  return new Set(list);
}

async function addNoDm(guildId, userId) {
  const key = String(guildId);
  const uid = String(userId);

  if (isDbReady()) {
    await migrateFileToDbOnce();
    await NoDmPreference.updateOne(
      { guildId: key, userId: uid },
      { $setOnInsert: { guildId: key, userId: uid } },
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
    await mirrorRemoveFromFile(key, uid).catch(() => {});
    return;
  }

  await mirrorRemoveFromFile(key, uid);
}

module.exports = {
  getNoDmSet,
  addNoDm,
  removeNoDm,
};
