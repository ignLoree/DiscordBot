const cron = require("node-cron");
const axios = require("axios");
const Poll = require("../../Schemas/Poll/pollSchema");
const IDs = require("../../Utils/Config/ids");
const { createPollForGuild } = require("../../Commands/Admin/poll");
const { translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

const TIMEZONE = "Europe/Rome";
const DEFAULT_API_URL = "https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986";
const COUNTER_FILTER_QUESTION = "__counter__";
const DEFAULT_WINDOW_START_HOUR = 19;
const DEFAULT_WINDOW_START_MINUTE = 0;
const DEFAULT_WINDOW_END_HOUR = 21;
const DEFAULT_WINDOW_END_MINUTE = 59;
const DEFAULT_SOURCES = ["local", "opentdb"];
const OPENTDB_CATEGORY_CATALOG = [
  { id: 9, key: "general_knowledge" },
  { id: 10, key: "books" },
  { id: 11, key: "film" },
  { id: 12, key: "music" },
  { id: 13, key: "musicals_theatres" },
  { id: 14, key: "television" },
  { id: 15, key: "video_games" },
  { id: 16, key: "board_games" },
  { id: 17, key: "science_nature" },
  { id: 18, key: "computers" },
  { id: 19, key: "mathematics" },
  { id: 20, key: "mythology" },
  { id: 21, key: "sports" },
  { id: 22, key: "geography" },
  { id: 23, key: "history" },
  { id: 24, key: "politics" },
  { id: 25, key: "art" },
  { id: 26, key: "celebrities" },
  { id: 27, key: "animals" },
  { id: 28, key: "vehicles" },
  { id: 29, key: "comics" },
  { id: 30, key: "gadgets" },
  { id: 31, key: "anime_manga" },
  { id: 32, key: "cartoon_animations" },
];
const DEFAULT_OPENTDB_CATEGORY_IDS = OPENTDB_CATEGORY_CATALOG.map((c) => c.id);
const LOCAL_THEME_POLLS = [
  {
    question: "Che tema ti va di vedere più spesso?",
    answers: ["Musica", "Cinema/Serie TV", "Gaming", "Sport", "Arte", "Tecnologia", "Attualità", "Meme/Intrattenimento"],
  },
  {
    question: "Su cosa dovremmo puntare questo mese?",
    answers: ["Nuovi format in chat", "Più eventi vocali", "Migliore organizzazione canali", "Nuovi perks", "Più moderazione live", "Più attività partner", "Più minigiochi", "Più feedback staff"],
  },
  {
    question: "Quando preferisci gli eventi?",
    answers: ["15:00 - 17:00", "17:00 - 19:00", "19:00 - 21:00", "21:00 - 23:00", "Weekend pomeriggio", "Weekend sera"],
  },
  {
    question: "Che ambito sportivo ti interessa di più?",
    answers: ["Serie A", "Champions League", "NBA", "F1/MotoGP", "Tennis", "E-sports", "MMA/Boxe", "Altro sport"],
  },
  {
    question: "Che tipo di contenuto musicale preferisci?",
    answers: ["Nuove uscite", "Classici intramontabili", "Playlist tematiche", "Album review", "Battle tra artisti", "Live session", "Top settimanali", "Consigli della community"],
  },
  {
    question: "Di che attualità ti va parlare più spesso?",
    answers: ["Tecnologia/IA", "Economia", "Ambiente", "Scuola/Università", "Lavoro", "Sport", "Cultura", "Politica internazionale"],
  },
  {
    question: "Nel lavoro di oggi, che skill conta di più?",
    answers: ["Comunicazione", "Problem solving", "Lingue", "Competenze digitali", "Leadership", "Teamwork", "Organizzazione", "Creatività"],
  },
  {
    question: "Che discussioni musicali ti piacciono di più?",
    answers: ["Analisi testi", "Confronto artisti", "Generi emergenti", "Top album del mese", "Classifiche storiche", "Live e concerti", "Produzione musicale", "Nuovi talenti"],
  },
  {
    question: "Come preferisci i topic sportivi?",
    answers: ["Pre-partita", "Post-partita", "Pronostici", "Top/Flop giornata", "Mercato", "Storie e aneddoti", "Statistiche", "Quiz sportivi"],
  },
  {
    question: "Che calcio segui di più?",
    answers: ["Serie A", "Premier League", "LaLiga", "Bundesliga", "Ligue 1", "Champions League", "Europa League", "Nazionale"],
  },
  {
    question: "Su cosa vuoi più supporto tra lavoro/studio?",
    answers: ["CV e colloqui", "Produttività", "Orientamento carriera", "Freelance", "Remote work", "Gestione stress", "Formazione online", "Networking"],
  },
  {
    question: "Che tema vuoi vedere più spesso nei poll?",
    answers: ["Attualità", "Musica", "Lavoro", "Sport", "Calcio", "Cinema/Serie", "Gaming", "Tech/IA", "Benessere", "Community feedback"],
  },
  {
    question: "Che tipo di news rapide preferisci?",
    answers: ["Flash quotidiani", "Recap settimanale", "Solo top notizie", "Approfondimenti", "Sondaggi su news", "Fact-checking", "Trend social", "Niente news"],
  },
  {
    question: "Nei topic calcio, cosa ti è più utile?",
    answers: ["Analisi tattica", "Statistiche giocatori", "Situazione classifica", "Mercato e rumors", "Formazioni probabili", "Highlights", "Giovani talenti", "Confronto squadre"],
  },
  {
    question: "Per crescere nel lavoro, cosa ti interessa di più?",
    answers: ["Marketing", "Programmazione", "Design", "Data analysis", "Project management", "Vendite", "Risorse umane", "Imprenditoria"],
  },
];

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&uuml;/g, "u");
}

