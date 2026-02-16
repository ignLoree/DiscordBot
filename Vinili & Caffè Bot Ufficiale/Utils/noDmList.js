const fs = require("fs/promises");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "Data", "noDmList.json");
let cache = null;

async function loadData() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    cache = JSON.parse(raw);
  } catch {
    cache = {};
  }
  return cache;
}

async function saveData(data) {
  cache = data;
  const dir = path.dirname(DATA_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function getNoDmSet(guildId) {
  const data = await loadData();
  const list = Array.isArray(data[guildId]) ? data[guildId] : [];
  return new Set(list);
}

async function addNoDm(guildId, userId) {
  const data = await loadData();
  const list = Array.isArray(data[guildId]) ? data[guildId] : [];
  if (!list.includes(userId)) list.push(userId);
  data[guildId] = list;
  await saveData(data);
}

async function removeNoDm(guildId, userId) {
  const data = await loadData();
  const list = Array.isArray(data[guildId]) ? data[guildId] : [];
  data[guildId] = list.filter((id) => id !== userId);
  await saveData(data);
}

module.exports = {
  getNoDmSet,
  addNoDm,
  removeNoDm
};
