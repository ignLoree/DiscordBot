const axios = require("axios");
const { createCanvas } = require("canvas");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, AttachmentBuilder, } = require("discord.js");
const { MinigameUser, MinigameState, MinigameRotation, } = require("../../Schemas/Minigames/minigameSchema");
const { addExpWithLevel, shouldIgnoreExpForMember } = require("../Community/expService");
const IDs = require("../../Utils/Config/ids");

const activeGames = new Map();
const pendingGames = new Map();
const loopState = new WeakSet();
let rotationDate = null;
let rotationQueue = [];
const recentMessages = new Map();
const standbyChannels = new Set();
const lastSentAtByChannel = new Map();
const startingChannels = new Set();
const recentQuestionKeysByChannel = new Map();

const REWARD_CHANNEL_ID = IDs.channels.commands;
const MINIGAME_WIN_EMOJI = "<a:VC_Verified:1448687631109197978>";
const MINIGAME_CORRECT_FALLBACK_EMOJI = "✅";
const MINIGAMES_ITALIAN_ONLY = true;
const EXP_REWARDS = [
  { exp: 100, roleId: IDs.roles.Initiate },
  { exp: 500, roleId: IDs.roles.Rookie },
  { exp: 1000, roleId: IDs.roles.Scout },
  { exp: 1500, roleId: IDs.roles.Explorer },
  { exp: 2500, roleId: IDs.roles.Tracker },
  { exp: 5000, roleId: IDs.roles.Achiever },
  { exp: 10000, roleId: IDs.roles.Vanguard },
  { exp: 50000, roleId: IDs.roles.Mentor },
  { exp: 100000, roleId: IDs.roles.Strategist },
];

let cachedWords = null;
let cachedWordsAt = 0;
const WORD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedCountries = null;
let cachedCountriesAt = 0;
const COUNTRY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedPlayers = null;
let cachedPlayersAt = 0;
const PLAYER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cachedSongs = null;
let cachedSongsAt = 0;
const SONG_CACHE_TTL_MS = 15 * 60 * 1000;
let cachedCapitalQuestions = null;
let cachedCapitalQuestionsAt = 0;
const CAPITAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedRegionCapitalQuestions = null;
let cachedRegionCapitalQuestionsAt = 0;
const REGION_CAPITAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const regionImageCache = new Map();
let cachedTeams = null;
let cachedTeamsAt = 0;
const TEAM_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cachedSingers = null;
let cachedSingersAt = 0;
const SINGER_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const singerImageFallbackCache = new Map();
const SINGER_IMAGE_FALLBACK_TTL_MS = 24 * 60 * 60 * 1000;
let cachedAlbums = null;
let cachedAlbumsAt = 0;
const ALBUM_CACHE_TTL_MS = 3 * 60 * 60 * 1000;

const CAPITAL_QUIZ_BANK = [
  { country: "Italia", answers: ["Roma"] },
  { country: "Francia", answers: ["Parigi", "Paris"] },
  { country: "Spagna", answers: ["Madrid"] },
  { country: "Germania", answers: ["Berlino", "Berlin"] },
  { country: "Regno Unito", answers: ["Londra", "London"] },
  { country: "Portogallo", answers: ["Lisbona", "Lisbon"] },
  { country: "Paesi Bassi", answers: ["Amsterdam"] },
  { country: "Belgio", answers: ["Bruxelles", "Brussels"] },
  { country: "Austria", answers: ["Vienna", "Wien"] },
  { country: "Grecia", answers: ["Atene", "Athens"] },
  { country: "Polonia", answers: ["Varsavia", "Warsaw"] },
  { country: "Irlanda", answers: ["Dublino", "Dublin"] },
  { country: "Svezia", answers: ["Stoccolma", "Stockholm"] },
  { country: "Norvegia", answers: ["Oslo"] },
  { country: "Danimarca", answers: ["Copenaghen", "Copenhagen"] },
  { country: "Svizzera", answers: ["Berna", "Bern"] },
  { country: "Stati Uniti", answers: ["Washington", "Washington DC"] },
  { country: "Canada", answers: ["Ottawa"] },
  { country: "Giappone", answers: ["Tokyo"] },
  { country: "Brasile", answers: ["Brasilia", "Brasìlia"] },
];

const ITALIAN_REGION_CAPITAL_BANK = [
  { region: "Abruzzo", answers: ["L Aquila", "L'Aquila"] },
  { region: "Basilicata", answers: ["Potenza"] },
  { region: "Calabria", answers: ["Catanzaro"] },
  { region: "Campania", answers: ["Napoli"] },
  { region: "Emilia Romagna", answers: ["Bologna"] },
  { region: "Friuli Venezia Giulia", answers: ["Trieste"] },
  { region: "Lazio", answers: ["Roma"] },
  { region: "Liguria", answers: ["Genova"] },
  { region: "Lombardia", answers: ["Milano"] },
  { region: "Marche", answers: ["Ancona"] },
  { region: "Molise", answers: ["Campobasso"] },
  { region: "Piemonte", answers: ["Torino"] },
  { region: "Puglia", answers: ["Bari"] },
  { region: "Sardegna", answers: ["Cagliari"] },
  { region: "Sicilia", answers: ["Palermo"] },
  { region: "Toscana", answers: ["Firenze"] },
  { region: "Trentino Alto Adige", answers: ["Trento"] },
  { region: "Umbria", answers: ["Perugia"] },
  { region: "Valle d'Aosta", answers: ["Aosta"] },
  { region: "Veneto", answers: ["Venezia"] },
];