function decodeUrl3986(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getRomeDayBounds(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const year = Number(parts.year || 0);
  const month = Number(parts.month || 1);
  const day = Number(parts.day || 1);
  const startRome = createUtcFromRomeLocal(year, month, day, 0, 0, 0);
  const endRome = createUtcFromRomeLocal(year, month, day + 1, 0, 0, 0);
  return { startRome, endRome };
}

function getRomeTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(
    parts.find((part) => part.type === "hour")?.value || 0,
  );
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value || 0,
  );
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function isWithinAutoPollWindow(now = new Date(), cfg = {}) {
  const startHour = Number.isFinite(Number(cfg?.windowStartHour))
    ? Number(cfg.windowStartHour)
    : DEFAULT_WINDOW_START_HOUR;
  const startMinute = Number.isFinite(Number(cfg?.windowStartMinute))
    ? Number(cfg.windowStartMinute)
    : DEFAULT_WINDOW_START_MINUTE;
  const endHour = Number.isFinite(Number(cfg?.windowEndHour))
    ? Number(cfg.windowEndHour)
    : DEFAULT_WINDOW_END_HOUR;
  const endMinute = Number.isFinite(Number(cfg?.windowEndMinute))
    ? Number(cfg.windowEndMinute)
    : DEFAULT_WINDOW_END_MINUTE;
  const { hour, minute } = getRomeTimeParts(now);
  const nowTotal = hour * 60 + minute;
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  return nowTotal >= startTotal && nowTotal <= endTotal;
}

function getRomeOffsetMs(utcDate) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const zoneName = formatter
    .formatToParts(utcDate)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(
    /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i,
  );
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year, month, day, hour, minute, second) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

function normalizeApiPollPayload(data) {
  if (!data) return null;
  if (typeof data?.question === "string" && Array.isArray(data?.answers)) {
    const question = normalizeText(decodeHtml(decodeUrl3986(data.question)));
    const answers = data.answers
      .map((v) => normalizeText(decodeHtml(decodeUrl3986(v))))
      .filter(Boolean);
    if (question && answers.length >= 2) return { question, answers };
  }

  const item = Array.isArray(data) ? data[0] : data?.results?.[0];
  if (item && typeof item.question === "string") {
    const question = normalizeText(decodeHtml(decodeUrl3986(item.question)));
    const wrong = Array.isArray(item.incorrect_answers) ? item.incorrect_answers : [];
    const correct = item.correct_answer ? [item.correct_answer] : [];
    const answers = [...correct, ...wrong]
      .map((v) => normalizeText(decodeHtml(decodeUrl3986(v))))
      .filter(Boolean);
    if (question && answers.length >= 2) return { question, answers };
  }
  return null;
}

