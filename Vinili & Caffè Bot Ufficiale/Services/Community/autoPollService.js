const cron = require("node-cron");
const axios = require("axios");
const Poll = require("../../Schemas/Poll/pollSchema");
const IDs = require("../../Utils/Config/ids");
const { createPollForGuild } = require("../../Commands/Admin/poll");

const TIMEZONE = "Europe/Rome";
const COUNTER_FILTER_QUESTION = "__counter__";
const DEFAULT_WINDOW_START_HOUR = 19;
const DEFAULT_WINDOW_START_MINUTE = 0;
const DEFAULT_WINDOW_END_HOUR = 21;
const DEFAULT_WINDOW_END_MINUTE = 59;
const DEFAULT_SOURCES = ["openrouter", "local"];
const DEFAULT_OPENROUTER_MODELS = [
  "google/gemma-3-12b-it:free",
  "google/gemma-3-27b-it:free",
  "openrouter/free",
];
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MAX_ROUNDS = 4;
const OPENROUTER_RETRY_DELAY_MS = 1500;

const LOCAL_THEME_POLLS = [
  {
    question: "Qual è il momento migliore della giornata?",
    answers: ["Mattina presto", "Tarda mattinata", "Pomeriggio", "Prima serata", "Notte"],
  },
  {
    question: "Quale stagione ti rappresenta di più?",
    answers: ["Primavera", "Estate", "Autunno", "Inverno"],
  },
  {
    question: "Come preferisci iniziare la giornata?",
    answers: ["Con calma", "Con una colazione abbondante", "Allenandomi", "Con musica o podcast", "Di corsa ma produttivo"],
  },
  {
    question: "Quale tipo di vacanza sceglieresti?",
    answers: ["Mare", "Montagna", "Città d'arte", "Road trip", "Relax totale"],
  },
  {
    question: "Cosa conta di più in un film?",
    answers: ["Trama", "Personaggi", "Colonna sonora", "Finale", "Fotografia"],
  },
  {
    question: "Quale pasto preferisci in assoluto?",
    answers: ["Colazione", "Pranzo", "Cena", "Spuntino"],
  },
  {
    question: "Che rapporto hai con il freddo?",
    answers: ["Lo adoro", "Mi piace solo se sono coperto bene", "Lo tollero", "Lo odio"],
  },
  {
    question: "Se potessi vivere in un'altra epoca, quale sceglieresti?",
    answers: ["Anni 80", "Anni 90", "Primi 2000", "Futuro", "Resto nel presente"],
  },
  {
    question: "Quale qualità apprezzi di più in una persona?",
    answers: ["Sincerità", "Ironia", "Intelligenza", "Gentilezza", "Determinazione"],
  },
  {
    question: "Come scegli di solito cosa guardare la sera?",
    answers: ["Consigli degli amici", "Trending", "Vado a caso", "Riguardo qualcosa che conosco", "Recensioni online"],
  },
  {
    question: "Qual è il tuo comfort food ideale?",
    answers: ["Pizza", "Pasta", "Dolci", "Panino o fast food", "Cibo fatto in casa"],
  },
  {
    question: "Che tipo di weekend preferisci?",
    answers: ["Pieno di impegni", "Fuori casa", "Chill totale", "Tra amici", "Improvvisato"],
  },
  {
    question: "Quale mezzo di trasporto sopporti meglio?",
    answers: ["Auto", "Treno", "Aereo", "Moto", "A piedi"],
  },
  {
    question: "Quale app usi più spesso in una giornata normale?",
    answers: ["WhatsApp", "Instagram", "TikTok", "YouTube", "Spotify"],
  },
  {
    question: "Che tipo di meteo ti mette più di buon umore?",
    answers: ["Sole pieno", "Pioggia leggera", "Temporale", "Freddo secco", "Cielo coperto"],
  },
  {
    question: "Se dovessi scegliere un superpotere, quale prenderesti?",
    answers: ["Teletrasporto", "Leggere nel pensiero", "Invisibilità", "Volare", "Fermare il tempo"],
  },
  {
    question: "Che tipo di contenuto ti intrattiene di più?",
    answers: ["Video brevi", "Film", "Serie TV", "Podcast", "Streaming live"],
  },
  {
    question: "Quando sei stanco, cosa ti recupera prima?",
    answers: ["Dormire", "Mangiare", "Uscire", "Musica", "Stare da solo"],
  },
  {
    question: "Quale snack vince sempre?",
    answers: ["Patatine", "Cioccolato", "Popcorn", "Gelato", "Frutta"],
  },
  {
    question: "Che tipo di persona sei nelle chat di gruppo?",
    answers: ["Quello che legge e basta", "Quello che manda meme", "Quello che risponde a tutti", "Quello che sparisce", "Quello che organizza"],
  },
  {
    question: "Qual è il miglior modo per passare il tempo da solo?",
    answers: ["Guardare qualcosa", "Giocare", "Ascoltare musica", "Dormire", "Fare una passeggiata"],
  },
  {
    question: "Cosa non dovrebbe mai mancare in una casa ideale?",
    answers: ["Spazio", "Silenzio", "Luce naturale", "Una cucina grande", "Una postazione relax"],
  },
  {
    question: "Quale sapore scegli più spesso?",
    answers: ["Dolce", "Salato", "Piccante", "Amaro", "Aspro"],
  },
  {
    question: "Come reagisci di solito agli imprevisti?",
    answers: ["Mi adatto subito", "Mi innervosisco", "Cerco un piano B", "Aspetto e vedo", "Dipende dalla situazione"],
  },
  {
    question: "Qual è il miglior periodo dell'anno?",
    answers: ["Gennaio-Marzo", "Aprile-Giugno", "Luglio-Settembre", "Ottobre-Dicembre"],
  },
  {
    question: "Che tipo di musica metti più spesso in cuffia?",
    answers: ["Per caricarmi", "Per rilassarmi", "Per concentrarmi", "Per nostalgia", "Dipende dal mood"],
  },
  {
    question: "Sei più tipo da piano o improvvisazione?",
    answers: ["Programmo tutto", "Organizzo il minimo", "Vado d'istinto", "Cambio idea spesso"],
  },
  {
    question: "Quale posto scegli per rilassarti davvero?",
    answers: ["Casa", "Mare", "Montagna", "Città", "Ovunque purché in pace"],
  },
  {
    question: "Quanto conta per te il primo impatto?",
    answers: ["Tantissimo", "Abbastanza", "Il giusto", "Poco"],
  },
];

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function shuffle(list) {
  const arr = Array.isArray(list) ? [...list] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickNextOptionTarget(client, cfg = {}) {
  const minOptions = clampOptionCount(cfg.minOptions, 4);
  const maxOptions = Math.max(minOptions, clampOptionCount(cfg.maxOptions, 5));
  const lowMax = Math.min(maxOptions, Math.max(minOptions, 4));
  const midMin = Math.max(minOptions, 5);
  const midMax = Math.min(maxOptions, 6);
  const highMin = Math.max(minOptions, 7);

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
  const minOptions = clampOptionCount(cfg.minOptions, 4);
  const maxOptions = Math.max(minOptions, clampOptionCount(cfg.maxOptions, 6));
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

function buildLocalThemePoll(cfg = {}, forcedTargetOptions = null) {
  const picked = pickRandom(LOCAL_THEME_POLLS);
  if (!picked) return null;
  return applyOptionCount(
    {
      question: picked.question,
      answers: picked.answers,
    },
    cfg,
    forcedTargetOptions,
  );
}

function buildPollSignature(question, answers = []) {
  const q = normalizeText(String(question || "")).toLowerCase();
  const opts = Array.isArray(answers)
    ? answers.map((a) => normalizeText(String(a || "")).toLowerCase()).filter(Boolean)
    : [];
  const uniq = Array.from(new Set(opts)).sort();
  return `${q}||${uniq.join("|")}`;
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
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existing = await Poll.findOne({
    guildId: String(guildId),
    domanda: { $regex: new RegExp(`^${escaped}$`, "i") },
    $or: [{ source: { $in: ["manual", "auto"] } }, { source: { $exists: false } }],
  }).lean().catch(() => null);
  return Boolean(existing);
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
    if (buildPollSignature(row?.domanda, rowAnswers) === signature) return true;
  }
  return false;
}

function extractStructuredText(responseData) {
  if (responseData && typeof responseData.output_text === "string") {
    return responseData.output_text;
  }
  const output = Array.isArray(responseData?.output) ? responseData.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const entry of content) {
      if (typeof entry?.text === "string" && entry.text.trim()) return entry.text;
    }
  }
  return "";
}