const FOOTBALL_TEAM_BANK = [
  {
    team: "Real Madrid",
    answers: ["Real Madrid"],
    image: "https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg",
  },
  {
    team: "Barcelona",
    answers: ["Barcellona", "Barcelona"],
    image:
      "https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg",
  },
  {
    team: "Juventus",
    answers: ["Juventus", "Juve"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/1/15/Juventus_FC_2017_logo.svg",
  },
  {
    team: "Milan",
    answers: ["Milan", "AC Milan"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/d/d0/Logo_of_AC_Milan.svg",
  },
  {
    team: "Inter",
    answers: ["Inter", "Internazionale"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/0/05/FC_Internazionale_Milano_2021.svg",
  },
  {
    team: "Manchester City",
    answers: ["Manchester City", "Man City"],
    image:
      "https://upload.wikimedia.org/wikipedia/en/e/eb/Manchester_City_FC_badge.svg",
  },
  {
    team: "Manchester United",
    answers: ["Manchester United", "Man United"],
    image:
      "https://upload.wikimedia.org/wikipedia/en/7/7a/Manchester_United_FC_crest.svg",
  },
  {
    team: "Liverpool",
    answers: ["Liverpool"],
    image: "https://upload.wikimedia.org/wikipedia/en/0/0c/Liverpool_FC.svg",
  },
  {
    team: "Bayern Monaco",
    answers: ["Bayern Monaco", "Bayern Munich", "Bayern"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/1/1f/FC_Bayern_M%C3%BCnchen_logo_%282024%29.svg",
  },
  {
    team: "Paris Saint Germain",
    answers: ["Paris Saint Germain", "PSG", "Paris SG"],
    image:
      "https://upload.wikimedia.org/wikipedia/en/a/a7/Paris_Saint-Germain_F.C..svg",
  },
];

const SINGER_BANK = [
  {
    name: "Ultimo",
    answers: ["Ultimo"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/7/7a/Ultimo_2019.jpg",
  },
  {
    name: "Marracash",
    answers: ["Marracash"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/2/2d/Marracash_2022.jpg",
  },
  {
    name: "Blanco",
    answers: ["Blanco"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/5/5d/Blanco_2022.jpg",
  },
  {
    name: "Sfera Ebbasta",
    answers: ["Sfera Ebbasta", "Sfera"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/7/78/Sfera_Ebbasta.jpg",
  },
  {
    name: "The Weeknd",
    answers: ["The Weeknd", "Weeknd"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/9/95/The_Weeknd_Cannes_2023.png",
  },
  {
    name: "Taylor Swift",
    answers: ["Taylor Swift", "Taylor"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/f/f6/Taylor_Swift_The_Eras_Tour_at_Sofi_Stadium_%28August_2023%29_109.jpg",
  },
  {
    name: "Ed Sheeran",
    answers: ["Ed Sheeran", "Sheeran"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/4/45/Ed_Sheeran-6886_%28cropped%29.jpg",
  },
  {
    name: "Dua Lipa",
    answers: ["Dua Lipa"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/0/0d/Dua_Lipa_2022.jpg",
  },
  {
    name: "Ariana Grande",
    answers: ["Ariana Grande", "Ariana"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/a/a7/Ariana_Grande_2016.jpg",
  },
  {
    name: "Billie Eilish",
    answers: ["Billie Eilish", "Billie"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/5/58/Billie_Eilish_2019_by_Glenn_Francis.jpg",
  },
];

const ALBUM_BANK = [
  {
    album: "Abbey Road",
    artist: "The Beatles",
    answers: ["Abbey Road"],
    image:
      "https://upload.wikimedia.org/wikipedia/en/4/42/Beatles_-_Abbey_Road.jpg",
  },
  {
    album: "Thriller",
    artist: "Michael Jackson",
    answers: ["Thriller"],
    image:
      "https://upload.wikimedia.org/wikipedia/en/5/55/Michael_Jackson_-_Thriller.png",
  },
  {
    album: "Back in Black",
    artist: "AC/DC",
    answers: ["Back in Black"],
    image:
      "https://upload.wikimedia.org/wikipedia/commons/9/92/ACDC_Back_in_Black.png",
  },
  {
    album: "The Dark Side of the Moon",
    artist: "Pink Floyd",
    answers: ["The Dark Side of the Moon", "Dark Side of the Moon"],
    image:
      "https://upload.wikimedia.org/wikipedia/en/3/3b/Dark_Side_of_the_Moon.png",
  },
  {
    album: "Random Access Memories",
    artist: "Daft Punk",
    answers: ["Random Access Memories"],
    image:
      "https://upload.wikimedia.org/wikipedia/en/a/a7/Random_Access_Memories.jpg",
  },
  {
    album: "Fuori dall hype",
    artist: "Pinguini Tattici Nucleari",
    answers: ["Fuori dall hype", "Fuori dall'hype"],
    image:
      "https://upload.wikimedia.org/wikipedia/en/4/4a/Fuori_dall%27hype.jpg",
  },
  {
    album: "Persona",
    artist: "Marracash",
    answers: ["Persona"],
    image:
      "https://upload.wikimedia.org/wikipedia/en/0/02/Marracash_-_Persona.png",
  },
  {
    album: "Evolve",
    artist: "Imagine Dragons",
    answers: ["Evolve"],
    image:
      "https://upload.wikimedia.org/wikipedia/en/b/b5/ImagineDragonsEvolve.jpg",
  },
];

const ITALIAN_GK_BANK = [
  { question: "Qual è il fiume più lungo d Italia?", answers: ["Po"] },
  {
    question: "In che anno è stata proclamata l unità d Italia?",
    answers: ["1861"],
  },
  {
    question: "Qual è la regione italiana con più abitanti?",
    answers: ["Lombardia"],
  },
  { question: "Qual è il capoluogo della Puglia?", answers: ["Bari"] },
  {
    question: "Chi ha scritto la Divina Commedia?",
    answers: ["Dante Alighieri", "Dante"],
  },
  {
    question: "Qual è la montagna più alta d Italia?",
    answers: ["Monte Bianco", "Mont Blanc"],
  },
  {
    question: "Qual è il mare a est dell Italia?",
    answers: ["Adriatico", "Mar Adriatico"],
  },
  {
    question:
      "Qual è il simbolo della Repubblica Italiana in cucina più famoso nel mondo?",
    answers: ["Pizza"],
  },
];

const DRIVING_TRUE_FALSE_BANK = [
  {
    statement:
      "In autostrada, salvo diversa segnalazione, il limite per le auto è 130 km/h.",
    answer: true,
  },
  {
    statement: "Con semaforo rosso puoi passare se non arriva nessuno.",
    answer: false,
  },
  {
    statement: "È obbligatorio usare le cinture anche nei sedili posteriori.",
    answer: true,
  },
  {
    statement:
      "Si può usare il telefono alla guida senza vivavoce se la chiamata è breve.",
    answer: false,
  },
  {
    statement: "La distanza di sicurezza serve a evitare tamponamenti.",
    answer: true,
  },
  {
    statement:
      "Il triangolo va posizionato a circa 50 metri fuori dai centri abitati.",
    answer: true,
  },
  {
    statement:
      "È consentito sorpassare in prossimità delle curve sempre e comunque.",
    answer: false,
  },
  {
    statement: "Con pioggia intensa bisogna ridurre la velocità.",
    answer: true,
  },
];

const FAST_TYPING_PHRASES = [
  "la costanza batte il talento",
  "non mollare proprio adesso",
  "la musica unisce le persone",
  "oggi vinco io",
];

const HANGMAN_WORDS = [
  "computer",
  "tastiera",
  "discord",
  "capitale",
  "bandiera",
  "calciatore",
  "canzone",
  "album",
  "regione",
  "patente",
];

const ITALIAN_GK_DEFAULT_CATEGORIES = [
  "cultura-generale",
  "storia",
  "geografia",
  "scienza",
  "arte",
  "musica",
  "sport",
  "letteratura",
  "cinema",
  "tecnologia",
];

function getConfig(client) {
  const cfg = client?.config?.minigames || null;
  if (!cfg) return null;
  return {
    ...cfg,
    channelId: IDs.channels.chat,
    roleId: IDs.roles.Minigames,
    findBot: {
      ...(cfg.findBot || {}),
      requiredRoleId: IDs.roles.Member,
    },
  };
}

function getChannelSafe(client, channelId) {
  if (!channelId) return null;
  return client.channels.cache.get(channelId) || null;
}

function getActivityWindowMs(cfg) {
  return Math.max(60 * 1000, Number(cfg?.activityWindowMs || 30 * 60 * 1000));
}

function getMinMessages(cfg) {
  return Math.max(1, Number(cfg?.minMessages || 3));
}

function getFailsafeMs(cfg) {
  return Math.max(60 * 1000, Number(cfg?.failsafeMs || 90 * 60 * 1000));
}

function recordActivity(channelId, windowMs) {
  if (!channelId) return;
  const safeWindowMs = Math.max(60 * 1000, Number(windowMs || 30 * 60 * 1000));
  const now = Date.now();
  const list = recentMessages.get(channelId) || [];
  list.push(now);
  const cutoff = now - safeWindowMs;
  const trimmed = list.filter((ts) => ts >= cutoff);
  recentMessages.set(channelId, trimmed);
}

function getRecentCount(channelId, windowMs) {
  if (!channelId) return 0;
  const safeWindowMs = Math.max(60 * 1000, Number(windowMs || 30 * 60 * 1000));
  const now = Date.now();
  const list = recentMessages.get(channelId) || [];
  const cutoff = now - safeWindowMs;
  const trimmed = list.filter((ts) => ts >= cutoff);
  recentMessages.set(channelId, trimmed);
  return trimmed.length;
}

function isReadyByActivity(cfg) {
  const channelId = cfg?.channelId;
  const count = getRecentCount(channelId, getActivityWindowMs(cfg));
  return count >= getMinMessages(cfg);
}

function canStartByInterval(cfg) {
  const intervalMs = Number(cfg?.intervalMs || 15 * 60 * 1000);
  const channelId = cfg?.channelId;
  const lastSent = lastSentAtByChannel.get(channelId) || 0;
  return Date.now() - lastSent >= intervalMs;
}

function markSent(channelId) {
  if (!channelId) return;
  lastSentAtByChannel.set(channelId, Date.now());
  standbyChannels.delete(channelId);
}

function isFailsafeDue(cfg) {
  const channelId = cfg?.channelId;
  if (!channelId) return false;
  const lastSent = lastSentAtByChannel.get(channelId) || 0;
  if (!lastSent) return false;
  return Date.now() - lastSent >= getFailsafeMs(cfg);
}

async function saveActiveGame(client, cfg, payload) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  let guildId = cfg?.guildId || null;
  if (!guildId) {
    const channel =
      getChannelSafe(client, channelId) ||
      (await client.channels.fetch(channelId).catch(() => null));
    guildId = channel?.guild?.id || null;
  }
  if (!guildId) return;
  await MinigameState.findOneAndUpdate(
    { guildId, channelId },
    { $set: { guildId, channelId, ...payload } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => {});
}

async function clearActiveGame(client, cfg) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  let guildId = cfg?.guildId || null;
  if (!guildId) {
    const channel =
      getChannelSafe(client, channelId) ||
      (await client.channels.fetch(channelId).catch(() => null));
    guildId = channel?.guild?.id || null;
  }
  if (!guildId) return;
  await MinigameState.deleteOne({ guildId, channelId }).catch(() => {});
}

function randomBetween(min, max) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function shuffleString(value) {
  const arr = String(value || "").split("");
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

function normalizeWord(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

function normalizeCountryName(raw) {
  const specials = {
    "\u00df": "ss",
    "\u1e9e": "ss",
    "\u00e6": "ae",
    "\u00c6": "ae",
    "\u0153": "oe",
    "\u0152": "oe",
    "\u00f8": "o",
    "\u00d8": "o",
    "\u00e5": "a",
    "\u00c5": "a",
    "\u0142": "l",
    "\u0141": "l",
    "\u0111": "d",
    "\u0110": "d",
    "\u00f0": "d",
    "\u00d0": "d",
    "\u00fe": "th",
    "\u00de": "th",
  };
  const replaced = String(raw || "").replace(
    /[\u00df\u1e9e\u00e6\u00c6\u0153\u0152\u00f8\u00d8\u00e5\u00c5\u0142\u0141\u0111\u0110\u00f0\u00d0\u00fe\u00de]/g,
    (ch) => specials[ch] || ch,
  );
  return replaced
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUserAnswerText(raw) {
  return String(raw || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[`´‘’‚‛′]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—−]/g, "-")
    .trim();
}

function isValidWord(word) {
  if (!word) return false;
  if (word.length < 5 || word.length > 6) return false;
  return /^\p{L}+$/u.test(word);
}

async function loadWordList(cfg) {
  const now = Date.now();
  if (cachedWords && now - cachedWordsAt < WORD_CACHE_TTL_MS)
    return cachedWords;

  const apiUrl = cfg?.guessWord?.apiUrl;
  let list = [];
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      if (Array.isArray(res?.data)) {
        list = res.data;
      } else if (Array.isArray(res?.data?.words)) {
        list = res.data.words;
      }
    } catch {}
  }

  const filtered = list.map(normalizeWord).filter(isValidWord);

  cachedWords = filtered;
  cachedWordsAt = now;
  return cachedWords;
}

function collectCountryNames(country) {
  const names = new Set();
  const add = (value) => {
    const normalized = normalizeCountryName(value);
    if (normalized) names.add(normalized);
    const compact = buildCompactAlias(value);
    if (compact) names.add(compact);
  };
  add(country?.translations?.ita?.common);
  add(country?.translations?.ita?.official);
  add(country?.name?.common);
  add(country?.name?.official);
  const nativeNames = country?.name?.nativeName || {};
  for (const key of Object.keys(nativeNames)) {
    add(nativeNames[key]?.common);
    add(nativeNames[key]?.official);
  }
  const translations = country?.translations || {};
  for (const key of Object.keys(translations)) {
    add(translations[key]?.common);
    add(translations[key]?.official);
  }
  const altSpellings = Array.isArray(country?.altSpellings)
    ? country.altSpellings
    : [];
  for (const alt of altSpellings) add(alt);
  return Array.from(names.values());
}

async function loadCountryList(cfg) {
  const now = Date.now();
  if (cachedCountries && now - cachedCountriesAt < COUNTRY_CACHE_TTL_MS)
    return cachedCountries;

  const apiUrl = cfg?.guessFlag?.apiUrl;
  let list = [];
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      if (Array.isArray(res?.data)) {
        list = res.data;
      }
    } catch {}
  }

  const mapped = list
    .map((country) => {
      const names = collectCountryNames(country);
      const flagUrl =
        country?.flags?.png || country?.flags?.svg || country?.flags?.[0];
      const displayName =
        country?.translations?.ita?.common ||
        country?.name?.common ||
        country?.name?.official ||
        null;
      if (!names.length || !flagUrl || !displayName) return null;
      return { names, flagUrl, displayName };
    })
    .filter(Boolean);

  cachedCountries = mapped;
  cachedCountriesAt = now;
  return cachedCountries;
}

function pickRandomItem(list = []) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[randomBetween(0, list.length - 1)] || null;
}

function pickQuestionAvoidRecent(channelId, type, list = [], keySelector, recentLimit = 20) {
  if (!channelId || !type || !Array.isArray(list) || !list.length) {
    return pickRandomItem(list);
  }
  const key = `${channelId}:${type}`;
  const recent = recentQuestionKeysByChannel.get(key) || [];
  const seen = new Set(recent);
  const pool = list.filter((item) => {
    const k = String(keySelector?.(item) || "").trim().toLowerCase();
    if (!k) return true;
    return !seen.has(k);
  });
  const picked = pickRandomItem(pool.length ? pool : list);
  if (!picked) return null;
  const pickedKey = String(keySelector?.(picked) || "").trim().toLowerCase();
  if (pickedKey) {
    const next = recent.filter((x) => x !== pickedKey);
    next.push(pickedKey);
    while (next.length > Math.max(5, Number(recentLimit || 20))) next.shift();
    recentQuestionKeysByChannel.set(key, next);
  }
  return picked;
}

function parseStateTarget(rawTarget, fallback = {}) {
  try {
    const parsed = JSON.parse(rawTarget || "{}");
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}
  return fallback;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function decodeQuizText(value) {
  return decodeHtmlEntities(safeDecodeURIComponent(value));
}

function isLikelyItalianText(value) {
  const normalized = normalizeCountryName(value);
  if (!normalized) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;

  const italianHints = new Set([
    "il",
    "lo",
    "la",
    "i",
    "gli",
    "le",
    "un",
    "una",
    "di",
    "del",
    "della",
    "che",
    "con",
    "per",
    "quale",
    "quando",
    "dove",
    "come",
    "chi",
    "quanti",
    "cosa",
  ]);
  const englishHints = new Set([
    "the",
    "what",
    "which",
    "when",
    "where",
    "who",
    "how",
    "is",
    "are",
    "was",
    "were",
    "of",
    "in",
    "on",
  ]);

  let itScore = 0;
  let enScore = 0;
  for (const token of tokens) {
    if (italianHints.has(token)) itScore += 1;
    if (englishHints.has(token)) enScore += 1;
  }

  return itScore >= enScore;
}

function buildItalianGkApiUrls(cfg) {
  const rawUrls = Array.isArray(cfg?.italianGK?.apiUrls)
    ? cfg.italianGK.apiUrls
    : cfg?.italianGK?.apiUrl
      ? [cfg.italianGK.apiUrl]
      : [];

  const categories =
    Array.isArray(cfg?.italianGK?.categories) && cfg.italianGK.categories.length
      ? cfg.italianGK.categories
      : ITALIAN_GK_DEFAULT_CATEGORIES;

  const out = [];
  for (const raw of rawUrls) {
    const base = String(raw || "").trim();
    if (!base) continue;

    if (base.includes("{category}")) {
      const shuffled = categories.slice();
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      for (const category of shuffled) {
        out.push(
          base
            .replace(/\{category\}/g, encodeURIComponent(category))
            .replace(/\{lang\}/g, "it"),
        );
      }
      continue;
    }

    out.push(base.replace(/\{lang\}/g, "it"));
  }

  return out;
}

function parseItalianGkQuestionFromPayload(payload) {
  const direct = payload && typeof payload === "object" ? payload : null;
  if (direct?.question && (direct?.answer || direct?.correct_answer)) {
    return {
      question: decodeQuizText(direct.question),
      answers: buildAliases([
        decodeQuizText(direct.answer || direct.correct_answer),
      ]),
    };
  }

  const list = Array.isArray(direct?.data)
    ? direct.data
    : Array.isArray(direct?.results)
      ? direct.results
      : Array.isArray(payload)
        ? payload
        : [];
  if (!list.length) return null;

  const pick = pickRandomItem(list);
  if (!pick) return null;
  const question =
    pick.question || pick.domanda || pick.q || pick.text || null;
  const answer =
    pick.answer || pick.correct_answer || pick.risposta || pick.a || null;
  if (!question || !answer) return null;

  return {
    question: decodeQuizText(question),
    answers: buildAliases([decodeQuizText(answer)]),
  };
}

async function fetchWikiRegionImage(regionName) {
  const normalized = String(regionName || "").trim();
  if (!normalized) return null;
  if (regionImageCache.has(normalized)) return regionImageCache.get(normalized);

  const titles = [
    normalized,
    `${normalized} (regione italiana)`,
    `Regione ${normalized}`,
  ];

  for (const title of titles) {
    const url = `https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    try {
      const res = await axios.get(url, { timeout: 12000 });
      const image =
        res?.data?.thumbnail?.source ||
        res?.data?.originalimage?.source ||
        null;
      if (image) {
        regionImageCache.set(normalized, image);
        return image;
      }
    } catch {}
  }

  regionImageCache.set(normalized, null);
  return null;
}

async function loadCapitalQuestionBank(cfg) {
  const now = Date.now();
  if (
    cachedCapitalQuestions &&
    now - cachedCapitalQuestionsAt < CAPITAL_CACHE_TTL_MS
  ) {
    return cachedCapitalQuestions;
  }

  const apiUrl =
    cfg?.guessCapital?.apiUrl ||
    "https://restcountries.com/v3.1/all?fields=name,translations,capital,flags";
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data) ? res.data : [];
    for (const country of list) {
      const countryDisplay =
        country?.translations?.ita?.common || country?.name?.common || null;
      const capitals = Array.isArray(country?.capital) ? country.capital : [];
      const image = country?.flags?.png || country?.flags?.svg || null;
      if (!countryDisplay || !capitals.length) continue;
      const aliases = buildAliases(capitals);
      if (!aliases.length) continue;
      out.push({ country: String(countryDisplay), answers: aliases, image });
    }
  } catch {}

  cachedCapitalQuestions = out;
  cachedCapitalQuestionsAt = now;
  return cachedCapitalQuestions;
}

async function loadRegionCapitalQuestionBank(cfg) {
  const now = Date.now();
  if (
    cachedRegionCapitalQuestions &&
    now - cachedRegionCapitalQuestionsAt < REGION_CAPITAL_CACHE_TTL_MS
  ) {
    return cachedRegionCapitalQuestions;
  }

  const apiUrl = cfg?.guessRegionCapital?.apiUrl || null;
  const out = [];
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      const list = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.data?.data)
          ? res.data.data
          : [];
      for (const row of list) {
        const region = row?.region || row?.regione || row?.name || null;
        const capital = row?.capital || row?.capoluogo || null;
        if (!region || !capital) continue;
        const answers = buildAliases(
          Array.isArray(capital) ? capital : [capital],
        );
        if (!answers.length) continue;
        out.push({ region: String(region), answers });
      }
    } catch {}
  }

  if (!out.length) {
    for (const row of ITALIAN_REGION_CAPITAL_BANK) {
      const region = row?.region || null;
      const answers = buildAliases(row?.answers || []);
      if (!region || !answers.length) continue;
      out.push({ region: String(region), answers });
    }
  }

  cachedRegionCapitalQuestions = out;
  cachedRegionCapitalQuestionsAt = now;
  return cachedRegionCapitalQuestions;
}

async function loadFootballTeamsFromApi(cfg) {
  const now = Date.now();
  if (cachedTeams && now - cachedTeamsAt < TEAM_CACHE_TTL_MS)
    return cachedTeams;

  const apiBase =
    cfg?.guessTeam?.apiUrl ||
    "https://www.thesportsdb.com/api/v1/json/123/search_all_teams.php?l=";
  const leagues =
    Array.isArray(cfg?.guessTeam?.leagues) && cfg.guessTeam.leagues.length
      ? cfg.guessTeam.leagues
      : ["Italian Serie A",
        "English Premier League",
        "Spanish La Liga",
        "German Bundesliga",
        "French Ligue 1",
        "Dutch Eredivisie",
        "Belgian Pro League",
        "Portuguese Primeira Liga",
        "Saudi Pro League",
        "Italian Serie B",
        "English League Championship",
        "American Major League Soccer"];
  const out = [];
  for (const league of leagues) {
    try {
      const url = `${apiBase}${encodeURIComponent(league)}`;
      const res = await axios.get(url, { timeout: 15000 });
      const teams = Array.isArray(res?.data?.teams) ? res.data.teams : [];
      for (const team of teams) {
        const name = team?.strTeam;
        const badge = team?.strBadge || null;
        if (!name || !badge) continue;
        const aliases = buildAliases(
          [name, team?.strTeamShort, team?.strTeamAlternate].filter(Boolean),
        );
        if (!aliases.length) continue;
        out.push({ team: name, answers: aliases, image: badge });
      }
    } catch {}
  }

  cachedTeams = out;
  cachedTeamsAt = now;
  return cachedTeams;
}

async function loadSingersFromApi(cfg) {
  const now = Date.now();
  if (cachedSingers && now - cachedSingersAt < SINGER_CACHE_TTL_MS)
    return cachedSingers;

  const apiUrl =
    cfg?.guessSinger?.apiUrl ||
    "https://api.deezer.com/chart/0/artists?limit=100";
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data?.data) ? res.data.data : [];
    for (const artist of list) {
      const name = artist?.name;
      const image = pickBestSingerImage(artist);
      if (!name) continue;
      out.push({ name, answers: buildAliases([name]), image });
    }
  } catch {}

  cachedSingers = out;
  cachedSingersAt = now;
  return cachedSingers;
}

function isDeezerArtistPlaceholderImage(url) {
  const value = String(url || "").trim();
  if (!value) return true;
  if (!/^https?:\/\//i.test(value)) return true;
  if (/api\.deezer\.com\/artist\/\d+\/image/i.test(value)) return true;
  if (/\/images\/artist\/\/+/i.test(value)) return true;
  if (/\/images\/artist\/[^/]+\/\d+x\d+-000000-80-0-0\.(jpg|png|webp)$/i.test(value))
    return true;
  return false;
}

function pickBestSingerImage(artist) {
  const candidates = [
    artist?.picture_xl,
    artist?.picture_big,
    artist?.picture_medium,
    artist?.picture_small,
    artist?.picture,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!isDeezerArtistPlaceholderImage(candidate)) return candidate;
  }
  return null;
}

async function fetchSingerImageFallback(name, cfg) {
  const artistName = String(name || "").trim();
  if (!artistName) return null;

  const cacheKey = normalizeCountryName(artistName);
  const cached = singerImageFallbackCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SINGER_IMAGE_FALLBACK_TTL_MS) {
    return cached.url || null;
  }

  const fallbackApi =
    cfg?.guessSinger?.fallbackApiUrl ||
    "https://www.theaudiodb.com/api/v1/json/2/search.php";
  try {
    const res = await axios.get(fallbackApi, {
      params: { s: artistName },
      timeout: 15000,
    });
    const artists = Array.isArray(res?.data?.artists) ? res.data.artists : [];
    const best = artists.find(
      (a) =>
        normalizeCountryName(a?.strArtist) === normalizeCountryName(artistName),
    );
    const picked = best || artists[0];
    const fallbackUrl =
      picked?.strArtistThumb ||
      picked?.strArtistFanart ||
      picked?.strArtistFanart2 ||
      picked?.strArtistFanart3 ||
      null;
    const url = isDeezerArtistPlaceholderImage(fallbackUrl) ? null : fallbackUrl;
    singerImageFallbackCache.set(cacheKey, { url, at: Date.now() });
    return url;
  } catch {
    singerImageFallbackCache.set(cacheKey, { url: null, at: Date.now() });
    return null;
  }
}

async function loadAlbumsFromApi(cfg) {
  const now = Date.now();
  if (cachedAlbums && now - cachedAlbumsAt < ALBUM_CACHE_TTL_MS)
    return cachedAlbums;

  const apiUrl =
    cfg?.guessAlbum?.apiUrl ||
    "https://api.deezer.com/chart/0/albums?limit=100";
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data?.data) ? res.data.data : [];
    for (const album of list) {
      const title = album?.title;
      const artist = album?.artist?.name || "Artista sconosciuto";
      const image =
        album?.cover_xl ||
        album?.cover_big ||
        album?.cover_medium ||
        album?.cover ||
        null;
      if (!title || !image) continue;
      out.push({ album: title, artist, answers: buildAliases([title]), image });
    }
  } catch {}

  cachedAlbums = out;
  cachedAlbumsAt = now;
  return cachedAlbums;
}

function normalizePlayerGuess(raw) {
  return normalizeCountryName(raw);
}

function normalizeSongGuess(raw) {
  return normalizeCountryName(raw);
}

const LOOSE_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "or",
  "di",
  "del",
  "della",
  "dello",
  "dei",
  "degli",
  "da",
  "de",
  "d",
  "l",
  "il",
  "lo",
  "la",
  "i",
  "gli",
  "le",
  "feat",
  "ft",
  "featuring",
  "with",
]);

function toMeaningfulTokens(raw, minTokenLength = 3) {
  return String(raw || "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= minTokenLength)
    .filter((t) => !LOOSE_STOPWORDS.has(t));
}

function buildCompactAlias(value) {
  const normalized = normalizeCountryName(value);
  if (!normalized) return null;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return null;
  const compact = tokens
    .filter((t) => t.length > 1)
    .join(" ")
    .trim();
  if (!compact || compact === normalized) return null;
  return compact;
}

function buildSongAnswerAliases(rawTitle) {
  const raw = String(rawTitle || "").trim();
  if (!raw) return [];

  const aliases = new Set();
  const add = (value) => {
    const normalized = normalizeSongGuess(value);
    if (normalized) aliases.add(normalized);
    const compact = buildCompactAlias(value);
    if (compact) aliases.add(compact);
  };

  add(raw);

  const withoutBrackets = raw
    .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  add(withoutBrackets);

  const withoutFeat = raw
    .replace(/\s+(feat\.?|ft\.?|featuring|with)\s+.+$/i, "")
    .trim();
  add(withoutFeat);
  add(
    withoutFeat
      .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

  const dashParts = raw
    .split(/\s[-–—]\s/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (dashParts.length >= 2) {
    const left = dashParts[0];
    const right = dashParts.slice(1).join(" ");
    if (
      /(remaster|version|edit|mix|live|acoustic|karaoke|instrumental|bonus|mono|stereo|radio|explicit|clean|sped|slowed|rework|demo|deluxe|anniversary|session|soundtrack|from)\b/i.test(
        right,
      )
    ) {
      add(left);
    }
  }

  for (const part of raw
    .split(/[\/|]/g)
    .map((p) => p.trim())
    .filter(Boolean)) {
    add(part);
  }

  return Array.from(aliases.values());
}

function isSongGuessCorrect(rawGuess, rawAnswers) {
  return isLooseAliasGuessCorrect(rawGuess, rawAnswers, normalizeSongGuess, {
    minGuessLength: 4,
    minTokenLength: 3,
    singleTokenMinLength: 6,
  });
}

function isSingerGuessCorrect(rawGuess, rawAnswers) {
  const guess = normalizeCountryName(rawGuess);
  if (!guess) return false;

  const answers = Array.isArray(rawAnswers)
    ? rawAnswers.map((a) => normalizeCountryName(a)).filter(Boolean)
    : [normalizeCountryName(rawAnswers)].filter(Boolean);
  if (!answers.length) return false;

  if (isStrictAliasGuessCorrect(guess, answers, (v) => String(v || "")))
    return true;

  const guessTokens = toMeaningfulTokens(guess, 3);
  if (guessTokens.length !== 1) return false;
  const token = guessTokens[0];
  if (token.length < 5) return false;

  for (const answer of answers) {
    const answerTokens = toMeaningfulTokens(answer, 3);
    if (answerTokens.length < 2) continue;
    const surname = answerTokens[answerTokens.length - 1];
    if (token === surname) return true;
  }

  return false;
}

function normalizeTruthValue(raw) {
  const v = normalizeCountryName(raw);
  if (!v) return null;
  if (["vero", "v"].includes(v)) return true;
  if (["falso", "f"].includes(v)) return false;
  return null;
}

function buildAliases(values = []) {
  const out = new Set();
  for (const value of values) {
    const normalized = normalizeCountryName(value);
    if (normalized) out.add(normalized);
    const compact = buildCompactAlias(value);
    if (compact) out.add(compact);
  }
  return Array.from(out.values());
}

function createMathQuestion() {
  const formatAnswer = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value);
    if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num));
    return String(Number(num.toFixed(2)));
  };

  const generators = [
    () => {
      const a = randomBetween(2, 60);
      const b = randomBetween(2, 60);
      const c = randomBetween(2, 40);
      return {
        expression: `${a} + ${b} + ${c}`,
        answer: formatAnswer(a + b + c),
      };
    },
    () => {
      let a = randomBetween(40, 120);
      const b = randomBetween(2, 50);
      const c = randomBetween(2, 30);
      if (a < b + c) a = b + c + randomBetween(5, 25);
      return {
        expression: `${a} - ${b} - ${c}`,
        answer: formatAnswer(a - b - c),
      };
    },
    () => {
      const a = randomBetween(2, 14);
      const b = randomBetween(2, 12);
      const c = randomBetween(2, 6);
      return {
        expression: `${a} × ${b} × ${c}`,
        answer: formatAnswer(a * b * c),
      };
    },
    () => {
      const divisor = randomBetween(2, 12);
      const result = randomBetween(2, 20);
      const dividend = divisor * result;
      return {
        expression: `${dividend} ÷ ${divisor}`,
        answer: formatAnswer(result),
      };
    },
    () => {
      const root = randomBetween(2, 20);
      const n = root * root;
      return {
        expression: `√${n}`,
        answer: formatAnswer(root),
      };
    },
    () => {
      const a = randomBetween(2, 18);
      const b = randomBetween(2, 12);
      const c = randomBetween(2, 20);
      const d = randomBetween(2, 14);
      const left = a * b;
      return {
        expression: `(${a} × ${b}) + ${c} - ${d}`,
        answer: formatAnswer(left + c - d),
      };
    },
    () => {
      const root = randomBetween(2, 12);
      const n = root * root;
      const a = randomBetween(2, 30);
      const b = randomBetween(2, 20);
      return {
        expression: `√${n} + ${a} - ${b}`,
        answer: formatAnswer(root + a - b),
      };
    },
  ];

  const pick = generators[randomBetween(0, generators.length - 1)];
  return pick();
}

function parseMathGuess(raw) {
  const base = normalizeUserAnswerText(raw)
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/×/g, "*")
    .replace(/÷/g, "/");
  if (!base) return null;
  if (/^-?\d+(\.\d+)?$/.test(base)) {
    const value = Number(base);
    return Number.isFinite(value) ? value : null;
  }
  if (!/^[0-9+\-*/().]+$/.test(base)) return null;
  try {
    const evaluated = Number(Function(`"use strict"; return (${base});`)());
    return Number.isFinite(evaluated) ? evaluated : null;
  } catch {
    return null;
  }
}

function wrapPromptText(ctx, text, maxWidth) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return [""];
  const words = source.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const chunkCandidate = `${chunk}${ch}`;
      if (ctx.measureText(chunkCandidate).width <= maxWidth) {
        chunk = chunkCandidate;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [source];
}

function buildPromptImageAttachment(title, lines = [], fileBaseName = "minigame") {
  try {
    const width = 1400;
    const height = 780;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#141a26");
    grad.addColorStop(1, "#3b2f25");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(111, 78, 55, 0.88)";
    ctx.fillRect(40, 40, width - 80, height - 80);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#f7f1e8";
    ctx.font = "bold 68px Sans";
    ctx.fillText(String(title || "Minigioco"), width / 2, 92);

    const usableWidth = width - 220;
    const sourceLines = Array.isArray(lines)
      ? lines.map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    const renderedLines = [];
    for (const line of sourceLines) {
      ctx.font = "bold 56px Sans";
      renderedLines.push(...wrapPromptText(ctx, line, usableWidth));
    }
    if (!renderedLines.length) renderedLines.push("...");

    ctx.font = "bold 56px Sans";
    const lineHeight = 76;
    const totalHeight = renderedLines.length * lineHeight;
    let y = Math.max(220, Math.round((height - totalHeight) / 2));
    for (const line of renderedLines) {
      ctx.fillText(line, width / 2, y, usableWidth);
      y += lineHeight;
    }

    const name = `${String(fileBaseName || "minigame")
      .replace(/[^a-z0-9_-]/gi, "_")
      .toLowerCase()}.png`;
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

function buildMathExpressionImageAttachment(expression) {
  try {
    const width = 1200;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#171717";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#6f4e37";
    ctx.fillRect(24, 24, width - 48, height - 48);

    ctx.fillStyle = "#f7f1e8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 120px Sans";
    ctx.fillText(String(expression || ""), width / 2, height / 2);

    const name = "math_expression.png";
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

function maskHangmanWord(word, guessed = new Set()) {
  return String(word || "")
    .split("")
    .map((ch) => (guessed.has(ch) ? ch : "_"))
    .join(" ");
}

function countHangmanLetters(word) {
  return String(word || "").replace(/\s+/g, "").length;
}

function levenshteinDistance(aRaw, bRaw) {
  const a = String(aRaw || "");
  const b = String(bRaw || "");
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function isNearTextGuess(rawGuess, rawAnswers, options = {}) {
  const guess = normalizeCountryName(rawGuess);
  if (!guess || guess.length < Number(options?.minGuessLength || 3))
    return false;
  const answers = Array.isArray(rawAnswers)
    ? rawAnswers.map((x) => normalizeCountryName(x)).filter(Boolean)
    : [normalizeCountryName(rawAnswers)].filter(Boolean);
  if (!answers.length) return false;

  const maxAbs = Number(options?.maxDistance || 2);
  const maxRatio = Number(options?.maxRatio || 0.28);
  for (const answer of answers) {
    if (!answer || guess === answer) continue;
    const dist = levenshteinDistance(guess, answer);
    const base = Math.max(guess.length, answer.length);
    if (dist <= maxAbs && dist / Math.max(1, base) <= maxRatio) return true;
  }
  return false;
}

function isStrictAliasGuessCorrect(
  rawGuess,
  rawAnswers,
  normalizer = normalizeCountryName,
) {
  const guess = normalizer(rawGuess);
  if (!guess) return false;

  const answers = Array.isArray(rawAnswers)
    ? rawAnswers.map((a) => normalizer(a)).filter(Boolean)
    : [normalizer(rawAnswers)].filter(Boolean);
  if (!answers.length) return false;

  const uniqueAnswers = Array.from(new Set(answers));
  const paddedGuess = ` ${guess} `;

  for (const answer of uniqueAnswers) {
    if (guess === answer) return true;
    if (paddedGuess.includes(` ${answer} `)) return true;
  }
  return false;
}

function isLooseAliasGuessCorrect(
  rawGuess,
  rawAnswers,
  normalizer = normalizeCountryName,
  options = {},
) {
  const guess = normalizer(rawGuess);
  if (!guess) return false;

  const answers = Array.isArray(rawAnswers)
    ? rawAnswers.map((a) => normalizer(a)).filter(Boolean)
    : [normalizer(rawAnswers)].filter(Boolean);
  if (!answers.length) return false;

  if (isStrictAliasGuessCorrect(guess, answers, (v) => String(v || "")))
    return true;

  const uniqueAnswers = Array.from(new Set(answers));
  const minGuessLength = Number(options?.minGuessLength || 4);
  const minTokenLength = Number(options?.minTokenLength || 3);
  const singleTokenMinLength = Number(options?.singleTokenMinLength || 5);
  const paddedGuess = ` ${guess} `;

  if (guess.length >= minGuessLength) {
    for (const answer of uniqueAnswers) {
      const paddedAnswer = ` ${answer} `;
      if (paddedAnswer.includes(paddedGuess)) return true;
    }
  }

  const guessTokens = toMeaningfulTokens(guess, minTokenLength);
  if (!guessTokens.length) return false;

  for (const answer of uniqueAnswers) {
    const answerTokens = new Set(toMeaningfulTokens(answer, minTokenLength));
    if (!answerTokens.size) continue;

    let matched = 0;
    for (const token of guessTokens) {
      if (answerTokens.has(token)) matched += 1;
    }

    if (guessTokens.length === 1) {
      if (guessTokens[0].length >= singleTokenMinLength && matched === 1)
        return true;
      continue;
    }

    if (matched === guessTokens.length) return true;
  }

  return false;
}

function extractWordGuessCandidates(raw) {
  const lower = String(raw || "").toLowerCase();
  const tokens = lower
    .split(/[^a-zà-öø-ÿ]+/i)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 5 && t.length <= 6);
  return Array.from(new Set(tokens));
}

function buildPlayerAnswerAliases(name, aliases = []) {
  const out = new Set();
  const add = (value) => {
    const normalized = normalizePlayerGuess(value);
    if (normalized) out.add(normalized);
    const compact = buildCompactAlias(value);
    if (compact) out.add(compact);
    const tokens = normalized ? normalized.split(/\s+/).filter(Boolean) : [];
    if (tokens.length > 0) {
      for (const token of tokens) {
        if (token.length >= 3) out.add(token);
      }
    }
    if (tokens.length > 1) {
      const surname = tokens[tokens.length - 1];
      if (surname && surname.length >= 3) out.add(surname);
      const knownName = tokens[0];
      if (knownName && knownName.length >= 3) out.add(knownName);
      const compoundSurname = tokens.slice(-2).join(" ").trim();
      if (compoundSurname.length >= 5) out.add(compoundSurname);
    }
  };
  add(name);
  const extra = Array.isArray(aliases) ? aliases : [];
  for (const alias of extra) add(alias);
  return Array.from(out.values());
}

function buildPlayerAliases(player) {
  const aliases = new Set();
  const add = (value) => {
    const normalized = normalizePlayerGuess(value);
    if (normalized) aliases.add(normalized);
  };
  add(player?.strPlayer);
  add(player?.strKnownAs);
  add(player?.strNickname);
  return Array.from(aliases.values());
}

function isFootballPlayer(player) {
  if (!player || typeof player !== "object") return false;
  const sportRaw = String(player?.strSport || "").trim().toLowerCase();
  const teamRaw = String(player?.strTeam || "").trim().toLowerCase();
  const leagueRaw = String(player?.strLeague || "").trim().toLowerCase();
  const footballSports = new Set([
    "soccer",
    "association football",
    "football",
    "calcio",
  ]);
  if (sportRaw && !footballSports.has(sportRaw)) return false;
  const blockedHints = [
    "rugby",
    "nfl",
    "basket",
    "nba",
    "hockey",
    "baseball",
    "cricket",
    "volley",
    "handball",
  ];
  const combined = `${teamRaw} ${leagueRaw}`;
  if (blockedHints.some((hint) => combined.includes(hint))) return false;
  return true;
}

async function fetchPlayerInfo(cfg, name) {
  const apiBase = cfg?.guessPlayer?.apiUrl;
  if (!apiBase || !name) return null;
  const url = `${apiBase}${encodeURIComponent(name)}`;
  try {
    const res = await axios.get(url, { timeout: 15000 });
    const players = res?.data?.player;
    if (!Array.isArray(players) || players.length === 0) return null;
    const filteredPlayers = players.filter((p) => isFootballPlayer(p));
    if (!filteredPlayers.length) return null;
    const source = filteredPlayers;
    const player =
      source.find((p) => (p?.strThumb || p?.strCutout) && p?.strPlayer) ||
      source[0];
    if (!player?.strPlayer) return null;
    if (!player.strThumb && !player.strCutout) return null;
    return {
      name: player.strPlayer,
      team: player.strTeam || "Squadra sconosciuta",
      nationality: player.strNationality || "Nazionalità sconosciuta",
      image: player.strThumb || player.strCutout || null,
      aliases: buildPlayerAliases(player),
    };
  } catch {
    return null;
  }
}

async function fetchPlayerFromRandomLetter(cfg) {
  const apiBase = cfg?.guessPlayer?.apiUrl;
  if (!apiBase) return null;
  const letters = "abcdefghijklmnopqrstuvwxyz";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const letter = letters[randomBetween(0, letters.length - 1)];
    const url = `${apiBase}${encodeURIComponent(letter)}`;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      const players = res?.data?.player;
      if (!Array.isArray(players) || players.length === 0) continue;
      const filteredPlayers = players.filter((p) => isFootballPlayer(p));
      if (!filteredPlayers.length) continue;
      const source = filteredPlayers;
      const withImage = source.filter((p) => p?.strThumb || p?.strCutout);
      const pool = withImage.length ? withImage : source;
      const player = pool[randomBetween(0, pool.length - 1)];
      if (!player?.strPlayer) continue;
      if (!player.strThumb && !player.strCutout) continue;
      return {
        name: player.strPlayer,
        team: player.strTeam || "Squadra sconosciuta",
        nationality: player.strNationality || "Nazionalità sconosciuta",
        image: player.strThumb || player.strCutout || null,
        aliases: buildPlayerAliases(player),
      };
    } catch {}
  }
  return null;
}

async function loadPlayerList(cfg) {
  const now = Date.now();
  if (cachedPlayers && now - cachedPlayersAt < PLAYER_CACHE_TTL_MS)
    return cachedPlayers;
  const list = Array.isArray(cfg?.guessPlayer?.names)
    ? cfg.guessPlayer.names
    : [];
  const filtered = list
    .map((name) => String(name || "").trim())
    .filter(Boolean);
  cachedPlayers = filtered;
  cachedPlayersAt = now;
  return cachedPlayers;
}

async function fetchFamousPlayer(cfg) {
  const customNames = Array.isArray(cfg?.guessPlayer?.famousNames)
    ? cfg.guessPlayer.famousNames
    : [];
  const names = customNames
    .map((name) => String(name || "").trim())
    .filter(Boolean);
  if (!names.length) return null;

  const maxAttempts = Math.min(10, names.length);
  const used = new Set();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let pick = null;
    for (let guard = 0; guard < 20; guard += 1) {
      const candidate = names[randomBetween(0, names.length - 1)];
      if (!used.has(candidate)) {
        pick = candidate;
        used.add(candidate);
        break;
      }
    }
    if (!pick) break;
    const info = await fetchPlayerInfo(cfg, pick);
    if (info?.name && info?.image) return info;
  }
  return null;
}

async function fetchRandomSong(cfg) {
  const apiBase = cfg?.guessSong?.apiUrl;
  if (!apiBase) return null;
  const popularTerms =
    Array.isArray(cfg?.guessSong?.popularTerms) &&
    cfg.guessSong.popularTerms.length
      ? cfg.guessSong.popularTerms
      : [
          "the weeknd",
          "dua lipa",
          "ed sheeran",
          "drake",
          "ariana grande",
          "post malone",
          "taylor swift",
          "billie eilish",
          "maneskin",
          "elodie",
          "sfera ebbasta",
          "thasup",
          "bad bunny",
          "eminem",
          "coldplay",
        ];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const term = popularTerms[randomBetween(0, popularTerms.length - 1)];
    const url = `${apiBase}${encodeURIComponent(term)}&entity=song&limit=50`;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      const results = Array.isArray(res?.data?.results) ? res.data.results : [];
      const songs = results.filter(
        (item) => item?.trackName && item?.artistName && item?.previewUrl,
      );
      if (!songs.length) continue;
      const song = songs[randomBetween(0, songs.length - 1)];
      const artwork = song.artworkUrl100
        ? song.artworkUrl100.replace("100x100bb", "600x600bb")
        : null;
      const genre = song.primaryGenreName || "Genere sconosciuto";
      const artistCountry = await fetchArtistCountry(cfg, song.artistName);
      return {
        title: song.trackName,
        artist: song.artistName,
        album: song.collectionName || "Album sconosciuto",
        artwork,
        genre,
        artistCountry: artistCountry || "Nazionalità sconosciuta",
        previewUrl: song.previewUrl || null,
      };
    } catch {}
  }
  return null;
}

async function fetchAudioAttachment(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
    });
    const data = Buffer.from(res.data);
    if (!data || !data.length) return null;
    return data;
  } catch {
    return null;
  }
}