function shuffle(list) {
  const arr = Array.isArray(list) ? [...list] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildThemedApiUrl(baseUrl, cfg = {}) {
  const rawBase = String(baseUrl || DEFAULT_API_URL).trim();
  if (!rawBase) return DEFAULT_API_URL;
  const catalogEntries = Array.isArray(cfg?.apiThemeCatalog) && cfg.apiThemeCatalog.length
    ? cfg.apiThemeCatalog
    : OPENTDB_CATEGORY_CATALOG;
  const catalogByKey = new Map(
    catalogEntries.map((entry) => [
      String(entry?.key || "").trim().toLowerCase(),
      Number(entry?.id || 0),
    ]),
  );
  const rawCategories = Array.isArray(cfg?.apiThemeCategories)
    ? cfg.apiThemeCategories
    : DEFAULT_OPENTDB_CATEGORY_IDS;
  const hasAllToken = rawCategories.some(
    (entry) => String(entry || "").trim().toLowerCase() === "all",
  );
  const categoryIds = hasAllToken
    ? catalogEntries
      .map((entry) => Number(entry?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0)
    : rawCategories
      .map((entry) => {
        const asNum = Number(entry);
        if (Number.isFinite(asNum) && asNum > 0) return asNum;
        const key = String(entry || "").trim().toLowerCase();
        return Number(catalogByKey.get(key) || 0);
      })
      .filter((id) => Number.isFinite(id) && id > 0);
  const safeCategoryIds = categoryIds.length ? categoryIds : DEFAULT_OPENTDB_CATEGORY_IDS;
  const category = pickRandom(safeCategoryIds);
  if (!category) return rawBase;

  // If caller already forced category, keep it.
  if (/[?&]category=\d+/i.test(rawBase)) return rawBase;
  const separator = rawBase.includes("?") ? "&" : "?";
  return `${rawBase}${separator}category=${category}`;
}

function pickRandom(list) {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)] || null;
}

function clampOptionCount(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(2, Math.min(10, Math.floor(n)));
}

function pickRandomFromRange(min, max) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return a + Math.floor(Math.random() * (b - a + 1));
}

function pickNextOptionTarget(client, cfg = {}) {
  const minOptions = clampOptionCount(cfg.minOptions, 2);
  const maxOptions = Math.max(minOptions, clampOptionCount(cfg.maxOptions, 10));
  const lowMax = Math.min(maxOptions, Math.max(minOptions, 4));
  const midMin = Math.max(minOptions, 5);
  const midMax = Math.min(maxOptions, 7);
  const highMin = Math.max(minOptions, 8);

  const pools = [];
  if (minOptions <= lowMax) pools.push({ key: "low", min: minOptions, max: lowMax });
  if (midMin <= midMax) pools.push({ key: "mid", min: midMin, max: midMax });
  if (highMin <= maxOptions) pools.push({ key: "high", min: highMin, max: maxOptions });
  if (!pools.length) return minOptions;

  const lastBand = String(client?._autoPollLastBand || "");
  let candidates = pools.filter((band) => band.key !== lastBand);
  if (!candidates.length) candidates = pools;
  const chosenBand = candidates[Math.floor(Math.random() * candidates.length)];
  const target = pickRandomFromRange(chosenBand.min, chosenBand.max);
  if (client) {
    client._autoPollLastBand = chosenBand.key;
    client._autoPollLastOptionCount = target;
  }
  return target;
}

function applyOptionCount(payload, cfg = {}, forcedTargetOptions = null) {
  if (!payload) return null;
  const minOptions = clampOptionCount(cfg.minOptions, 2);
  const maxOptions = Math.max(minOptions, clampOptionCount(cfg.maxOptions, 10));
  const targetOptions = Number.isFinite(Number(forcedTargetOptions))
    ? Math.max(minOptions, Math.min(maxOptions, Math.floor(Number(forcedTargetOptions))))
    : maxOptions;
  const answers = Array.isArray(payload.answers)
    ? payload.answers.map((x) => normalizeText(String(x || ""))).filter(Boolean)
    : [];
  if (answers.length < minOptions) return null;
  return {
    question: normalizeText(String(payload.question || "")),
    answers: shuffle(answers).slice(0, targetOptions),
  };
}