function unwrapJsonTextBlock(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const fencedMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();
  return text;
}

function validateGeneratedPollPayload(payload, cfg = {}, forcedTargetOptions = null) {
  const question = normalizeText(payload?.question);
  const rawAnswers = Array.isArray(payload?.answers) ? payload.answers : [];
  const answers = [];
  const seen = new Set();

  for (const entry of rawAnswers) {
    const answer = normalizeText(entry);
    const key = answer.toLowerCase();
    if (!answer || seen.has(key)) continue;
    seen.add(key);
    answers.push(answer);
  }

  if (!question || question.length < 12 || question.length > 120) return null;
  if (!/\?$/.test(question)) return null;
  if (/qual e la tua opinione su/i.test(question)) return null;
  if (/quale museo nazionale/i.test(question)) return null;
  if (answers.length < 4) return null;
  if (answers.some((answer) => answer.length < 2 || answer.length > 55)) return null;

  return applyOptionCount({ question, answers }, cfg, forcedTargetOptions);
}

async function fetchPollFromOpenRouter(cfg = {}, forcedTargetOptions = null) {
  const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) return null;

  const configuredModels = Array.isArray(cfg.openrouterModels)
    ? cfg.openrouterModels
    : String(process.env.OPENROUTER_MODEL || cfg.openrouterModel || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  const models = (
    configuredModels.length ? configuredModels : DEFAULT_OPENROUTER_MODELS
  ).map((entry) => String(entry || "").trim()).filter(Boolean);
  if (!models.length) return null;
  const optionCount = Math.max(4, Math.min(6, Number(forcedTargetOptions || 5)));
  let lastError = null;

  for (const model of models) {
    const isGemmaFree = model.startsWith("google/gemma-3-");
    const payload = {
      model,
      messages: isGemmaFree
        ? [
          {
            role: "user",
            content:
              "Genera sondaggi generali per utenti italiani. " +
              "Scrivi solo in italiano naturale. " +
              "Le domande devono sembrare sondaggi generali, leggeri e coinvolgenti, non interni a un server o community. " +
              "Evita trivia, domande da enciclopedia. " +
              "Le risposte devono essere coerenti tra loro, tutte plausibili, corte e senza duplicati. " +
              "Non usare risposte meta come 'dipende', 'altro', 'non so' salvo se davvero sensate. " +
              "Non usare mai riferimenti a Discord, community, server, staff, eventi del server o chat di gruppo. " +
              "Non usare mai il formato 'Qual è la tua opinione su ...'. " +
              `Genera un poll con ${optionCount} risposte. ` +
              "Target: pubblico italiano generalista. " +
              "La domanda deve essere breve, chiara, coinvolgente e adatta a ricevere risposte reali da chiunque. " +
              "I temi giusti sono abitudini, gusti, preferenze quotidiane, intrattenimento, lifestyle, stagioni, cibo, carattere, tempo libero, gaming, sesso, politica, musica, religione, cronaca. " +
              "Restituisci solo JSON valido con {question, answers}.",
          },
        ]
        : [
          {
            role: "system",
            content:
              "Genera sondaggi generali per utenti italiani. " +
              "Scrivi solo in italiano naturale. " +
              "Le domande devono sembrare sondaggi generali, leggeri e coinvolgenti, non interni a un server o community. " +
              "Evita trivia, domande da enciclopedia. " +
              "Le risposte devono essere coerenti tra loro, tutte plausibili, corte e senza duplicati. " +
              "Non usare risposte meta come 'dipende', 'altro', 'non so' salvo se davvero sensate. " +
              "Non usare mai riferimenti a Discord, community, server, staff, eventi del server o chat di gruppo. " +
              "Non usare mai il formato 'Qual è la tua opinione su ...'.",
          },
          {
            role: "user",
            content:
              `Genera un poll con ${optionCount} risposte.` +
              " Target: pubblico italiano generalista." +
              " La domanda deve essere breve, chiara, coinvolgente e adatta a ricevere risposte reali da chiunque." +
              "I temi giusti sono abitudini, gusti, preferenze quotidiane, intrattenimento, lifestyle, stagioni, cibo, carattere, tempo libero, gaming, sesso, politica, musica, religione, cronaca. " +
              " Restituisci solo JSON valido con {question, answers}.",
          },
        ],
      max_tokens: 220,
      temperature: 0.7,
      reasoning: {
        effort: "none",
        exclude: true,
      },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "discord_poll",
          strict: true,
          schema: {
            type: "object",
            properties: {
              question: { type: "string" },
              answers: {
                type: "array",
                minItems: optionCount,
                maxItems: 6,
                items: { type: "string" },
              },
            },
            required: ["question", "answers"],
            additionalProperties: false,
          },
        },
      },
    };

    try {
      const response = await axios.post(OPENROUTER_API_URL, payload, {
        timeout: 20000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://viniliecaffe.local",
          "X-Title": "Vinili e Caffe Bot",
        },
      });

      const choice = response?.data?.choices?.[0] || null;
      const finishReason = String(choice?.finish_reason || "");
      const content =
        choice?.message?.content ||
        extractStructuredText(response?.data);
      if (!String(content || "").trim()) {
        lastError = new Error(`Empty OpenRouter content for model ${model} (${finishReason || "no_finish_reason"})`);
        continue;
      }

      const parsed = JSON.parse(unwrapJsonTextBlock(content) || "{}");
      const validated = validateGeneratedPollPayload(parsed, cfg, forcedTargetOptions);
      if (validated) return validated;

      lastError = new Error(`Invalid OpenRouter payload for model ${model}`);
    } catch (error) {
      const status = Number(error?.response?.status || 0);
      if ([404, 429, 500, 502, 503, 504].includes(status)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    global.logger?.warn?.("[poll.auto] all OpenRouter model attempts failed:", lastError?.message || lastError);
  }
  return null;
}

