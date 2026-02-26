"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const ROOT = path.resolve(__dirname, "..");
const SOURCES_PATH = path.resolve(
  ROOT,
  "Utils/Config/automodRacistWords/sources.json",
);
const OUTPUT_PATH = path.resolve(
  ROOT,
  "Utils/Config/automodRacistWords/auto.multilang.json",
);
const MANUAL_BASE_PATH = path.resolve(ROOT, "Utils/Config/automodRacistWords.json");
const EXTRA_ALLOWED_STEMS = [
  "beaner",
  "chink",
  "chingchong",
  "cingen",
  "chernozhopy",
  "coon",
  "dago",
  "gook",
  "honky",
  "kike",
  "nigg",
  "paki",
  "porchmonkey",
  "raghead",
  "sandnigger",
  "spic",
  "wetback",
  "zingar",
];

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeWord(word) {
  return String(word || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseRawList(content) {
  return String(content || "")
    .split(/\r?\n/g)
    .map((line) => normalizeWord(line))
    .filter((line) => line && !line.startsWith("#") && line.length >= 3);
}

function compactWord(word) {
  return String(word || "").replace(/[^a-z0-9]+/g, "");
}

function loadManualBaseWords() {
  try {
    if (!fs.existsSync(MANUAL_BASE_PATH)) return [];
    const raw = fs.readFileSync(MANUAL_BASE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => normalizeWord(x))
      .filter((x) => x.length >= 3);
  } catch {
    return [];
  }
}

function buildAllowedStems() {
  const manual = loadManualBaseWords();
  const stems = new Set(EXTRA_ALLOWED_STEMS.map((x) => compactWord(normalizeWord(x))));
  for (const word of manual) {
    const compact = compactWord(word);
    if (compact.length >= 3) stems.add(compact);
  }
  return [...stems].filter((x) => x.length >= 3);
}

function isAllowedRacistCandidate(word, allowedStems) {
  const compact = compactWord(normalizeWord(word));
  if (!compact || compact.length < 3) return false;
  return allowedStems.some(
    (stem) =>
      compact.includes(stem) ||
      (compact.length >= 4 && stem.includes(compact)),
  );
}

async function fetchSource(url) {
  const res = await axios.get(url, {
    timeout: 20_000,
    maxContentLength: 4 * 1024 * 1024,
    responseType: "text",
    validateStatus: (s) => s >= 200 && s < 300,
  });
  return parseRawList(res.data);
}

async function main() {
  if (!fs.existsSync(SOURCES_PATH)) {
    throw new Error(`Missing sources file: ${SOURCES_PATH}`);
  }
  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
  if (!Array.isArray(sources) || !sources.length) {
    throw new Error("sources.json must be a non-empty JSON array of URLs");
  }

  const allowedStems = buildAllowedStems();
  if (!allowedStems.length) {
    throw new Error("No allowed racist stems available for filtering");
  }

  const all = new Set();
  const failed = [];
  for (const src of sources) {
    const url = String(src || "").trim();
    if (!url) continue;
    try {
      const words = await fetchSource(url);
      const filtered = words.filter((w) => isAllowedRacistCandidate(w, allowedStems));
      for (const w of filtered) all.add(w);
      console.log(`[sync-automod-wordlists] ok ${url} (${filtered.length}/${words.length})`);
    } catch (err) {
      failed.push(url);
      console.warn(`[sync-automod-wordlists] fail ${url}: ${err.message}`);
    }
  }

  const list = [...all].sort((a, b) => a.localeCompare(b));
  ensureDir(OUTPUT_PATH);
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(list, null, 2)}\n`, "utf8");
  console.log(
    `[sync-automod-wordlists] wrote ${list.length} terms to ${OUTPUT_PATH}`,
  );
  if (failed.length) {
    console.warn(
      `[sync-automod-wordlists] failed sources: ${failed.length}/${sources.length}`,
    );
  }
}

main().catch((err) => {
  console.error(`[sync-automod-wordlists] fatal: ${err.stack || err.message}`);
  process.exitCode = 1;
});