function buildLocalThemePoll(cfg = {}) {
  const picked = pickRandom(LOCAL_THEME_POLLS);
  if (!picked) return null;
  return applyOptionCount(
    {
      question: picked.question,
      answers: picked.answers,
    },
    cfg,
  );
}

async function translatePollPayloadToItalian(payload) {
  const questionRaw = normalizeText(String(payload?.question || ""));
  const answersRaw = Array.isArray(payload?.answers) ? payload.answers : [];
  if (!questionRaw || answersRaw.length < 2) return null;

  const questionIt = normalizeText(await translateToItalian(questionRaw, { maxLength: 900 }));
  const answersIt = (
    await Promise.all(
      answersRaw.map((entry) => translateToItalian(normalizeText(String(entry || "")), { maxLength: 280 })),
    )
  )
    .map((entry) => normalizeText(String(entry || "")))
    .filter(Boolean);

  const uniqueAnswers = [];
  const seen = new Set();
  for (const ans of answersIt) {
    const key = ans.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueAnswers.push(ans);
  }

  if (!questionIt || uniqueAnswers.length < 2) return null;
  return { question: questionIt, answers: uniqueAnswers.slice(0, 10) };
}

function buildSurveyFromApiTopic(payload, cfg = {}, forcedTargetOptions = null) {
  const topic = normalizeText(String(payload?.question || ""));
  if (!topic) return null;
  const baseTopic = topic.replace(/[.!?]+$/g, "").trim();
  const shortTopic = baseTopic.length > 110 ? `${baseTopic.slice(0, 107)}...` : baseTopic;
  const question = `Qual è la tua opinione su "${shortTopic}"?`;
  const surveyBase = {
    question,
    answers: [
      "Moltissimo",
      "Abbastanza",
      "Neutrale",
      "Poco",
      "Per niente",
      "Dipende da come viene trattato",
      "Solo in alcuni orari",
      "Sì, ma in formato breve",
      "Sì, con approfondimenti",
      "Solo se legato all'attualità",
    ],
  };
  return applyOptionCount(surveyBase, cfg, forcedTargetOptions);
}

async function fetchPollFromApi(apiUrl) {
  const res = await axios.get(apiUrl || DEFAULT_API_URL, { timeout: 15000 });
  const normalized = normalizeApiPollPayload(res?.data);
  if (!normalized) return null;
  return {
    question: normalized.question,
    answers: shuffle(normalized.answers).slice(0, 10),
  };
}

async function hasManualPollToday(guildId) {
  const { startRome, endRome } = getRomeDayBounds();
  const count = await Poll.countDocuments({
    guildId: String(guildId),
    domanda: { $ne: COUNTER_FILTER_QUESTION },
    $or: [{ source: "manual" }, { source: { $exists: false } }],
    createdAt: { $gte: startRome, $lt: endRome },
  }).catch(() => 0);
  return Number(count || 0) > 0;
}

async function hasAutoPollToday(guildId) {
  const { startRome, endRome } = getRomeDayBounds();
  const count = await Poll.countDocuments({
    guildId: String(guildId),
    domanda: { $ne: COUNTER_FILTER_QUESTION },
    source: "auto",
    createdAt: { $gte: startRome, $lt: endRome },
  }).catch(() => 0);
  return Number(count || 0) > 0;
}

async function isDuplicateQuestion(guildId, question) {
  const normalized = normalizeText(question).toLowerCase();
  if (!normalized) return true;
  const existing = await Poll.findOne({
    guildId: String(guildId),
    domanda: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    $or: [{ source: { $in: ["manual", "auto"] } }, { source: { $exists: false } }],
  }).lean().catch(() => null);
  return Boolean(existing);
}

function buildPollSignature(question, answers = []) {
  const q = normalizeText(String(question || "")).toLowerCase();
  const opts = Array.isArray(answers)
    ? answers.map((a) => normalizeText(String(a || "")).toLowerCase()).filter(Boolean)
    : [];
  const uniq = Array.from(new Set(opts)).sort();
  return `${q}||${uniq.join("|")}`;
}