async function loadPopularSongList(cfg) {
  const now = Date.now();
  if (cachedSongs && now - cachedSongsAt < SONG_CACHE_TTL_MS)
    return cachedSongs;
  const all = [];

  const deezerChartUrl =
    cfg?.guessSong?.deezerChartUrl ||
    "https://api.deezer.com/chart/0/tracks?limit=100";
  try {
    const chartRes = await axios.get(deezerChartUrl, { timeout: 15000 });
    const tracks = Array.isArray(chartRes?.data?.data)
      ? chartRes.data.data
      : [];
    for (const track of tracks) {
      if (!track?.title || !track?.artist?.name) continue;
      all.push({
        source: "deezer",
        id: String(track.id || ""),
        title: track.title,
        artist: track.artist.name,
        album: track?.album?.title || "Album sconosciuto",
        artwork:
          track?.album?.cover_xl ||
          track?.album?.cover_big ||
          track?.album?.cover_medium ||
          null,
        genre: "Popolare",
        previewUrl: track.preview || null,
      });
    }
  } catch {}

  const feeds = Array.isArray(cfg?.guessSong?.popularFeeds)
    ? cfg.guessSong.popularFeeds
    : [
        "https://itunes.apple.com/it/rss/topsongs/limit=100/json",
        "https://itunes.apple.com/us/rss/topsongs/limit=100/json",
      ];
  for (const feed of feeds) {
    if (!feed) continue;
    try {
      const res = await axios.get(feed, { timeout: 15000 });
      const entries = Array.isArray(res?.data?.feed?.entry)
        ? res.data.feed.entry
        : [];
      for (const entry of entries) {
        const id =
          entry?.id?.attributes?.["im:id"] || entry?.id?.attributes?.im_id;
        const title = entry?.["im:name"]?.label || entry?.title?.label;
        const artist =
          entry?.["im:artist"]?.label || entry?.["im:artist"]?.name;
        const images = Array.isArray(entry?.["im:image"])
          ? entry["im:image"]
          : [];
        const artwork = images.length ? images[images.length - 1].label : null;
        if (!id || !title || !artist) continue;
        all.push({
          source: "itunes_feed",
          id: String(id),
          title,
          artist,
          artwork,
        });
      }
    } catch {}
  }
  cachedSongs = all;
  cachedSongsAt = now;
  return cachedSongs;
}