async function fetchPollFromOpenRouterWithRetry(cfg = {}, forcedTargetOptions = null) {
  const maxRounds = Math.max(
    1,
    Math.min(10, Math.floor(Number(cfg.openrouterRetryRounds || OPENROUTER_MAX_ROUNDS))),
  );
  const retryDelayMs = Math.max(
    0,
    Math.min(10000, Math.floor(Number(cfg.openrouterRetryDelayMs || OPENROUTER_RETRY_DELAY_MS))),
  );

  for (let round = 0; round < maxRounds; round += 1) {
    const payload = await fetchPollFromOpenRouter(cfg, forcedTargetOptions).catch((error) => {
      global.logger?.warn?.("[poll.auto] OpenRouter round failed:", error?.message || error);
      return null;
    });
    if (payload?.question && Array.isArray(payload?.answers) && payload.answers.length >= 4) {
      return payload;
    }
    if (round < maxRounds - 1 && retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  global.logger?.warn?.("[poll.auto] OpenRouter retries exhausted, falling back to local.");
  return null;
}

async function pickPollCandidate(cfg = {}, forcedTargetOptions = null) {
  const configuredSources = Array.isArray(cfg.sources) && cfg.sources.length
    ? cfg.sources.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean)
    : DEFAULT_SOURCES;
  const sources = configuredSources.length ? configuredSources : DEFAULT_SOURCES;

  for (let i = 0; i < 8; i += 1) {
    const source = pickRandom(sources);
    let candidate = null;

    if (source === "openrouter") {
      candidate = await fetchPollFromOpenRouterWithRetry(cfg, forcedTargetOptions).catch((error) => {
        global.logger?.warn?.("[poll.auto] openrouter generation failed:", error?.message || error);
        return null;
      });
    }

    if (!candidate && source === "local") {
      candidate = buildLocalThemePoll(cfg, forcedTargetOptions);
    }

    if (candidate?.question && Array.isArray(candidate?.answers)) return candidate;
  }

  return buildLocalThemePoll(cfg, forcedTargetOptions);
}

async function runAutoPoll(client) {
  const guild =
    client.guilds.cache.get(IDs.guilds.main) ||
    (await client.guilds.fetch(IDs.guilds.main).catch(() => null));
  if (!guild) return;

  if (await hasManualPollToday(guild.id)) return;
  if (await hasAutoPollToday(guild.id)) return;

  const cfg = client?.config?.autoPoll || {};
  if (cfg.enabled === false) return;
  if (!isWithinAutoPollWindow(new Date(), cfg)) return;

  const optionTarget = pickNextOptionTarget(client, cfg);
  let payload = null;

  for (let i = 0; i < 8; i += 1) {
    const candidate = await pickPollCandidate(cfg, optionTarget);
    if (!candidate?.question || !Array.isArray(candidate.answers) || candidate.answers.length < 4) {
      continue;
    }
    if (await isDuplicateQuestion(guild.id, candidate.question)) continue;
    if (await isDuplicatePollContent(guild.id, candidate)) continue;
    payload = candidate;
    break;
  }

  if (!payload) return;

  const result = await createPollForGuild(guild, {
    question: payload.question,
    answers: payload.answers,
    source: "auto",
  });

  void result;
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