async function isDuplicatePollContent(guildId, payload) {
  const signature = buildPollSignature(payload?.question, payload?.answers);
  if (!signature || signature === "||") return true;
  const rows = await Poll.find(
    {
      guildId: String(guildId),
      domanda: { $ne: COUNTER_FILTER_QUESTION },
      $or: [{ source: { $in: ["manual", "auto"] } }, { source: { $exists: false } }],
    },
    {
      domanda: 1,
      risposta1: 1,
      risposta2: 1,
      risposta3: 1,
      risposta4: 1,
      risposta5: 1,
      risposta6: 1,
      risposta7: 1,
      risposta8: 1,
      risposta9: 1,
      risposta10: 1,
    },
  )
    .sort({ createdAt: -1, _id: -1 })
    .limit(400)
    .lean()
    .catch(() => []);
  for (const row of rows) {
    const rowAnswers = [
      row?.risposta1,
      row?.risposta2,
      row?.risposta3,
      row?.risposta4,
      row?.risposta5,
      row?.risposta6,
      row?.risposta7,
      row?.risposta8,
      row?.risposta9,
      row?.risposta10,
    ];
    const rowSig = buildPollSignature(row?.domanda, rowAnswers);
    if (rowSig === signature) return true;
  }
  return false;
}

async function runAutoPoll(client) {
  const guild =
    client.guilds.cache.get(IDs.guilds.main) ||
    (await client.guilds.fetch(IDs.guilds.main).catch(() => null));
  if (!guild) return;

  if (await hasManualPollToday(guild.id)) return;
  if (await hasAutoPollToday(guild.id)) return;

  const cfg = client?.config?.autoPoll || {};
  const enabled = cfg.enabled !== false;
  if (!enabled) return;
  if (!isWithinAutoPollWindow(new Date(), cfg)) return;
  const optionTarget = pickNextOptionTarget(client, cfg);

  let payload = null;
  const apiUrlBase = String(cfg.apiUrl || DEFAULT_API_URL).trim();
  const configuredSources = Array.isArray(cfg.sources) && cfg.sources.length
    ? cfg.sources.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean)
    : DEFAULT_SOURCES;
  const sources = configuredSources.length ? configuredSources : DEFAULT_SOURCES;

  for (let i = 0; i < 8; i += 1) {
    const source = pickRandom(sources);
    let candidate = null;

    if (source === "local") {
      candidate = buildLocalThemePoll(cfg);
      candidate = applyOptionCount(candidate, cfg, optionTarget);
    } else {
      const themedApiUrl = buildThemedApiUrl(apiUrlBase, cfg);
      const fetched = await fetchPollFromApi(themedApiUrl).catch(() => null);
      if (fetched) {
        const italian = await translatePollPayloadToItalian(fetched).catch(() => null);
        candidate = buildSurveyFromApiTopic(italian, cfg, optionTarget);
      }
    }

    if (!candidate || !candidate.question || !Array.isArray(candidate.answers)) continue;
    if (candidate.answers.length < 2) continue;

    const duplicateQuestion = await isDuplicateQuestion(guild.id, candidate.question);
    if (duplicateQuestion) continue;
    const duplicateContent = await isDuplicatePollContent(guild.id, candidate);
    if (duplicateContent) continue;
    payload = candidate;
    break;
  }
  if (!payload) return;

  const result = await createPollForGuild(guild, {
    question: payload.question,
    answers: payload.answers,
    source: "auto",
  });
  if (result?.ok) {
    global.logger?.info?.(`[poll.auto] created #${result.pollNumber} for guild ${guild.id}`);
  }
}

function startAutoPollLoop(client) {
  if (client._autoPollTask?.stop) {
    try {
      client._autoPollTask.stop();
    } catch {}
  }

  client._autoPollTask = cron.schedule(
    "0 21 * * *",
    () => {
      runAutoPoll(client).catch((error) => {
        global.logger?.error?.("[poll.auto] run failed:", error);
      });
    },
    { timezone: TIMEZONE },
  );
}

module.exports = {
  startAutoPollLoop,
  runAutoPoll,
};