async function fetchPopularSong(cfg) {
  const list = await loadPopularSongList(cfg);
  if (!list.length) return null;
  const onlyWithPreview = list.filter((item) => item?.previewUrl);
  const pool = onlyWithPreview.length ? onlyWithPreview : list;
  const pick = pool[randomBetween(0, pool.length - 1)];
  if (!pick?.id) return null;

  if (pick.source === "deezer") {
    const artistCountry = await fetchArtistCountry(cfg, pick.artist);
    return {
      title: pick.title,
      artist: pick.artist,
      album: pick.album || "Album sconosciuto",
      artwork: pick.artwork || null,
      genre: pick.genre || "Genere sconosciuto",
      artistCountry: artistCountry || "Nazionalità sconosciuta",
      previewUrl: pick.previewUrl || null,
    };
  }

  const lookupUrl = `https://itunes.apple.com/lookup?id=${encodeURIComponent(pick.id)}`;
  try {
    const res = await axios.get(lookupUrl, { timeout: 15000 });
    const item = Array.isArray(res?.data?.results) ? res.data.results[0] : null;
    if (!item?.trackName || !item?.artistName) return null;
    const genre = item?.primaryGenreName || "Genere sconosciuto";
    const artistCountry = await fetchArtistCountry(cfg, pick.artist);
    return {
      title: item?.trackName || pick.title,
      artist: item?.artistName || pick.artist,
      album: item?.collectionName || "Album sconosciuto",
      artwork: item?.artworkUrl100
        ? item.artworkUrl100.replace("100x100bb", "600x600bb")
        : pick.artwork,
      genre,
      artistCountry: artistCountry || "Nazionalità sconosciuta",
      previewUrl: item?.previewUrl || null,
    };
  } catch {
    return null;
  }
}

function normalizeArtistLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\((feat|ft)\.?[^)]*\)/g, " ")
    .replace(/\b(feat|ft)\.?[\s\S]*$/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildArtistSearchTerms(artistName) {
  const raw = String(artistName || "").trim();
  const normalized = normalizeArtistLabel(raw);
  const terms = new Set();
  if (raw) terms.add(raw);
  if (normalized && normalized !== raw.toLowerCase()) terms.add(normalized);
  return Array.from(terms).filter(Boolean);
}

function pickBestArtistCandidate(candidates, artistName) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const target = normalizeArtistLabel(artistName);
  const scored = candidates
    .map((artist) => {
      const artistLabel = normalizeArtistLabel(artist?.name);
      const hasCountry = Boolean(artist?.country || artist?.area?.name);
      const mbScore = Number(artist?.score || 0);
      let nameScore = 0;
      if (artistLabel && target) {
        if (artistLabel === target) nameScore = 120;
        else if (artistLabel.includes(target) || target.includes(artistLabel))
          nameScore = 60;
      }
      const countryBonus = hasCountry ? 30 : 0;
      return { artist, score: mbScore + nameScore + countryBonus };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.artist || null;
}

async function fetchArtistCountry(cfg, artistName) {
  if (!artistName) return null;
  const apiBase =
    cfg?.guessSong?.artistApiUrl ||
    "https://musicbrainz.org/ws/2/artist/?query=artist:";
  const terms = buildArtistSearchTerms(artistName);
  const urls = [];

  for (const term of terms) {
    urls.push(`${apiBase}${encodeURIComponent(term)}&fmt=json&limit=8`);
  }
  urls.push(
    `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json&limit=8`,
  );
  urls.push(
    `https://musicbrainz.org/ws/2/artist/?query=artist:%22${encodeURIComponent(artistName)}%22&fmt=json&limit=8`,
  );

  const seen = new Set();
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const res = await axios.get(url, {
        timeout: 15000,
        headers: {
          "User-Agent": "ViniliCaffeBot/1.0 (discord bot)",
        },
      });
      const candidates = Array.isArray(res?.data?.artists)
        ? res.data.artists
        : [];
      const artist = pickBestArtistCandidate(candidates, artistName);
      const country = artist?.country || artist?.area?.name || null;
      if (country) return country;
    } catch {}
  }
  return null;
}

function isWithinAllowedWindow(now, start, end) {
  const startMinutes = (start?.hour ?? 9) * 60 + (start?.minute ?? 0);
  const endMinutes = (end?.hour ?? 23) * 60 + (end?.minute ?? 45);
  const parts = getRomeParts(now);
  const current = parts.hour * 60 + parts.minute;
  return current >= startMinutes && current <= endMinutes;
}

function getRomeParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function getRomeDateKey(date) {
  const parts = getRomeParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function buildGuessNumberEmbed(min, max, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina il numero .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> Indovina un numero tra **${min}** e **${max}** per ottenere **${rewardExp}exp** ˚﹒`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per indovinarlo!`,
        `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildGuessWordEmbed(scrambled, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina la parola .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> Indovina la parola da queste lettere: **${scrambled}** per ottenere **${rewardExp} exp** ˚﹒`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per indovinarla!`,
        `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildGuessFlagEmbed(flagUrl, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina la bandiera .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> Indovina la nazione da questa bandiera per ottenere **${rewardExp} exp** ˚﹒`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per indovinarla!`,
        `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    )
    .setImage(flagUrl);
}

function buildGuessPlayerEmbed(rewardExp, durationMs, imageUrl) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina il calciatore .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> Indovina il calciatore più famoso per ottenere **${rewardExp} exp** ˚﹒`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per indovinarlo!`,
        `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
  if (imageUrl) {
    embed.setImage(imageUrl);
  }
  return embed;
}

function buildGuessSongEmbed(rewardExp, durationMs, artworkUrl) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina la canzone .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> Indovina la canzone per ottenere **${rewardExp} exp**˚﹒`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per indovinarla!`,
        `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
  if (artworkUrl) embed.setImage(artworkUrl);
  return embed;
}

function buildGuessCapitalEmbed(
  country,
  rewardExp,
  durationMs,
  imageUrl = null,
) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina la capitale .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> Qual è la capitale di **${country}**? Ricompensa **${rewardExp} exp**.`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per rispondere!`,
      ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessRegionCapitalEmbed(
  region,
  rewardExp,
  durationMs,
  imageUrl = null,
  imageName = null,
) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina il capoluogo .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> Qual è il capoluogo della regione **${region}**? Ricompensa **${rewardExp} exp**.`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per rispondere!`,
      ].join("\n"),
    );
  if (imageName) embed.setImage(`attachment://${imageName}`);
  else if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildFastTypeEmbed(phrase, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Scrivi per primo la frase .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> Il primo che scrive questa frase vince **${rewardExp} exp**:`,
        `\`${phrase}\``,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti**.`,
      ].join("\n"),
    );
}

function buildGuessTeamEmbed(rewardExp, durationMs, imageUrl) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina la squadra di calcio .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> Indovina la squadra di calcio dal logo e vinci **${rewardExp} exp**.`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti**.`,
      ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessSingerEmbed(rewardExp, durationMs, imageUrl) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina il cantante .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> Indovina il cantante dalla foto e vinci **${rewardExp} exp**.`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti**.`,
      ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessAlbumEmbed(rewardExp, durationMs, imageUrl) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina l'album .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> Indovina l'album dalla copertina e vinci **${rewardExp} exp**.`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti**.`,
      ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildHangmanEmbed(
  maskedWord,
  misses,
  maxMisses,
  rewardExp,
  durationMs,
) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const letters = countHangmanLetters(maskedWord);
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Impiccato .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> Scrivi una lettera o prova la parola intera.`,
        `Parola: \`${maskedWord}\``,
        `Lettere: **${letters}**`,
        `Errori: **${misses}/${maxMisses}**`,
        `Ricompensa: **${rewardExp} exp**`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti**.`,
      ].join("\n"),
    );
}

function buildRegionNameImageAttachment(regionName) {
  const safeRegion = String(regionName || "").trim();
  if (!safeRegion) return null;
  try {
    const width = 1200;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#101522";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#6f4e37";
    ctx.fillRect(24, 24, width - 48, height - 48);
    ctx.fillStyle = "#f7f1e8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 52px Sans";
    ctx.fillText("Regione", width / 2, 140);
    ctx.font = "bold 96px Sans";
    ctx.fillText(safeRegion, width / 2, 250, width - 120);

    return new AttachmentBuilder(canvas.toBuffer("image/png"), {
      name: "region_name.png",
    });
  } catch {
    return null;
  }
}

function buildItalianGkEmbed(question, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Cultura generale .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> **Domanda:** ${question}`,
        `Ricompensa: **${rewardExp} exp**`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti**.`,
      ].join("\n"),
    );
}

function buildDrivingQuizEmbed(statement, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Quiz patente .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> **Affermazione:** ${statement}`,
        "Rispondi con `vero` o `falso`.",
        `Ricompensa: **${rewardExp} exp**`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti**.`,
      ].join("\n"),
    );
}

function buildMathExpressionEmbed(
  expression,
  rewardExp,
  durationMs,
  imageName = null,
) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Espressione matematica .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Beer:1448687940560490547> Risolvi: **${expression}**`,
        `Ricompensa: **${rewardExp} exp**`,
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti**.`,
      ].join("\n"),
    );
  if (imageName) embed.setImage(`attachment://${imageName}`);
  return embed;
}

function buildFindBotEmbed(durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Trova il bot .ᐟ ✧")
    .setDescription(
      [
        "<a:VC_Beer:1448687940560490547> Trova il messaggio del bot tra i canali del server, premi il bottone e vinci la ricompensa!",
        `> <a:VC_Time:1468641957038526696> Hai **${minutes} minuti** per trovarlo!`,
        `> <:VC_Dot:1443932948599668746> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildFindBotButtonEmbed(durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Sei vicino al bot .ᐟ ✧")
    .setDescription(
      [
        "<a:VC_Beer:1448687940560490547> Hai trovato il messaggio nascosto: clicca il bottone per vincere subito la ricompensa!",
        `> <a:VC_Time:1468641957038526696> Tempo rimasto: **${minutes} minuti**`,
        `> <:VC_Dot:1443932948599668746> Solo il primo che clicca vince.`,
      ].join("\n"),
    );
}

function buildMinuteHintEmbed(channelId) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Heart:1448672728822448141>⁺Indizio")
    .setDescription(`➢ <a:VC_Arrow:1448672967721615452> <#${channelId}>`);
}

function buildFlagHintEmbed(name) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Heart:1448672728822448141>⁺Indizio")
    .setDescription(`➢ <a:VC_Arrow:1448672967721615452> ${name}`);
}

function buildGenericHintEmbed(text) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Heart:1448672728822448141>⁺Indizio")
    .setDescription(`➢ <a:VC_Arrow:1448672967721615452> ${text}`);
}

function buildMaskedTextHint(value) {
  const normalized = normalizeCountryName(value);
  if (!normalized) return null;
  const plain = normalized.replace(/\s+/g, "");
  if (plain.length <= 2) return `Inizia con **${plain[0] || "?"}**`;
  return `Inizia con **${plain[0]}** e termina con **${plain[plain.length - 1]}** (${plain.length} lettere)`;
}

function buildNumberNearHint(target, min, max) {
  const low = Number(min || 1);
  const high = Number(max || 100);
  const range = Math.max(1, high - low);
  const band = Math.max(2, Math.round(range * 0.18));
  const from = Math.max(low, Number(target) - band);
  const to = Math.min(high, Number(target) + band);
  return `Il numero è tra **${from}** e **${to}**.`;
}

function buildHintEmbed(isHigher) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      isHigher
        ? "📈 <a:VC_Arrow:1448672967721615452> Più alto!"
        : "📉 <a:VC_Arrow:1448672967721615452> Più basso!",
    );
}

function buildWinEmbed(winnerId, rewardExp, totalExp) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Events:1448688007438667796> Un utente ha vinto .ᐟ ✧")
    .setDescription(
      [
        `<a:VC_Winner:1448687700235256009> Complimenti <@${winnerId}>, hai vinto e guadagnato **${rewardExp}exp**.ᐟ ✧`,
        "",
        "📊 **Le tue statistiche:**",
        `<a:VC_Arrow:1448672967721615452> Ora hai un totale di **${totalExp}exp**`,
      ].join("\n"),
    )
    .setFooter({
      text: '⇢ digita il comando "+mstats" per vedere i tuoi progressi',
    });
}

function getHighestEligibleReward(totalExp) {
  const expValue = Number(totalExp || 0);
  let best = null;
  for (const reward of EXP_REWARDS) {
    if (expValue >= reward.exp) best = reward;
  }
  return best;
}

function getNextReward(totalExp) {
  const expValue = Number(totalExp || 0);
  return EXP_REWARDS.find((reward) => expValue < reward.exp) || null;
}

function buildRewardEmbed(member, reward, totalExp) {
  const nextReward = getNextReward(totalExp);
  const remaining = nextReward
    ? Math.max(0, nextReward.exp - Number(totalExp || 0))
    : 0;

  const description = [
    "<a:VC_Flower:1468685050966179841> Premio ricevuto <a:VC_Flower:1468685050966179841>",
    "",
    `<a:VC_Events:1448688007438667796> **__<@${member.id}>__**`,
    `hai ottenuto il ruolo <@&${reward.roleId}> per aver raggiunto **${reward.exp}** punti ai **Minigiochi** <a:VC_HeartsPink:1468685897389052008>`,
    "",
    nextReward
      ? `<a:VC_HeartsBlue:1468686100045369404> / ti mancano **${remaining}** punti per la prossima ricompensa!`
      : "<a:VC_HeartsBlue:1468686100045369404> / hai raggiunto la ricompensa **massima**!",
  ].join("\n");

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: member.displayName || member.user?.username || "Utente",
      iconURL: member.displayAvatarURL(),
    })
    .setDescription(description)
    .setFooter({
      text: "Gli exp guadagnati si sommano al tuo livello globale! Controlla le tue statistiche con il comando `+mstats`",
    });
}

async function handleExpReward(client, member, totalExp) {
  if (!member?.guild) return;
  const reward = getHighestEligibleReward(totalExp);
  if (!reward) return;
  if (member.roles.cache.has(reward.roleId)) return;

  await member.roles.add(reward.roleId).catch(() => {});

  const rewardChannel =
    getChannelSafe(client, REWARD_CHANNEL_ID) ||
    (await member.guild.channels.fetch(REWARD_CHANNEL_ID).catch(() => null));
  if (!rewardChannel) return;
  await rewardChannel
    .send({
      content: `${member}`,
      embeds: [buildRewardEmbed(member, reward, totalExp)],
    })
    .catch(() => {});
}

function buildTimeoutNumberEmbed(number) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! Il numero era **${number}**.`,
    );
}

function buildTimeoutWordEmbed(word) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! La parola era **${word}**.`,
    );
}

function buildTimeoutFlagEmbed(name) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! La bandiera era **${name}**.`,
    );
}

function buildTimeoutPlayerEmbed(name) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! Il calciatore era **${name}**.`,
    );
}

function buildTimeoutSongEmbed(title, artist) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! Era **${title}** — ${artist}.`,
    );
}

function buildTimeoutFindBotEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      "<a:VC_Timer:1462779065625739344> Tempo scaduto! Nessuno ha trovato il bot.",
    );
}

function buildTimeoutCapitalEmbed(country, answer) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! La capitale di **${country}** era **${answer}**.`,
    );
}

function buildTimeoutRegionCapitalEmbed(region, answer) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! Il capoluogo di **${region}** era **${answer}**.`,
    );
}

function buildTimeoutFastTypeEmbed(phrase) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! La frase era \`${phrase}\`.`,
    );
}

function buildTimeoutTeamEmbed(team) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! La squadra era **${team}**.`,
    );
}

function buildTimeoutSingerEmbed(name) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! Il cantante era **${name}**.`,
    );
}

function buildTimeoutAlbumEmbed(name, artist) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! Era **${name}** di ${artist}.`,
    );
}

function buildTimeoutHangmanEmbed(word) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! La parola era **${word}**.`,
    );
}

function buildTimeoutItalianGkEmbed(answer) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! La risposta era **${answer}**.`,
    );
}

function buildTimeoutDrivingQuizEmbed(answerBool) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! La risposta corretta era **${answerBool ? "vero" : "falso"}**.`,
    );
}

function buildTimeoutMathEmbed(answer) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_Timer:1462779065625739344> Tempo scaduto! Il risultato corretto era **${answer}**.`,
    );
}

function getAvailableGameTypes(cfg) {
  const types = [];
  if (cfg?.guessWord?.apiUrl) types.push("guessWord");
  if (cfg?.guessFlag?.apiUrl) types.push("guessFlag");
  if (cfg?.guessPlayer?.apiUrl) types.push("guessPlayer");
  if (cfg?.guessSong) types.push("guessSong");
  if (cfg?.guessCapital !== false) types.push("guessCapital");
  if (cfg?.guessRegionCapital !== false) types.push("guessRegionCapital");
  if (cfg?.fastType !== false) types.push("fastType");
  if (cfg?.guessTeam) types.push("guessTeam");
  if (cfg?.guessSinger) types.push("guessSinger");
  if (cfg?.guessAlbum) types.push("guessAlbum");
  if (cfg?.hangman !== false) types.push("hangman");
  if (cfg?.italianGK?.apiUrl) types.push("italianGK");
  if (cfg?.drivingQuiz?.apiUrl) types.push("drivingQuiz");
  if (cfg?.mathExpression !== false) types.push("mathExpression");
  return types;
}

async function loadRotationState(client, cfg) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  const guildId = channel?.guild?.id || null;
  if (!guildId) return;
  const dateKey = getRomeDateKey(new Date());
  const doc = await MinigameRotation.findOne({ guildId, channelId })
    .lean()
    .catch(() => null);
  if (doc && Array.isArray(doc.queue)) {
    rotationDate = doc.dateKey || dateKey;
    rotationQueue = doc.queue.slice();
    return;
  }
  rotationDate = dateKey;
  rotationQueue = [];
  await MinigameRotation.findOneAndUpdate(
    { guildId, channelId },
    { $set: { dateKey, queue: [] } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => {});
}

async function saveRotationState(client, cfg) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  const guildId = channel?.guild?.id || null;
  if (!guildId) return;
  const dateKey = rotationDate || getRomeDateKey(new Date());
  await MinigameRotation.findOneAndUpdate(
    { guildId, channelId },
    { $set: { dateKey, queue: rotationQueue } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => {});
}

async function getNextGameType(client, cfg) {
  const available = getAvailableGameTypes(cfg);
  if (available.length === 0) return null;
  if (!rotationDate) rotationDate = getRomeDateKey(new Date());
  if (rotationQueue.length === 0) {
    rotationQueue = available.slice();
    for (let i = rotationQueue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [rotationQueue[i], rotationQueue[j]] = [
        rotationQueue[j],
        rotationQueue[i],
      ];
    }
  } else {
    const allowed = new Set(available);
    const seen = new Set();
    const cleaned = [];
    for (const type of rotationQueue) {
      if (!allowed.has(type) || seen.has(type)) continue;
      cleaned.push(type);
      seen.add(type);
    }
    for (const type of available) {
      if (!seen.has(type)) {
        cleaned.push(type);
        seen.add(type);
      }
    }
    rotationQueue = cleaned;
  }
  const next = rotationQueue.shift() || available[0];
  await saveRotationState(client, cfg);
  return next;
}

async function requeueGameType(client, cfg, gameType) {
  if (!gameType) return;
  const available = getAvailableGameTypes(cfg);
  if (!available.includes(gameType)) return;
  if (!rotationDate) rotationDate = getRomeDateKey(new Date());
  rotationQueue = rotationQueue.filter((type) => type !== gameType);
  rotationQueue.push(gameType);
  await saveRotationState(client, cfg);
}

async function scheduleMinuteHint(
  client,
  hintChannelId,
  durationMs,
  channelId,
) {
  if (!hintChannelId || !durationMs || durationMs <= 60 * 1000) return null;
  const mainChannel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!mainChannel) return null;
  const delay = durationMs - 60 * 1000;
  return setTimeout(async () => {
    await mainChannel
      .send({ embeds: [buildMinuteHintEmbed(hintChannelId)] })
      .catch(() => {});
  }, delay);
}

async function scheduleFlagHint(client, channelId, durationMs, name) {
  if (!channelId || !durationMs || durationMs <= 60 * 1000) return null;
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return null;
  const delay = durationMs - 60 * 1000;
  return setTimeout(async () => {
    await channel.send({ embeds: [buildFlagHintEmbed(name)] }).catch(() => {});
  }, delay);
}

async function scheduleGenericHint(client, channelId, durationMs, hintText) {
  if (!channelId || !durationMs || durationMs <= 60 * 1000 || !hintText)
    return null;
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return null;
  const delay = durationMs - 60 * 1000;
  return setTimeout(async () => {
    await channel
      .send({ embeds: [buildGenericHintEmbed(hintText)] })
      .catch(() => {});
  }, delay);
}

async function startGuessNumberGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const min = Math.max(1, Number(cfg?.guessNumber?.min || 1));
  const max = Math.max(min, Number(cfg?.guessNumber?.max || 100));
  const rewardExp = Number(cfg?.guessNumber?.rewardExp || 100);
  const durationMs = Math.max(
    60000,
    Number(cfg?.guessNumber?.durationMs || 180000),
  );

  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  const target = randomBetween(min, max);
  const roleId = cfg.roleId;

  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }
  const numberAttachment = buildPromptImageAttachment(
    "Indovina il numero",
    [`${min} - ${max}`],
    "guess_number",
  );
  const numberEmbed = buildGuessNumberEmbed(min, max, rewardExp, durationMs);
  if (numberAttachment) {
    numberEmbed.setImage(`attachment://${numberAttachment.name}`);
  }
  const gameMessage = await channel
    .send({
      embeds: [numberEmbed],
      files: numberAttachment ? [numberAttachment] : [],
    })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({ embeds: [buildTimeoutNumberEmbed(game.target)] })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    buildNumberNearHint(target, min, max),
  );

  activeGames.set(channelId, {
    type: "guessNumber",
    target,
    min,
    max,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessNumber",
    target: String(target),
    min,
    max,
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);

  return true;
}

async function startGuessWordGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const words = await loadWordList(cfg);
  if (!words.length) return false;

  const rewardExp = Number(cfg?.guessWord?.rewardExp || 150);
  const durationMs = Math.max(
    60000,
    Number(cfg?.guessWord?.durationMs || 180000),
  );

  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  const target = String(
    words[randomBetween(0, words.length - 1)] || "",
  ).toLowerCase();
  if (!target) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }
  const scrambled = shuffleString(target);
  const wordAttachment = buildPromptImageAttachment(
    "Indovina la parola",
    [scrambled],
    "guess_word",
  );
  const wordEmbed = buildGuessWordEmbed(scrambled, rewardExp, durationMs);
  if (wordAttachment) {
    wordEmbed.setImage(`attachment://${wordAttachment.name}`);
  }
  const gameMessage = await channel
    .send({
      embeds: [wordEmbed],
      files: wordAttachment ? [wordAttachment] : [],
    })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({ embeds: [buildTimeoutWordEmbed(game.target)] })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    `Parola da **${target.length}** lettere. ${buildMaskedTextHint(target)}`,
  );

  activeGames.set(channelId, {
    type: "guessWord",
    target,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessWord",
    target,
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);

  return true;
}

async function startGuessFlagGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const countries = await loadCountryList(cfg);
  if (!countries.length) return false;

  const rewardExp = Number(cfg?.guessFlag?.rewardExp || 150);
  const durationMs = Math.max(
    60000,
    Number(cfg?.guessFlag?.durationMs || 180000),
  );

  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  const target = countries[randomBetween(0, countries.length - 1)];
  if (!target) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }

  const gameMessage = await channel
    .send({
      embeds: [buildGuessFlagEmbed(target.flagUrl, rewardExp, durationMs)],
    })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({ embeds: [buildTimeoutFlagEmbed(game.displayName)] })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);

  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    `La nazione ha **${normalizeCountryName(target.displayName).replace(/\s+/g, "").length}** lettere. ${buildMaskedTextHint(target.displayName)}`,
  );

  activeGames.set(channelId, {
    type: "guessFlag",
    answers: target.names,
    displayName: target.displayName,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessFlag",
    target: JSON.stringify({
      names: target.names,
      displayName: target.displayName,
      flagUrl: target.flagUrl,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);

  return true;
}

async function startGuessPlayerGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const rewardExp = Number(cfg?.guessPlayer?.rewardExp || 100);
  const durationMs = Math.max(
    60000,
    Number(cfg?.guessPlayer?.durationMs || 180000),
  );

  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  let info = await fetchFamousPlayer(cfg);
  if (!info) info = await fetchPlayerFromRandomLetter(cfg);
  if (!info) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }
  const playerFallbackAttachment = !info.image
    ? buildPromptImageAttachment(
        "Indovina il calciatore",
        [buildMaskedTextHint(info.name) || info.name],
        "guess_player",
      )
    : null;
  const playerEmbed = buildGuessPlayerEmbed(
    rewardExp,
    durationMs,
    info.image || null,
  );
  if (playerFallbackAttachment) {
    playerEmbed.setImage(`attachment://${playerFallbackAttachment.name}`);
  }

  const gameMessage = await channel
    .send({
      embeds: [playerEmbed],
      files: playerFallbackAttachment ? [playerFallbackAttachment] : [],
    })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({ embeds: [buildTimeoutPlayerEmbed(game.displayName)] })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);

  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    `${info.team} • ${info.nationality} • ${buildMaskedTextHint(info.name)}`,
  );

  activeGames.set(channelId, {
    type: "guessPlayer",
    answers: buildPlayerAnswerAliases(info.name, info.aliases),
    fullAnswer: normalizePlayerGuess(info.name),
    displayName: info.name,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessPlayer",
    target: JSON.stringify({
      name: info.name,
      team: info.team,
      nationality: info.nationality,
      image: info.image,
      aliases: buildPlayerAnswerAliases(info.name, info.aliases),
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startGuessSongGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const rewardExp = Number(cfg?.guessSong?.rewardExp || 100);
  const durationMs = Math.max(
    60000,
    Number(cfg?.guessSong?.durationMs || 180000),
  );

  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  const onlyFamous = cfg?.guessSong?.onlyFamous !== false;
  let info = await fetchPopularSong(cfg);
  if (!info && !onlyFamous) {
    info = await fetchRandomSong(cfg);
  }
  if (!info?.title || !info?.artist) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }

  const previewCustomId = `minigame_song_preview:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(previewCustomId)
      .setLabel("Ascolta anteprima")
      .setEmoji(`<:VC_Preview:1462941162393309431>`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!info.previewUrl),
  );
  const gameMessage = await channel
    .send({
      embeds: [buildGuessSongEmbed(rewardExp, durationMs, info.artwork)],
      components: [row],
    })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({ embeds: [buildTimeoutSongEmbed(game.title, game.artist)] })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);

  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    `${info.artistCountry} • ${info.genre} • ${buildMaskedTextHint(info.title)}`,
  );

  activeGames.set(channelId, {
    type: "guessSong",
    title: info.title,
    artist: info.artist,
    previewUrl: info.previewUrl || null,
    previewCustomId,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessSong",
    target: JSON.stringify({
      title: info.title,
      artist: info.artist,
      album: info.album,
      artwork: info.artwork,
      genre: info.genre,
      artistCountry: info.artistCountry,
      previewUrl: info.previewUrl,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
    customId: previewCustomId,
  });

  markSent(channelId);
  return true;
}

async function startGuessCapitalGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  const questions = await loadCapitalQuestionBank(cfg);
  const pick = pickQuestionAvoidRecent(
    channelId,
    "guessCapital",
    questions,
    (row) => row?.country,
    28,
  );
  if (!pick?.country || !Array.isArray(pick?.answers) || !pick.answers.length)
    return false;

  const rewardExp = Number(cfg?.guessCapital?.rewardExp || 120);
  const durationMs = Math.max(
    60000,
    Number(cfg?.guessCapital?.durationMs || 180000),
  );
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const gameMessage = await channel
    .send({
      embeds: [
        buildGuessCapitalEmbed(
          pick.country,
          rewardExp,
          durationMs,
          pick.image || null,
        ),
      ],
    })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({
        embeds: [buildTimeoutCapitalEmbed(game.country, game.displayAnswer)],
      })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  const displayAnswer = String(pick.answers[0] || "sconosciuta");
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    `Capitale: ${buildMaskedTextHint(displayAnswer)}`,
  );
  activeGames.set(channelId, {
    type: "guessCapital",
    country: pick.country,
    answers: pick.answers,
    image: pick.image || null,
    displayAnswer,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessCapital",
    target: JSON.stringify({
      country: pick.country,
      answers: pick.answers,
      image: pick.image || null,
      displayAnswer,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startGuessRegionCapitalGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  const questions = await loadRegionCapitalQuestionBank(cfg);
  const pick = pickQuestionAvoidRecent(
    channelId,
    "guessRegionCapital",
    questions,
    (row) => row?.region,
    20,
  );
  if (!pick?.region || !Array.isArray(pick?.answers) || !pick.answers.length)
    return false;

  const rewardExp = Number(cfg?.guessRegionCapital?.rewardExp || 120);
  const durationMs = Math.max(
    60000,
    Number(cfg?.guessRegionCapital?.durationMs || 180000),
  );
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const image = await fetchWikiRegionImage(pick.region);
  const regionNameAttachment = !image
    ? buildRegionNameImageAttachment(pick.region)
    : null;
  const gameMessage = await channel
    .send({
      embeds: [
        buildGuessRegionCapitalEmbed(
          pick.region,
          rewardExp,
          durationMs,
          image,
          regionNameAttachment?.name || null,
        ),
      ],
      files: regionNameAttachment ? [regionNameAttachment] : [],
    })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({
        embeds: [
          buildTimeoutRegionCapitalEmbed(game.region, game.displayAnswer),
        ],
      })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  const displayAnswer = String(pick.answers[0] || "sconosciuto");
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    `Capoluogo: ${buildMaskedTextHint(displayAnswer)}`,
  );
  activeGames.set(channelId, {
    type: "guessRegionCapital",
    region: pick.region,
    answers: pick.answers,
    image,
    displayAnswer,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessRegionCapital",
    target: JSON.stringify({
      region: pick.region,
      answers: pick.answers,
      image,
      displayAnswer,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startFastTypeGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  let phrase = "";
  const apiUrl = cfg?.fastType?.apiUrl || null;
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      const payload = Array.isArray(res?.data) ? pickRandomItem(res.data) : res?.data;
      phrase = String(payload?.phrase || payload?.text || payload || "").trim();
    } catch {}
  }
  if (!phrase) {
    const customPhrases = Array.isArray(cfg?.fastType?.phrases)
      ? cfg.fastType.phrases
      : [];
    const fallbackPhrases = customPhrases.length ? customPhrases : FAST_TYPING_PHRASES;
    phrase = String(pickRandomItem(fallbackPhrases) || "").trim();
  }
  if (!phrase) return false;

  const rewardExp = Number(cfg?.fastType?.rewardExp || 100);
  const durationMs = Math.max(
    60000,
    Number(cfg?.fastType?.durationMs || 120000),
  );
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const fastTypeAttachment = buildPromptImageAttachment(
    "Scrivi la frase",
    [phrase],
    "fast_type",
  );
  const fastTypeEmbed = buildFastTypeEmbed(phrase, rewardExp, durationMs);
  if (fastTypeAttachment) {
    fastTypeEmbed.setImage(`attachment://${fastTypeAttachment.name}`);
  }
  const gameMessage = await channel
    .send({
      embeds: [fastTypeEmbed],
      files: fastTypeAttachment ? [fastTypeAttachment] : [],
    })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({ embeds: [buildTimeoutFastTypeEmbed(game.phrase)] })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);

  activeGames.set(channelId, {
    type: "fastType",
    phrase,
    normalizedPhrase: normalizeCountryName(phrase),
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout: null,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "fastType",
    target: JSON.stringify({
      phrase,
      normalizedPhrase: normalizeCountryName(phrase),
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startGuessTeamGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const teams = await loadFootballTeamsFromApi(cfg);
  const pick = pickRandomItem(teams);
  if (!pick?.team || !pick?.answers?.length) return false;

  const rewardExp = Number(cfg?.guessTeam?.rewardExp || 130);
  const durationMs = Math.max(
    60000,
    Number(cfg?.guessTeam?.durationMs || 180000),
  );
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const gameMessage = await channel
    .send({ embeds: [buildGuessTeamEmbed(rewardExp, durationMs, pick.image)] })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({ embeds: [buildTimeoutTeamEmbed(game.team)] })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    `Squadra: ${buildMaskedTextHint(pick.team)}`,
  );

  activeGames.set(channelId, {
    type: "guessTeam",
    team: pick.team,
    answers: pick.answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessTeam",
    target: JSON.stringify({
      team: pick.team,
      answers: pick.answers,
      image: pick.image || null,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startGuessSingerGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const singers = await loadSingersFromApi(cfg);
  const pick = pickRandomItem(singers);
  if (!pick?.name || !pick?.answers?.length) return false;
  const resolvedImage =
    pick.image || (await fetchSingerImageFallback(pick.name, cfg));

  const rewardExp = Number(cfg?.guessSinger?.rewardExp || 130);
  const durationMs = Math.max(
    60000,
    Number(cfg?.guessSinger?.durationMs || 180000),
  );
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const gameMessage = await channel
    .send({
      embeds: [buildGuessSingerEmbed(rewardExp, durationMs, resolvedImage)],
    })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({ embeds: [buildTimeoutSingerEmbed(game.name)] })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    `Cantante: ${buildMaskedTextHint(pick.name)}`,
  );

  activeGames.set(channelId, {
    type: "guessSinger",
    name: pick.name,
    answers: pick.answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessSinger",
    target: JSON.stringify({
      name: pick.name,
      answers: pick.answers,
      image: resolvedImage || null,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startGuessAlbumGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const albums = await loadAlbumsFromApi(cfg);
  const pick = pickRandomItem(albums);
  if (!pick?.album || !pick?.answers?.length) return false;

  const rewardExp = Number(cfg?.guessAlbum?.rewardExp || 130);
  const durationMs = Math.max(
    60000,
    Number(cfg?.guessAlbum?.durationMs || 180000),
  );
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const gameMessage = await channel
    .send({ embeds: [buildGuessAlbumEmbed(rewardExp, durationMs, pick.image)] })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({ embeds: [buildTimeoutAlbumEmbed(game.album, game.artist)] })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    `Artista: **${pick.artist}** • Album: ${buildMaskedTextHint(pick.album)}`,
  );

  activeGames.set(channelId, {
    type: "guessAlbum",
    album: pick.album,
    artist: pick.artist,
    answers: pick.answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessAlbum",
    target: JSON.stringify({
      album: pick.album,
      artist: pick.artist,
      answers: pick.answers,
      image: pick.image || null,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startHangmanGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  let words = [];
  const apiUrl = cfg?.hangman?.apiUrl || null;
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      const list = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.data?.words)
          ? res.data.words
          : [];
      words = list.map((v) => String(v || "").trim()).filter(Boolean);
    } catch {}
  }
  if (!words.length) {
    const customWords = Array.isArray(cfg?.hangman?.words)
      ? cfg.hangman.words
      : [];
    const fallbackWords = customWords.length ? customWords : HANGMAN_WORDS;
    words = fallbackWords.map((v) => String(v || "").trim()).filter(Boolean);
  }
  if (!words.length) return false;

  const word = normalizeCountryName(pickRandomItem(words));
  if (!word) return false;

  const rewardExp = Number(cfg?.hangman?.rewardExp || 150);
  const durationMs = Math.max(
    60000,
    Number(cfg?.hangman?.durationMs || 240000),
  );
  const maxMisses = Math.max(3, Number(cfg?.hangman?.maxMisses || 7));
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const guessedLetters = [];
  const maskedWord = maskHangmanWord(word, new Set(guessedLetters));
  const hangmanAttachment = buildPromptImageAttachment(
    "Impiccato",
    [maskedWord, `Errori: 0/${maxMisses}`],
    "hangman",
  );
  const hangmanEmbed = buildHangmanEmbed(
    maskedWord,
    0,
    maxMisses,
    rewardExp,
    durationMs,
  );
  if (hangmanAttachment) {
    hangmanEmbed.setImage(`attachment://${hangmanAttachment.name}`);
  }
  const gameMessage = await channel
    .send({
      embeds: [hangmanEmbed],
      files: hangmanAttachment ? [hangmanAttachment] : [],
    })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({ embeds: [buildTimeoutHangmanEmbed(game.word)] })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    `La parola contiene **${word.length}** lettere.`,
  );

  activeGames.set(channelId, {
    type: "hangman",
    word,
    guessedLetters,
    misses: 0,
    maxMisses,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "hangman",
    target: JSON.stringify({ word, guessedLetters, misses: 0, maxMisses }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startItalianGkGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  const apiUrls = buildItalianGkApiUrls(cfg);
  let questionRow = null;
  const requireItalian = cfg?.italianGK?.requireItalian !== false;
  if (apiUrls.length) {
    for (const apiUrl of apiUrls) {
      try {
        const res = await axios.get(apiUrl, { timeout: 15000 });
        const parsed = parseItalianGkQuestionFromPayload(res?.data);
        if (!parsed?.question || !parsed?.answers?.length) continue;
        if (requireItalian && !isLikelyItalianText(parsed.question)) continue;
        questionRow = parsed;
        break;
      } catch {}
    }
  }
  if (!questionRow) {
    const localPick = pickRandomItem(ITALIAN_GK_BANK);
    if (localPick?.question && Array.isArray(localPick?.answers)) {
      questionRow = {
        question: String(localPick.question),
        answers: buildAliases(localPick.answers),
      };
    }
  }
  if (!questionRow) return false;
  if (!questionRow.answers.length) return false;

  const rewardExp = Number(cfg?.italianGK?.rewardExp || 140);
  const durationMs = Math.max(
    60000,
    Number(cfg?.italianGK?.durationMs || 180000),
  );
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const gkAttachment = buildPromptImageAttachment(
    "Cultura generale",
    [questionRow.question],
    "italian_gk",
  );
  const gkEmbed = buildItalianGkEmbed(questionRow.question, rewardExp, durationMs);
  if (gkAttachment) {
    gkEmbed.setImage(`attachment://${gkAttachment.name}`);
  }
  const gameMessage = await channel
    .send({
      embeds: [gkEmbed],
      files: gkAttachment ? [gkAttachment] : [],
    })
    .catch(() => null);
  const displayAnswer = String(questionRow.answers[0] || "sconosciuta");

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({ embeds: [buildTimeoutItalianGkEmbed(game.displayAnswer)] })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    `Risposta: ${buildMaskedTextHint(displayAnswer)}`,
  );

  activeGames.set(channelId, {
    type: "italianGK",
    question: questionRow.question,
    answers: questionRow.answers,
    displayAnswer,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "italianGK",
    target: JSON.stringify({
      question: questionRow.question,
      answers: questionRow.answers,
      displayAnswer,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startDrivingQuizGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const apiUrl = cfg?.drivingQuiz?.apiUrl || null;
  let row = null;
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      const payload = Array.isArray(res?.data) ? pickRandomItem(res.data) : res?.data;
      if (payload?.statement != null && payload?.answer != null) {
        const parsedAnswer =
          typeof payload.answer === "boolean"
            ? payload.answer
            : normalizeTruthValue(String(payload.answer));
        if (parsedAnswer === null) return false;
        row = {
          statement: String(payload.statement),
          answer: parsedAnswer,
        };
      }
    } catch {}
  }
  if (!row) {
    const localPick = pickRandomItem(DRIVING_TRUE_FALSE_BANK);
    if (localPick?.statement != null && typeof localPick?.answer === "boolean") {
      row = {
        statement: String(localPick.statement),
        answer: Boolean(localPick.answer),
      };
    }
  }
  if (!row) return false;

  const rewardExp = Number(cfg?.drivingQuiz?.rewardExp || 120);
  const durationMs = Math.max(
    60000,
    Number(cfg?.drivingQuiz?.durationMs || 180000),
  );
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const drivingAttachment = buildPromptImageAttachment(
    "Quiz patente",
    [row.statement],
    "driving_quiz",
  );
  const drivingEmbed = buildDrivingQuizEmbed(row.statement, rewardExp, durationMs);
  if (drivingAttachment) {
    drivingEmbed.setImage(`attachment://${drivingAttachment.name}`);
  }
  const gameMessage = await channel
    .send({
      embeds: [drivingEmbed],
      files: drivingAttachment ? [drivingAttachment] : [],
    })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({ embeds: [buildTimeoutDrivingQuizEmbed(game.answer)] })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);

  activeGames.set(channelId, {
    type: "drivingQuiz",
    statement: row.statement,
    answer: Boolean(row.answer),
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout: null,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "drivingQuiz",
    target: JSON.stringify({
      statement: row.statement,
      answer: Boolean(row.answer),
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startMathExpressionGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const row = createMathQuestion();
  if (!row?.expression) return false;

  const rewardExp = Number(cfg?.mathExpression?.rewardExp || 110);
  const durationMs = Math.max(
    60000,
    Number(cfg?.mathExpression?.durationMs || 150000),
  );
  const channel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const expressionAttachment = buildMathExpressionImageAttachment(row.expression);
  const files = expressionAttachment ? [expressionAttachment] : [];
  const gameMessage = await channel
    .send({
      embeds: [
        buildMathExpressionEmbed(
          row.expression,
          rewardExp,
          durationMs,
          expressionAttachment?.name || null,
        ),
      ],
      files,
    })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel
      .send({ embeds: [buildTimeoutMathEmbed(game.answer)] })
      .catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  const answerNum = Number(row.answer);
  const hintRangeText = Number.isFinite(answerNum)
    ? `Il risultato è compreso tra **${Math.floor(answerNum - 2)}** e **${Math.ceil(answerNum + 2)}**.`
    : "Il risultato è un numero intero.";
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    hintRangeText,
  );

  activeGames.set(channelId, {
    type: "mathExpression",
    expression: row.expression,
    answer: String(row.answer),
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "mathExpression",
    target: JSON.stringify({
      expression: row.expression,
      answer: String(row.answer),
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function pickRandomFindBotChannel(guild, requiredRoleId) {
  if (!guild) return null;
  const role = requiredRoleId ? guild.roles.cache.get(requiredRoleId) : null;
  const me = guild.members.me || guild.members.cache.get(guild.client.user.id);

  const channels = guild.channels.cache.filter((channel) => {
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement
    )
      return false;
    if (!channel.viewable) return false;
    if (
      !channel
        .permissionsFor(me)
        ?.has([
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
        ])
    )
      return false;
    if (
      role &&
      !channel.permissionsFor(role)?.has(PermissionsBitField.Flags.ViewChannel)
    )
      return false;
    return true;
  });

  const list = Array.from(channels.values());
  if (list.length === 0) return null;
  return list[randomBetween(0, list.length - 1)];
}

async function startFindBotGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const durationMs = Math.max(
    60000,
    Number(cfg?.findBot?.durationMs || 300000),
  );
  const rewardExp = Number(cfg?.findBot?.rewardExp || 100);
  const requiredRoleId = cfg?.findBot?.requiredRoleId || null;

  const mainChannel =
    getChannelSafe(client, channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!mainChannel?.guild) return false;

  const targetChannel = await pickRandomFindBotChannel(
    mainChannel.guild,
    requiredRoleId,
  );
  if (!targetChannel) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await mainChannel.send({ content: `<@&${roleId}>` }).catch(() => {});
  }

  const mainMessage = await mainChannel
    .send({ embeds: [buildFindBotEmbed(durationMs)] })
    .catch(() => null);

  const customId = `minigame_findbot:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setEmoji(`<a:VC_Heart:1448672728822448141>`)
      .setLabel("Clicca qui per vincere!")
      .setStyle(ButtonStyle.Primary),
  );
  const gameMessage = await targetChannel
    .send({ embeds: [buildFindBotButtonEmbed(durationMs)], components: [row] })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game || game.customId !== customId) return;
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    if (game.channelId && game.messageId) {
      const ch =
        mainChannel.guild.channels.cache.get(game.channelId) ||
        (await mainChannel.guild.channels
          .fetch(game.channelId)
          .catch(() => null));
      if (ch) {
        const msg = await ch.messages.fetch(game.messageId).catch(() => null);
        if (msg) {
          await msg.delete().catch(() => {});
        }
        await mainChannel
          .send({ embeds: [buildTimeoutFindBotEmbed()] })
          .catch(() => {});
      }
    }
    await clearActiveGame(client, cfg);
  }, durationMs);

  const hintTimeout = await scheduleMinuteHint(
    client,
    targetChannel.id,
    durationMs,
    channelId,
  );

  activeGames.set(channelId, {
    type: "findBot",
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    channelId: targetChannel.id,
    messageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId,
  });

  await saveActiveGame(client, cfg, {
    type: "findBot",
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    targetChannelId: targetChannel.id,
    gameMessageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId,
  });

  markSent(channelId);

  return true;
}

async function safeStartGameByType(client, cfg, gameType) {
  try {
    if (gameType === "guessWord") return startGuessWordGame(client, cfg);
    if (gameType === "guessFlag") return startGuessFlagGame(client, cfg);
    if (gameType === "guessPlayer") return startGuessPlayerGame(client, cfg);
    if (gameType === "guessSong") return startGuessSongGame(client, cfg);
    if (gameType === "guessCapital") return startGuessCapitalGame(client, cfg);
    if (gameType === "guessRegionCapital")
      return startGuessRegionCapitalGame(client, cfg);
    if (gameType === "fastType") return startFastTypeGame(client, cfg);
    if (gameType === "guessTeam") return startGuessTeamGame(client, cfg);
    if (gameType === "guessSinger") return startGuessSingerGame(client, cfg);
    if (gameType === "guessAlbum") return startGuessAlbumGame(client, cfg);
    if (gameType === "hangman") return startHangmanGame(client, cfg);
    if (gameType === "italianGK") return startItalianGkGame(client, cfg);
    if (gameType === "drivingQuiz") return startDrivingQuizGame(client, cfg);
    if (gameType === "mathExpression")
      return startMathExpressionGame(client, cfg);
    if (gameType === "findBot") return startFindBotGame(client, cfg);
    if (gameType === "guessNumber") return startGuessNumberGame(client, cfg);
    return false;
  } catch (error) {
    global.logger.error(`[MINIGAMES] Start failed for ${gameType}:`, error);
    return false;
  }
}

async function maybeStartRandomGame(client, force = false) {
  const cfg = getConfig(client);
  if (!cfg?.enabled) return;
  if (!cfg.channelId) return;
  if (startingChannels.has(cfg.channelId)) return;
  startingChannels.add(cfg.channelId);
  try {
    if (activeGames.has(cfg.channelId)) {
      const game = activeGames.get(cfg.channelId);
      if (game?.endsAt && Date.now() >= game.endsAt) {
        if (game.timeout) clearTimeout(game.timeout);
        if (game.hintTimeout) clearTimeout(game.hintTimeout);
        activeGames.delete(cfg.channelId);
        await clearActiveGame(client, cfg);
      } else {
        return;
      }
    }

    const now = new Date();
    if (!force) {
      const windowStart = cfg?.timeWindow?.start;
      const windowEnd = cfg?.timeWindow?.end;
      if (!isWithinAllowedWindow(now, windowStart, windowEnd)) return;
      if (!canStartByInterval(cfg)) return;
      const readyByActivity = isReadyByActivity(cfg);
      const failsafeDue = isFailsafeDue(cfg);
      if (!readyByActivity && !failsafeDue) {
        standbyChannels.add(cfg.channelId);
        return;
      }
    }

    const channel =
      getChannelSafe(client, cfg.channelId) ||
      (await client.channels.fetch(cfg.channelId).catch(() => null));
    if (!channel) return;

    const available = getAvailableGameTypes(cfg);
    if (!available.length) return;
    const tried = new Set();
    let pending = pendingGames.get(cfg.channelId);

    while (tried.size < available.length) {
      const gameType = pending?.type || (await getNextGameType(client, cfg));
      if (!gameType) return;
      if (tried.has(gameType)) {
        pending = null;
        continue;
      }
      tried.add(gameType);

      const started = await safeStartGameByType(client, cfg, gameType);

      if (started) {
        pendingGames.delete(cfg.channelId);
        return;
      }
      await requeueGameType(client, cfg, gameType);
      pendingGames.delete(cfg.channelId);
      pending = null;
    }
  } finally {
    startingChannels.delete(cfg.channelId);
  }
}

function startMinigameLoop(client) {
  if (loopState.has(client)) return;
  loopState.add(client);

  const tick = async () => {
    const cfg = getConfig(client);
    if (!cfg?.enabled) return;
    if (!pendingGames.has(cfg.channelId)) {
      const type = await getNextGameType(client, cfg);
      if (!type) return;
      pendingGames.set(cfg.channelId, { type, createdAt: Date.now() });
    }
    await maybeStartRandomGame(client, false);
  };

  const cfg = getConfig(client);
  const intervalMs = Math.max(
    60 * 1000,
    Number(cfg?.intervalMs || 15 * 60 * 1000),
  );
  tick();
  setInterval(tick, intervalMs);
}

async function forceStartMinigame(client) {
  const cfg = getConfig(client);
  if (!cfg?.enabled) return;
  if (!cfg.channelId) return;
  if (activeGames.has(cfg.channelId)) return;
  const type = await getNextGameType(client, cfg);
  if (!type) return;
  pendingGames.set(cfg.channelId, { type, createdAt: Date.now() });
  await maybeStartRandomGame(client, true);
}

async function awardWinAndReply(message, rewardExp) {
  let nextTotal = Number(rewardExp || 0);
  const member =
    message.member ||
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  const ignoreExp = await shouldIgnoreExpForMember({
    guildId: message.guild.id,
    member,
    channelId: message.channel?.id || message.channelId || null,
  });
  try {
    const doc = await MinigameUser.findOneAndUpdate(
      { guildId: message.guild.id, userId: message.author.id },
      { $inc: { totalExp: Number(rewardExp || 0) } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    nextTotal = Number(doc?.totalExp || nextTotal);
  } catch {}
  if (!ignoreExp) {
    try {
      await addExpWithLevel(
        message.guild,
        message.author.id,
        Number(rewardExp || 0),
        false,
        false,
      );
    } catch {}
  }
  let reacted = false;
  try {
    await message.react(MINIGAME_WIN_EMOJI);
    reacted = true;
  } catch {}
  if (!reacted) {
    await message.react(MINIGAME_CORRECT_FALLBACK_EMOJI).catch(() => {});
  }
  await message
    .reply({ embeds: [buildWinEmbed(message.author.id, rewardExp, nextTotal)] })
    .catch(() => {});
  if (member) {
    await handleExpReward(message.client, member, nextTotal);
  }
  await clearActiveGame(message.client, getConfig(message.client));
}

async function handleMinigameMessage(message, client) {
  const cfg = getConfig(client);
  if (!cfg?.enabled) return false;
  if (!message?.guild) return false;
  if (message.author?.bot) return false;
  if (message.channelId !== cfg.channelId) return false;
  recordActivity(cfg.channelId, getActivityWindowMs(cfg));
  if (standbyChannels.has(cfg.channelId)) {
    if (canStartByInterval(cfg) && isReadyByActivity(cfg)) {
      const type = await getNextGameType(client, cfg);
      if (type)
        pendingGames.set(cfg.channelId, { type, createdAt: Date.now() });
      standbyChannels.delete(cfg.channelId);
      await maybeStartRandomGame(client, false);
    }
  }

  const game = activeGames.get(cfg.channelId);
  if (!game) return false;

  const content = String(message.content || "").trim();

  if (game.type === "guessNumber") {
    if (!/^\d+$/.test(content)) return false;
    const guess = Number(content);
    if (!Number.isFinite(guess)) return false;
    if (guess < game.min || guess > game.max) return false;

    if (guess === game.target) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await message.react("<a:VC_Events:1448688007438667796>").catch(() => {});
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }

    const range = Math.max(1, Number(game.max || 100) - Number(game.min || 1));
    const nearThreshold = Math.max(2, Math.round(range * 0.05));
    if (Math.abs(guess - game.target) <= nearThreshold) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    }

    await message
      .reply({ embeds: [buildHintEmbed(guess < game.target)] })
      .catch(() => {});
    return true;
  }

  if (game.type === "guessWord") {
    const guessCandidates = extractWordGuessCandidates(content);
    if (!guessCandidates.length) {
      return false;
    }

    if (guessCandidates.includes(game.target)) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    if (
      guessCandidates.some((candidate) =>
        isNearTextGuess(candidate, game.target, {
          maxDistance: 1,
          maxRatio: 0.25,
        }),
      )
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
      return false;
    }
    await message.react("<:vegax:1443934876440068179>").catch(() => {});
    return false;
  }

  if (game.type === "guessFlag") {
    if (
      isLooseAliasGuessCorrect(content, game.answers, normalizeCountryName, {
        minGuessLength: 4,
        minTokenLength: 3,
        singleTokenMinLength: 5,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    if (
      isNearTextGuess(content, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    }
    return false;
  }

  if (game.type === "guessPlayer") {
    if (
      isLooseAliasGuessCorrect(content, game.answers, normalizePlayerGuess, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    if (
      isNearTextGuess(content, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    }
    return false;
  }

  if (game.type === "guessSong") {
    const songAnswers = buildSongAnswerAliases(game.title);
    if (
      isSongGuessCorrect(content, songAnswers.length ? songAnswers : game.title)
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    if (
      isNearTextGuess(
        content,
        songAnswers.length ? songAnswers : [game.title],
        { maxDistance: 3, maxRatio: 0.25 },
      )
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    }
    return false;
  }

  if (game.type === "guessCapital") {
    if (
      isLooseAliasGuessCorrect(content, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    if (
      isNearTextGuess(content, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    }
    return false;
  }

  if (game.type === "guessRegionCapital") {
    if (
      isLooseAliasGuessCorrect(content, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    if (
      isNearTextGuess(content, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    }
    return false;
  }

  if (game.type === "fastType") {
    const normalizedContent = normalizeCountryName(
      normalizeUserAnswerText(content),
    );
    if (normalizedContent === game.normalizedPhrase) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    if (
      isNearTextGuess(normalizedContent, [game.normalizedPhrase], {
        maxDistance: 2,
        maxRatio: 0.2,
        minGuessLength: 6,
      })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    }
    return false;
  }

  if (game.type === "guessTeam") {
    if (
      isLooseAliasGuessCorrect(content, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 3,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    if (
      isNearTextGuess(content, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    }
    return false;
  }

  if (game.type === "guessSinger") {
    if (isSingerGuessCorrect(content, game.answers)) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    if (
      isNearTextGuess(content, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    }
    return false;
  }

  if (game.type === "guessAlbum") {
    if (isSongGuessCorrect(content, game.answers)) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    if (
      isNearTextGuess(content, game.answers, { maxDistance: 3, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    }
    return false;
  }

  if (game.type === "italianGK") {
    if (
      isLooseAliasGuessCorrect(content, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    if (
      isNearTextGuess(content, game.answers, {
        maxDistance: 2,
        maxRatio: 0.25,
        minGuessLength: 2,
      })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    }
    return false;
  }

  if (game.type === "drivingQuiz") {
    const guess = normalizeTruthValue(content);
    if (guess === null) return false;
    if (guess === game.answer) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    return false;
  }

  if (game.type === "mathExpression") {
    const guessNum = parseMathGuess(content);
    if (!Number.isFinite(guessNum)) return false;
    const answerNum = Number(String(game.answer).replace(",", "."));
    if (
      Number.isFinite(guessNum) &&
      Number.isFinite(answerNum) &&
      Math.abs(guessNum - answerNum) <= 0.01
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }
    if (
      Number.isFinite(guessNum) &&
      Number.isFinite(answerNum) &&
      Math.abs(guessNum - answerNum) <= 1
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    }
    return false;
  }

  if (game.type === "hangman") {
    const normalized = normalizeCountryName(normalizeUserAnswerText(content));
    if (!normalized) return false;

    if (normalized === game.word) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }

    if (
      normalized.length > 1 &&
      isNearTextGuess(normalized, [game.word], {
        maxDistance: 2,
        maxRatio: 0.28,
        minGuessLength: 4,
      })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    }

    const letter = normalized.length === 1 ? normalized : null;
    if (!letter || !/^[a-z0-9]$/.test(letter)) return false;
    const guessed = new Set(
      Array.isArray(game.guessedLetters) ? game.guessedLetters : [],
    );
    if (guessed.has(letter)) return false;
    guessed.add(letter);
    game.guessedLetters = Array.from(guessed.values());
    const isCorrectLetter = game.word.includes(letter);
    if (!isCorrectLetter) {
      game.misses = Number(game.misses || 0) + 1;
    } else {
      await message.react(MINIGAME_CORRECT_FALLBACK_EMOJI).catch(() => {});
    }

    const solved = game.word.split("").every((ch) => guessed.has(ch));
    if (solved) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp);
      return true;
    }

    if (Number(game.misses || 0) >= Number(game.maxMisses || 7)) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await message.channel
        .send({ embeds: [buildTimeoutHangmanEmbed(game.word)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
      return true;
    }

    const maskedWord = maskHangmanWord(game.word, guessed);
    const hangmanUpdateAttachment = buildPromptImageAttachment(
      "Impiccato",
      [
        maskedWord,
        `Errori: ${Number(game.misses || 0)}/${Number(game.maxMisses || 7)}`,
      ],
      "hangman",
    );
    const hangmanUpdateEmbed = buildHangmanEmbed(
      maskedWord,
      Number(game.misses || 0),
      Number(game.maxMisses || 7),
      game.rewardExp,
      Math.max(1000, game.endsAt - Date.now()),
    );
    if (hangmanUpdateAttachment) {
      hangmanUpdateEmbed.setImage(`attachment://${hangmanUpdateAttachment.name}`);
    }
    await message.channel
      .send({
        embeds: [hangmanUpdateEmbed],
        files: hangmanUpdateAttachment ? [hangmanUpdateAttachment] : [],
      })
      .catch(() => {});
    await saveActiveGame(client, cfg, {
      type: "hangman",
      target: JSON.stringify({
        word: game.word,
        guessedLetters: game.guessedLetters,
        misses: Number(game.misses || 0),
        maxMisses: Number(game.maxMisses || 7),
      }),
      rewardExp: Number(game.rewardExp || 0),
      startedAt: new Date(game.startedAt || Date.now()),
      endsAt: new Date(game.endsAt || Date.now()),
      gameMessageId: game.gameMessageId || null,
    });
    return true;
  }

  return false;
}

async function handleMinigameButton(interaction, client) {
  if (!interaction?.isButton?.()) return false;
  const cfg = getConfig(client);
  if (!cfg?.enabled) return false;
  const game = activeGames.get(cfg.channelId);
  if (interaction.customId.startsWith("minigame_song_preview:")) {
    if (
      !game ||
      game.type !== "guessSong" ||
      interaction.customId !== game.previewCustomId
    ) {
      await interaction
        .reply({ content: "Anteprima non disponibile.", flags: 1 << 6 })
        .catch(() => {});
      return true;
    }
    await interaction.deferReply({ flags: 1 << 6 }).catch(() => {});
    if (!game.previewUrl) {
      await interaction
        .editReply({ content: "Anteprima non disponibile." })
        .catch(() => {});
      return true;
    }
    const audio = await fetchAudioAttachment(game.previewUrl);
    if (!audio) {
      await interaction
        .editReply({
          content: `Non riesco ad allegare il file, ascoltala qui:\n${game.previewUrl}`,
        })
        .catch(() => {});
      return true;
    }
    await interaction
      .editReply({
        files: [new AttachmentBuilder(audio, { name: "anteprima.m4a" })],
      })
      .catch(() => {});
    return true;
  }
  if (!game || game.type !== "findBot") return false;
  if (interaction.customId !== game.customId) return false;

  clearTimeout(game.timeout);
  if (game.hintTimeout) clearTimeout(game.hintTimeout);
  activeGames.delete(cfg.channelId);

  const rewardExp = game.rewardExp;
  let nextTotal = Number(rewardExp || 0);
  try {
    const doc = await MinigameUser.findOneAndUpdate(
      { guildId: interaction.guild.id, userId: interaction.user.id },
      { $inc: { totalExp: Number(rewardExp || 0) } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    nextTotal = Number(doc?.totalExp || nextTotal);
  } catch {}
  try {
    await addExpWithLevel(
      interaction.guild,
      interaction.user.id,
      Number(rewardExp || 0),
      false,
      false,
    );
  } catch {}

  const winEmbed = buildWinEmbed(interaction.user.id, rewardExp, nextTotal);
  const mainChannel =
    getChannelSafe(interaction.client, cfg.channelId) ||
    (await interaction.client.channels.fetch(cfg.channelId).catch(() => null));
  if (mainChannel) {
    await mainChannel.send({ embeds: [winEmbed] }).catch(() => {});
  }
  await interaction
    .reply({ content: "Hai vinto!", flags: 1 << 6 })
    .catch(() => {});
  const member =
    interaction.member ||
    (await interaction.guild.members
      .fetch(interaction.user.id)
      .catch(() => null));
  if (member) {
    await handleExpReward(interaction.client, member, nextTotal);
  }
  await clearActiveGame(interaction.client, cfg);

  try {
    const channel = interaction.channel;
    const message = await channel.messages
      .fetch(game.messageId)
      .catch(() => null);
    if (message) {
      await message.delete().catch(() => {});
    }
  } catch {}

  return true;
}

async function restoreActiveGames(client) {
  const cfg = getConfig(client);
  if (!cfg?.enabled || !cfg.channelId) return;
  const channel =
    getChannelSafe(client, cfg.channelId) ||
    (await client.channels.fetch(cfg.channelId).catch(() => null));
  const guildId = channel?.guild?.id || null;
  if (!guildId) return;
  await loadRotationState(client, cfg);
  const state = await MinigameState.findOne({
    guildId,
    channelId: cfg.channelId,
  })
    .lean()
    .catch(() => null);
  if (!state) return;
  const now = Date.now();
  const endsAt = new Date(state.endsAt).getTime();
  if (endsAt <= now) {
    if (state.type === "guessNumber") {
      await channel
        .send({ embeds: [buildTimeoutNumberEmbed(Number(state.target))] })
        .catch(() => {});
    } else if (state.type === "guessWord") {
      await channel
        .send({ embeds: [buildTimeoutWordEmbed(String(state.target))] })
        .catch(() => {});
    } else if (state.type === "guessFlag") {
      let name = "la bandiera";
      try {
        const parsed = JSON.parse(state.target || "{}");
        name = parsed?.displayName || name;
      } catch {}
      await channel
        .send({ embeds: [buildTimeoutFlagEmbed(name)] })
        .catch(() => {});
    } else if (state.type === "guessPlayer") {
      let name = "il calciatore";
      try {
        const parsed = JSON.parse(state.target || "{}");
        name = parsed?.name || name;
      } catch {}
      await channel
        .send({ embeds: [buildTimeoutPlayerEmbed(name)] })
        .catch(() => {});
    } else if (state.type === "guessSong") {
      let title = "la canzone";
      let artist = "";
      try {
        const parsed = JSON.parse(state.target || "{}");
        title = parsed?.title || title;
        artist = parsed?.artist || "";
      } catch {}
      await channel
        .send({ embeds: [buildTimeoutSongEmbed(title, artist)] })
        .catch(() => {});
    } else if (state.type === "guessCapital") {
      let country = "nazione sconosciuta";
      let displayAnswer = "sconosciuta";
      try {
        const parsed = JSON.parse(state.target || "{}");
        country = parsed?.country || country;
        displayAnswer =
          parsed?.displayAnswer || parsed?.answers?.[0] || displayAnswer;
      } catch {}
      await channel
        .send({ embeds: [buildTimeoutCapitalEmbed(country, displayAnswer)] })
        .catch(() => {});
    } else if (state.type === "guessRegionCapital") {
      let region = "regione sconosciuta";
      let displayAnswer = "sconosciuto";
      try {
        const parsed = JSON.parse(state.target || "{}");
        region = parsed?.region || region;
        displayAnswer =
          parsed?.displayAnswer || parsed?.answers?.[0] || displayAnswer;
      } catch {}
      await channel
        .send({
          embeds: [buildTimeoutRegionCapitalEmbed(region, displayAnswer)],
        })
        .catch(() => {});
    } else if (state.type === "fastType") {
      let phrase = "frase sconosciuta";
      try {
        const parsed = JSON.parse(state.target || "{}");
        phrase = parsed?.phrase || phrase;
      } catch {}
      await channel
        .send({ embeds: [buildTimeoutFastTypeEmbed(phrase)] })
        .catch(() => {});
    } else if (state.type === "guessTeam") {
      let team = "squadra sconosciuta";
      try {
        const parsed = JSON.parse(state.target || "{}");
        team = parsed?.team || team;
      } catch {}
      await channel
        .send({ embeds: [buildTimeoutTeamEmbed(team)] })
        .catch(() => {});
    } else if (state.type === "guessSinger") {
      let name = "cantante sconosciuto";
      try {
        const parsed = JSON.parse(state.target || "{}");
        name = parsed?.name || name;
      } catch {}
      await channel
        .send({ embeds: [buildTimeoutSingerEmbed(name)] })
        .catch(() => {});
    } else if (state.type === "guessAlbum") {
      let album = "album sconosciuto";
      let artist = "artista sconosciuto";
      try {
        const parsed = JSON.parse(state.target || "{}");
        album = parsed?.album || album;
        artist = parsed?.artist || artist;
      } catch {}
      await channel
        .send({ embeds: [buildTimeoutAlbumEmbed(album, artist)] })
        .catch(() => {});
    } else if (state.type === "hangman") {
      let word = "parola sconosciuta";
      try {
        const parsed = JSON.parse(state.target || "{}");
        word = parsed?.word || word;
      } catch {}
      await channel
        .send({ embeds: [buildTimeoutHangmanEmbed(word)] })
        .catch(() => {});
    } else if (state.type === "italianGK") {
      let displayAnswer = "sconosciuta";
      try {
        const parsed = JSON.parse(state.target || "{}");
        displayAnswer =
          parsed?.displayAnswer || parsed?.answers?.[0] || displayAnswer;
      } catch {}
      await channel
        .send({ embeds: [buildTimeoutItalianGkEmbed(displayAnswer)] })
        .catch(() => {});
    } else if (state.type === "drivingQuiz") {
      let answer = false;
      try {
        const parsed = JSON.parse(state.target || "{}");
        answer = Boolean(parsed?.answer);
      } catch {}
      await channel
        .send({ embeds: [buildTimeoutDrivingQuizEmbed(answer)] })
        .catch(() => {});
    } else if (state.type === "mathExpression") {
      let answer = "0";
      try {
        const parsed = JSON.parse(state.target || "{}");
        answer = String(parsed?.answer || answer);
      } catch {}
      await channel
        .send({ embeds: [buildTimeoutMathEmbed(answer)] })
        .catch(() => {});
    } else if (state.type === "findBot") {
      await channel
        .send({ embeds: [buildTimeoutFindBotEmbed()] })
        .catch(() => {});
      const targetChannel =
        channel.guild.channels.cache.get(state.targetChannelId) ||
        (await channel.guild.channels
          .fetch(state.targetChannelId)
          .catch(() => null));
      if (targetChannel && state.gameMessageId && state.customId) {
        const msg = await targetChannel.messages
          .fetch(state.gameMessageId)
          .catch(() => null);
        if (msg) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(state.customId)
              .setLabel("trova il bot")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
          );
          await msg.edit({ components: [row] }).catch(() => {});
        }
      }
    }
    await MinigameState.deleteOne({ guildId, channelId: cfg.channelId }).catch(
      () => {},
    );
    return;
  }
  const remainingMs = endsAt - now;
  if (state.type === "guessNumber") {
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel
        .send({ embeds: [buildTimeoutNumberEmbed(game.target)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: "guessNumber",
      target: Number(state.target),
      min: Number(state.min),
      max: Number(state.max),
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessWord") {
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel
        .send({ embeds: [buildTimeoutWordEmbed(game.target)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: "guessWord",
      target: String(state.target || "").toLowerCase(),
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessFlag") {
    const parsed = parseStateTarget(state.target);
    const answers = Array.isArray(parsed?.names) ? parsed.names : [];
    const displayName = parsed?.displayName || "la bandiera";
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      await channel
        .send({ embeds: [buildTimeoutFlagEmbed(game.displayName)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    const hintTimeout = await scheduleGenericHint(
      client,
      cfg.channelId,
      remainingMs,
      `La nazione ha **${normalizeCountryName(displayName).replace(/\s+/g, "").length}** lettere. ${buildMaskedTextHint(displayName)}`,
    );
    activeGames.set(cfg.channelId, {
      type: "guessFlag",
      answers,
      displayName,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessPlayer") {
    const parsed = parseStateTarget(state.target);
    const name = parsed?.name || "il calciatore";
    const team = parsed?.team || "Squadra sconosciuta";
    const nationality = parsed?.nationality || "Nazionalità sconosciuta";
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      await channel
        .send({ embeds: [buildTimeoutPlayerEmbed(game.displayName)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    const hintTimeout = await scheduleGenericHint(
      client,
      cfg.channelId,
      remainingMs,
      `${team} • ${nationality} • ${buildMaskedTextHint(name)}`,
    );
    activeGames.set(cfg.channelId, {
      type: "guessPlayer",
      answers: buildPlayerAnswerAliases(name, parsed?.aliases),
      fullAnswer: normalizePlayerGuess(name),
      displayName: name,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessSong") {
    const parsed = parseStateTarget(state.target);
    const title = parsed?.title || "la canzone";
    const artist = parsed?.artist || "";
    const artistCountry = parsed?.artistCountry || "Nazionalità sconosciuta";
    const genre = parsed?.genre || "Genere sconosciuto";
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      await channel
        .send({ embeds: [buildTimeoutSongEmbed(game.title, game.artist)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    const hintTimeout = await scheduleGenericHint(
      client,
      cfg.channelId,
      remainingMs,
      `${artistCountry} • ${genre} • ${buildMaskedTextHint(title)}`,
    );
    activeGames.set(cfg.channelId, {
      type: "guessSong",
      title,
      artist,
      previewUrl: parsed?.previewUrl || null,
      previewCustomId: state.customId || null,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessCapital") {
    const parsed = parseStateTarget(state.target);
    const country = parsed?.country || "nazione sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || answers[0] || "sconosciuta";
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel
        .send({
          embeds: [buildTimeoutCapitalEmbed(game.country, game.displayAnswer)],
        })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: "guessCapital",
      country,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessRegionCapital") {
    const parsed = parseStateTarget(state.target);
    const region = parsed?.region || "regione sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || answers[0] || "sconosciuto";
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel
        .send({
          embeds: [
            buildTimeoutRegionCapitalEmbed(game.region, game.displayAnswer),
          ],
        })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: "guessRegionCapital",
      region,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "fastType") {
    const parsed = parseStateTarget(state.target);
    const phrase = parsed?.phrase || "";
    const normalizedPhrase =
      parsed?.normalizedPhrase || normalizeCountryName(phrase);
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel
        .send({ embeds: [buildTimeoutFastTypeEmbed(game.phrase)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: "fastType",
      phrase,
      normalizedPhrase,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessTeam") {
    const parsed = parseStateTarget(state.target);
    const team = parsed?.team || "squadra sconosciuta";
    const answers = Array.isArray(parsed?.answers)
      ? parsed.answers
      : buildAliases([team]);
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel
        .send({ embeds: [buildTimeoutTeamEmbed(game.team)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: "guessTeam",
      team,
      answers,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessSinger") {
    const parsed = parseStateTarget(state.target);
    const name = parsed?.name || "cantante sconosciuto";
    const answers = Array.isArray(parsed?.answers)
      ? parsed.answers
      : buildAliases([name]);
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel
        .send({ embeds: [buildTimeoutSingerEmbed(game.name)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: "guessSinger",
      name,
      answers,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessAlbum") {
    const parsed = parseStateTarget(state.target);
    const album = parsed?.album || "album sconosciuto";
    const artist = parsed?.artist || "artista sconosciuto";
    const answers = Array.isArray(parsed?.answers)
      ? parsed.answers
      : buildAliases([album]);
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel
        .send({ embeds: [buildTimeoutAlbumEmbed(game.album, game.artist)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: "guessAlbum",
      album,
      artist,
      answers,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "hangman") {
    const parsed = parseStateTarget(state.target);
    const word = normalizeCountryName(parsed?.word || "");
    const guessedLetters = Array.isArray(parsed?.guessedLetters)
      ? parsed.guessedLetters
      : [];
    const misses = Number(parsed?.misses || 0);
    const maxMisses = Number(parsed?.maxMisses || 7);
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel
        .send({ embeds: [buildTimeoutHangmanEmbed(game.word)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: "hangman",
      word,
      guessedLetters,
      misses,
      maxMisses,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "italianGK") {
    const parsed = parseStateTarget(state.target);
    const question = parsed?.question || "Domanda";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || answers[0] || "sconosciuta";
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel
        .send({ embeds: [buildTimeoutItalianGkEmbed(game.displayAnswer)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: "italianGK",
      question,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "drivingQuiz") {
    const parsed = parseStateTarget(state.target);
    const statement = parsed?.statement || "";
    const answer = Boolean(parsed?.answer);
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel
        .send({ embeds: [buildTimeoutDrivingQuizEmbed(game.answer)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: "drivingQuiz",
      statement,
      answer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "mathExpression") {
    const parsed = parseStateTarget(state.target);
    const expression = parsed?.expression || "";
    const answer = String(parsed?.answer || "0");
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      activeGames.delete(cfg.channelId);
      await channel
        .send({ embeds: [buildTimeoutMathEmbed(game.answer)] })
        .catch(() => {});
      await clearActiveGame(client, cfg);
    }, remainingMs);
    activeGames.set(cfg.channelId, {
      type: "mathExpression",
      expression,
      answer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "findBot") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(state.customId)
        .setLabel("trova il bot")
        .setStyle(ButtonStyle.Primary),
    );
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game || game.customId !== state.customId) return;
      activeGames.delete(cfg.channelId);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      if (game.channelId && game.messageId) {
        const ch =
          channel.guild.channels.cache.get(game.channelId) ||
          (await channel.guild.channels
            .fetch(game.channelId)
            .catch(() => null));
        if (ch) {
          const msg = await ch.messages.fetch(game.messageId).catch(() => null);
          if (msg) {
            const disabledRow = new ActionRowBuilder().addComponents(
              ButtonBuilder.from(row.components[0]).setDisabled(true),
            );
            await msg.edit({ components: [disabledRow] }).catch(() => {});
          }
          await channel
            .send({ embeds: [buildTimeoutFindBotEmbed()] })
            .catch(() => {});
        }
      }
      await clearActiveGame(client, cfg);
    }, remainingMs);
    const hintTimeout = await scheduleMinuteHint(
      client,
      state.targetChannelId,
      remainingMs,
      cfg.channelId,
    );
    activeGames.set(cfg.channelId, {
      type: "findBot",
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      channelId: state.targetChannelId,
      messageId: state.gameMessageId || null,
      mainMessageId: state.mainMessageId || null,
      customId: state.customId,
    });
  }
}

module.exports = {
  startMinigameLoop,
  forceStartMinigame,
  restoreActiveGames,
  handleMinigameMessage,
  handleMinigameButton,
};
