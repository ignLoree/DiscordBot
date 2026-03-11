const axios = require("axios");
const MINIGAME_429_THROTTLE_MS = 60 * 1000;
const MINIGAME_403_THROTTLE_MS = 60 * 1000;
let last429LogAt = 0;
let last403LogAt = 0;
function warnMinigame(err) {
  const msg = err?.message || err?.response?.data || String(err);
  const status = err?.response?.status;
  const is429 = status === 429 || (typeof msg === "string" && msg.includes("429"));
  const is403 = status === 403 || (typeof msg === "string" && msg.includes("403"));
  const now = Date.now();
  if (is429 && now - last429LogAt < MINIGAME_429_THROTTLE_MS) return;
  if (is429) last429LogAt = now;
  if (is403 && now - last403LogAt < MINIGAME_403_THROTTLE_MS) return;
  if (is403) last403LogAt = now;
  const logMsg = is403 ? `${msg} (API 403 Forbidden: chiave/permessi o IP bloccato)` : msg;
  global.logger?.warn?.("[minigameService] ", logMsg);
}
const canvasModule = require("canvas");
const { createCanvas, loadImage } = canvasModule;
const { registerCanvasFonts, fontStackPrimaryOnly } = require("../../Utils/Render/canvasFonts");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, AttachmentBuilder, } = require("discord.js");
const { MinigameUser, MinigameState, MinigameRotation, } = require("../../Schemas/Minigames/minigameSchema");
const { addExpWithLevel, shouldIgnoreExpForMember } = require("../Community/expService");
const IDs = require("../../Utils/Config/ids");
const { getClientChannelCached, getGuildMemberCached, } = require("../../Utils/Interaction/interactionEntityCache");
const {
  getGuessYearBank,
  getCompleteVerseBank,
  getGuessEmojiBank,
  getQuoteFilmBank,
  getProverbBank,
  getSynonymAntonymBank,
  getGuessCityBank,
  getCapitalQuizBank,
  getItalianRegionCapitalBank,
  getItalianGkBank,
  getDrivingTrueFalseBank,
  getDrivingMultipleChoiceBank,
  getDrivingSignQuestions,
  getFastTypingPhrases,
  getHangmanWords,
  CAPITAL_ITALIAN,
  CAPITAL_COUNTRY_REGION,
  REGION_AREA,
  REGION_HINT_DATA,
  FAMOUS_CAPITAL_COUNTRIES,
  FLAG_WELL_KNOWN_COUNTRIES,
} = require("../../Data/Minigames/minigameBanks");
const activeGames = new Map();
const pendingGames = new Map();
const loopState = new WeakSet();
const loopIntervals = new WeakMap();
let rotationDate = null;
let rotationQueue = [];
const recentMessages = new Map();
const standbyChannels = new Set();
const lastSentAtByChannel = new Map();
const lastNoParticipationEndAtByChannel = new Map();
const LAST_PLAYED_ROTATION_SIZE = 3;
const GAME_TYPE_COOLDOWN_MS = 30 * 60 * 1000;
const lastPlayedGameTypesByChannel = new Map();
const lastPlayedAtByChannelAndType = new Map();
const startingChannels = new Set();
const recentQuestionKeysByChannel = new Map();
const REWARD_CHANNEL_ID = IDs.channels.commands;
const MINIGAME_WIN_EMOJI = "<a:VC_Events:1448688007438667796>";
const MINIGAME_CORRECT_FALLBACK_EMOJI = "\u2714";
const MINIGAME_WRONG_EMOJI = "<a:VC_Cross:1448671102355116052>";

const CANVAS_STYLE = {
  bgGradStart: "#2c2419",
  bgGradEnd: "#1a1510",
  cardFill: "rgba(247, 241, 232, 0.96)",
  cardStroke: "rgba(111, 78, 55, 0.5)",
  titleColor: "#8b7355",
  bodyColor: "#2c2419",
  padding: 44,
  radius: 22,
};

const EXP_REWARDS = [{ exp: 100, roleId: IDs.roles.Initiate }, { exp: 500, roleId: IDs.roles.Rookie }, { exp: 1000, roleId: IDs.roles.Scout }, { exp: 1500, roleId: IDs.roles.Explorer }, { exp: 2500, roleId: IDs.roles.Tracker }, { exp: 5000, roleId: IDs.roles.Achiever }, { exp: 10000, roleId: IDs.roles.Vanguard }, { exp: 50000, roleId: IDs.roles.Mentor }, { exp: 100000, roleId: IDs.roles.Strategist },];
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
let cachedLeaguePlayers = null;
let cachedLeaguePlayersAt = 0;
const LEAGUE_PLAYER_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
let cachedSingers = null;
let cachedSingersAt = 0;
const SINGER_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const singerImageFallbackCache = new Map();
const SINGER_IMAGE_FALLBACK_TTL_MS = 24 * 60 * 60 * 1000;
let cachedAlbums = null;
let cachedAlbumsAt = 0;
const ALBUM_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const DEFAULT_FOOTBALL_LEAGUES = ["Italian Serie A", "English Premier League", "Spanish La Liga", "German Bundesliga", "French Ligue 1", "Dutch Eredivisie", "Belgian Pro League", "Portuguese Primeira Liga", "Saudi Pro League", "Turkish Super Lig", "Italian Serie B", "English League Championship", "American Major League Soccer",];

/** Nomi italiani e soprannomi per le squadre (chiave = normalizeCountryName(strTeam)). */
function getTeamItalianMap() {
  const k = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const entries = [
    { keys: ["olympique marseille", "marseille"], display: "Marsiglia", extra: ["OM"] },
    { keys: ["juventus"], display: "Juventus", extra: ["Juve", "Juve FC", "Bianconeri"] },
    { keys: ["inter", "inter milan", "internazionale"], display: "Inter", extra: ["Internazionale", "Nerazzurri"] },
    { keys: ["ac milan", "milan"], display: "Milan", extra: ["AC Milan", "Rossoneri"] },
    { keys: ["napoli", "ssc napoli", "naples"], display: "Napoli", extra: ["Partenopei"] },
    { keys: ["roma", "as roma"], display: "Roma", extra: ["AS Roma", "Giallorossi"] },
    { keys: ["lazio", "ss lazio"], display: "Lazio", extra: ["SS Lazio", "Biancocelesti"] },
    { keys: ["atalanta", "atalanta bc", "atalanta bergamasca calcio"], display: "Atalanta", extra: ["Dea", "Nerazzurri"] },
    { keys: ["fiorentina", "acf fiorentina"], display: "Fiorentina", extra: ["Viola", "ACF Fiorentina"] },
    { keys: ["bologna", "bologna fc"], display: "Bologna", extra: ["Bologna FC", "Felsinei"] },
    { keys: ["torino", "torino fc"], display: "Torino", extra: ["Torino FC", "Granata"] },
    { keys: ["genoa", "genoa cfc"], display: "Genoa", extra: ["Genoa CFC", "Grifone"] },
    { keys: ["sampdoria", "uc sampdoria"], display: "Sampdoria", extra: ["Samp", "UC Sampdoria"] },
    { keys: ["cagliari", "cagliari calcio"], display: "Cagliari", extra: ["Rossoblù"] },
    { keys: ["udinese", "udinese calcio"], display: "Udinese", extra: ["Udinese Calcio"] },
    { keys: ["sassuolo", "us sassuolo"], display: "Sassuolo", extra: ["US Sassuolo"] },
    { keys: ["empoli", "empoli fc"], display: "Empoli", extra: ["Empoli FC"] },
    { keys: ["verona", "hellas verona", "verona fc"], display: "Verona", extra: ["Hellas Verona", "Gialloblù"] },
    { keys: ["lecce", "us lecce"], display: "Lecce", extra: ["US Lecce", "Giallorossi"] },
    { keys: ["frosinone", "frosinone calcio"], display: "Frosinone", extra: ["Frosinone Calcio"] },
    { keys: ["salernitana", "us salernitana"], display: "Salernitana", extra: ["US Salernitana"] },
    { keys: ["monza", "ac monza"], display: "Monza", extra: ["AC Monza", "Brianzoli"] },
    { keys: ["real madrid", "real madrid cf"], display: "Real Madrid", extra: ["Madrid", "Real", "Merengues"] },
    { keys: ["barcelona", "fc barcelona", "fc barcelona b"], display: "Barcellona", extra: ["Barcelona", "Barça", "Barca", "Blaugrana"] },
    { keys: ["atletico madrid", "atlético madrid", "club atletico de madrid"], display: "Atletico Madrid", extra: ["Atlético", "Atletico", "Colchoneros"] },
    { keys: ["sevilla", "sevilla fc"], display: "Siviglia", extra: ["Sevilla", "Sevilla FC"] },
    { keys: ["real betis", "real betis balompie"], display: "Real Betis", extra: ["Betis", "Real Betis"] },
    { keys: ["villarreal", "villarreal cf"], display: "Villarreal", extra: ["Villarreal CF", "Submarino Amarillo"] },
    { keys: ["valencia", "valencia cf"], display: "Valencia", extra: ["Valencia CF", "Che"] },
    { keys: ["real sociedad", "real sociedad de futbol"], display: "Real Sociedad", extra: ["Real Sociedad", "La Real"] },
    { keys: ["athletic bilbao", "athletic club", "athletic club bilbao"], display: "Athletic Bilbao", extra: ["Athletic", "Bilbao", "Leones"] },
    { keys: ["bayern munich", "fc bayern munich", "fc bayern münchen"], display: "Bayern Monaco", extra: ["Bayern", "Bayern Munich", "FC Bayern"] },
    { keys: ["borussia dortmund", "bv borussia dortmund"], display: "Borussia Dortmund", extra: ["Dortmund", "BVB", "Borussia"] },
    { keys: ["rb leipzig", "rasenballsport leipzig"], display: "RB Lipsia", extra: ["Leipzig", "RB Leipzig"] },
    { keys: ["bayer leverkusen", "bayer 04 leverkusen"], display: "Bayer Leverkusen", extra: ["Leverkusen", "Bayer"] },
    { keys: ["eintracht frankfurt", "eintracht frankfurt e v"], display: "Eintracht Francoforte", extra: ["Eintracht Frankfurt", "Frankfurt", "SGE"] },
    { keys: ["vfl wolfsburg", "vfl wolfsburg"], display: "Wolfsburg", extra: ["VfL Wolfsburg"] },
    { keys: ["paris saint germain", "paris saint-germain", "paris sg", "psg"], display: "Paris Saint-Germain", extra: ["PSG", "Paris SG", "Parigi"] },
    { keys: ["olympique lyonnais", "lyon"], display: "Olympique Lione", extra: ["Lione", "OL", "Lyon"] },
    { keys: ["lille", "lille osc", "losc lille"], display: "Lille", extra: ["Lille OSC", "LOSC"] },
    { keys: ["monaco", "as monaco", "as monaco fc"], display: "Monaco", extra: ["AS Monaco", "Monaco FC"] },
    { keys: ["rennes", "stade rennais", "stade rennais fc 1901"], display: "Rennes", extra: ["Stade Rennes", "Stade Rennais"] },
    { keys: ["manchester united", "manchester united fc"], display: "Manchester United", extra: ["United", "Man United", "Man Utd", "Red Devils"] },
    { keys: ["manchester city", "manchester city fc"], display: "Manchester City", extra: ["City", "Man City", "Citizens"] },
    { keys: ["liverpool", "liverpool fc"], display: "Liverpool", extra: ["Liverpool FC", "Reds"] },
    { keys: ["arsenal", "arsenal fc"], display: "Arsenal", extra: ["Arsenal FC", "Gunners"] },
    { keys: ["chelsea", "chelsea fc"], display: "Chelsea", extra: ["Chelsea FC", "Blues"] },
    { keys: ["tottenham hotspur", "tottenham"], display: "Tottenham", extra: ["Spurs", "Tottenham Hotspur"] },
    { keys: ["newcastle united", "newcastle united fc"], display: "Newcastle", extra: ["Newcastle United", "Magpies"] },
    { keys: ["west ham united", "west ham"], display: "West Ham", extra: ["West Ham United", "Hammers"] },
    { keys: ["brighton and hove albion", "brighton"], display: "Brighton", extra: ["Brighton & Hove Albion", "Seagulls"] },
    { keys: ["aston villa", "aston villa fc"], display: "Aston Villa", extra: ["Villa", "Villans"] },
    { keys: ["crystal palace", "crystal palace fc"], display: "Crystal Palace", extra: ["Palace", "Eagles"] },
    { keys: ["fulham", "fulham fc"], display: "Fulham", extra: ["Fulham FC"] },
    { keys: ["wolverhampton wanderers", "wolves", "wolverhampton"], display: "Wolverhampton", extra: ["Wolves", "Wanderers"] },
    { keys: ["everton", "everton fc"], display: "Everton", extra: ["Everton FC", "Toffees"] },
    { keys: ["nottingham forest", "nottingham forest fc"], display: "Nottingham Forest", extra: ["Forest", "Nott'm Forest"] },
    { keys: ["brentford", "brentford fc"], display: "Brentford", extra: ["Brentford FC", "Bees"] },
    { keys: ["ajax", "afc ajax", "ajax amsterdam"], display: "Ajax", extra: ["AFC Ajax", "Ajax Amsterdam"] },
    { keys: ["psv", "psv eindhoven"], display: "PSV Eindhoven", extra: ["PSV", "Eindhoven"] },
    { keys: ["feyenoord", "feyenoord rotterdam"], display: "Feyenoord", extra: ["Feyenoord Rotterdam"] },
    { keys: ["benfica", "sl benfica", "sport lisboa e benfica"], display: "Benfica", extra: ["SL Benfica", "Águias"] },
    { keys: ["porto", "fc porto", "fc porto porto"], display: "Porto", extra: ["FC Porto", "Dragões"] },
    { keys: ["sporting lisbon", "sporting cp", "sporting clube de portugal"], display: "Sporting Lisbona", extra: ["Sporting", "Sporting CP", "Leões"] },
    { keys: ["celtic", "celtic fc"], display: "Celtic", extra: ["Celtic FC", "Bhoys"] },
    { keys: ["rangers", "rangers fc"], display: "Rangers", extra: ["Rangers FC"] },
    { keys: ["galatasaray", "galatasaray sk"], display: "Galatasaray", extra: ["Galatasaray SK", "Cim-Bom"] },
    { keys: ["fenerbahce", "fenerbahçe", "fenerbahce sk"], display: "Fenerbahçe", extra: ["Fenerbahce", "Fener"] },
    { keys: ["besiktas", "beşiktaş", "besiktas jk"], display: "Beşiktaş", extra: ["Besiktas", "Kara Kartallar"] },
    { keys: ["al nassr", "al-nassr"], display: "Al-Nassr", extra: ["Al Nassr", "Nassr"] },
    { keys: ["al hilal", "al-hilal", "al hilal saud fc"], display: "Al-Hilal", extra: ["Al Hilal", "Hilal"] },
  ];
  const map = new Map();
  for (const { keys, display, extra } of entries) {
    const aliasList = Array.isArray(extra) ? extra : [];
    for (const key of keys) {
      const n = k(key);
      if (n) map.set(n, { display, extraAliases: aliasList });
    }
  }
  return map;
}

const TEAM_ITALIAN_MAP = getTeamItalianMap();
const DEFAULT_FAST_TYPE_API_URLS = ["https://api.quotable.io/random", "https://zenquotes.io/api/random",];
const DEFAULT_MAX_FAST_TYPE_PHRASE_LENGTH = 180;
const DEFAULT_DRIVING_QUIZ_API_URL = "https://opentdb.com/api.php?amount=5&category=28&encode=url3986";
const MYMEMORY_MAX_CHARS = 450;
const MYMEMORY_BASE = "https://api.mymemory.translated.net/get";
const ITALIAN_GK_DEFAULT_CATEGORIES = ["cultura-generale", "storia", "geografia", "scienza", "arte", "musica", "sport", "letteratura", "cinema", "tecnologia",];
const MINIGAME_FIXED_TIMEZONE = "Europe/Rome";
const MINIGAME_FIRST_HOUR = 8;
const MINIGAME_LAST_HOUR = 23;
const MINIGAME_LAST_MINUTE = 45;
const MINIGAME_SLOT_MINUTES = [0, 15, 30, 45];
let lastMinigameSlotKey = null;

/**
 * Traduce un testo in italiano (en -> it) tramite MyMemory.
 * Se translateApiToItalian è false in config, non chiamare.
 * @param {string} text - Testo da tradurre (es. da API inglese)
 * @param {{ translateApiToItalian?: boolean }} [cfg] - Config (minigames); se translateApiToItalian === false ritorna il testo originale
 * @returns {Promise<string>} Testo tradotto o originale in caso di errore/disabled
 */
async function translateToItalian(text, cfg = {}) {
  if (cfg?.translateApiToItalian === false) return String(text || "").trim();
  const raw = String(text || "").trim();
  if (!raw) return raw;

  const chunks = [];
  let rest = raw;
  while (rest.length > MYMEMORY_MAX_CHARS) {
    const slice = rest.slice(0, MYMEMORY_MAX_CHARS);
    const lastDot = slice.lastIndexOf(".");
    const splitAt = lastDot >= 0 ? lastDot + 1 : MYMEMORY_MAX_CHARS;
    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) chunks.push(rest);

  const fetchChunk = async (chunk) => {
    const url = `${MYMEMORY_BASE}?q=${encodeURIComponent(chunk)}&langpair=en|it`;
    for (let attempt = 0; attempt <= 1; attempt += 1) {
      try {
        const res = await axios.get(url, { timeout: 8000 });
        const t = res?.data?.responseData?.translatedText;
        return t && typeof t === "string" ? t.trim() : chunk;
      } catch (err) {
        const is429 = err?.response?.status === 429;
        if (is429 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }
        return chunk;
      }
    }
    return chunk;
  };
  const results = await Promise.all(chunks.filter(Boolean).map(fetchChunk));
  return results.length ? results.join(" ").replace(/\s+\./g, ".").trim() : raw;
}

function getMinigameTimeZone(client) {
  return client?.config?.minigames?.timeZone || MINIGAME_FIXED_TIMEZONE;
}

function getMinigameRomeTime(date, client) {
  const tz = client ? (client?.config?.minigames?.timeZone || MINIGAME_FIXED_TIMEZONE) : MINIGAME_FIXED_TIMEZONE;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function isMinigameFixedSlot(rome) {
  const { hour, minute } = rome;
  if (hour < MINIGAME_FIRST_HOUR || hour > MINIGAME_LAST_HOUR) return false;
  if (hour === MINIGAME_LAST_HOUR && minute > MINIGAME_LAST_MINUTE) return false;
  return MINIGAME_SLOT_MINUTES.includes(minute);
}

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

async function getChannelCached(client, channelId) {
  return getChannelSafe(client, channelId) ||
    (await getClientChannelCached(client, channelId, { ttlMs: 30_000 }));
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

function recordNoParticipationIfNeeded(channelId, game) {
  if (!channelId || !game) return;
  if (game.hadParticipation) return;
  lastNoParticipationEndAtByChannel.set(channelId, Date.now());
}

function clearNoParticipationDelay(channelId) {
  if (channelId) lastNoParticipationEndAtByChannel.delete(channelId);
}

function canStartByInterval(cfg) {
  const intervalMs = Number(cfg?.intervalMs || 15 * 60 * 1000);
  const noPartMs = Number(cfg?.noParticipationIntervalMs ?? 30 * 60 * 1000) || 0;
  const channelId = cfg?.channelId;
  const now = Date.now();
  const lastSent = lastSentAtByChannel.get(channelId) || 0;
  if (now - lastSent < intervalMs) return false;
  const noPartEnd = lastNoParticipationEndAtByChannel.get(channelId) || 0;
  if (noPartEnd > 0 && (now - noPartEnd) < noPartMs) return false;
  return true;
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
  if (Date.now() - lastSent < getFailsafeMs(cfg)) return false;
  const minActivityForFailsafe = Math.min(1, getMinMessages(cfg));
  if (getRecentCount(channelId, getActivityWindowMs(cfg)) < minActivityForFailsafe) return false;
  return true;
}

async function saveActiveGame(client, cfg, payload) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  let guildId = cfg?.guildId || null;
  if (!guildId) {
    const channel = await getChannelCached(client, channelId);
    guildId = channel?.guild?.id || null;
  }
  if (!guildId) return;
  await MinigameState.findOneAndUpdate(
    { guildId, channelId },
    { $set: { guildId, channelId, ...payload } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => { });
}

async function clearActiveGame(client, cfg) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  let guildId = cfg?.guildId || null;
  if (!guildId) {
    const channel = await getChannelCached(client, channelId);
    guildId = channel?.guild?.id || null;
  }
  if (!guildId) return;
  await MinigameState.deleteOne({ guildId, channelId }).catch(() => { });
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
  const specials = { "\u00df": "ss", "\u1e9e": "ss", "\u00e6": "ae", "\u00c6": "ae", "\u0153": "oe", "\u0152": "oe", "\u00f8": "o", "\u00d8": "o", "\u00e5": "a", "\u00c5": "a", "\u0142": "l", "\u0141": "l", "\u0111": "d", "\u0110": "d", "\u00f0": "d", "\u00d0": "d", "\u00fe": "th", "\u00de": "th", };
  const replaced = String(raw || "").replace(/[\u00df\u1e9e\u00e6\u00c6\u0153\u0152\u00f8\u00d8\u00e5\u00c5\u0142\u0141\u0111\u0110\u00f0\u00d0\u00fe\u00de]/g, (ch) => specials[ch] || ch,);
  return replaced
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactNoSpaces(s) {
  return String(s || "").replace(/\s+/g, "").trim();
}

function normalizeUserAnswerText(raw) {
  return String(raw || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u0060\u00B4\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .trim();
}

function isValidWord(word) {
  if (!word) return false;
  if (word.length < 5 || word.length > 6) return false;
  return /^\p{L}+$/u.test(word);
}

function isValidGuessWord(word) {
  if (!word) return false;
  if (word.length < 4 || word.length > 10) return false;
  return /^\p{L}+$/u.test(word);
}

function extractWordListFromApiPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.words)) return payload.words;
  if (Array.isArray(payload?.data)) return payload.data;
  if (typeof payload?.word === "string") return [payload.word];
  if (typeof payload?.text === "string") return [payload.text];
  if (typeof payload?.answer === "string") return [payload.answer];
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const keys = Object.keys(payload).filter((k) => typeof k === "string" && k.trim().length >= 2);
    if (keys.length) return keys;
  }
  return [];
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
      list = extractWordListFromApiPayload(res?.data);
    } catch (err) {
      warnMinigame(err);
    }
  }

  const filtered = list.map(normalizeWord).filter(isValidGuessWord);

  cachedWords = filtered;
  cachedWordsAt = now;
  return cachedWords;
}

function collectCountryNames(country) {
  const names = new Set();
  const add = (value) => { const normalized = normalizeCountryName(value); if (normalized) names.add(normalized); const compact = buildCompactAlias(value); if (compact) names.add(compact); };
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
  const altSpellings = Array.isArray(country?.altSpellings) ? country.altSpellings : [];
  for (const alt of altSpellings) add(alt);
  return Array.from(names.values());
}

function isLikelyFamousCapitalCountry(countryDisplay, aliases = [], cfg = {}) {
  const customFamous = Array.isArray(cfg?.guessCapital?.famousCountries) ? cfg.guessCapital.famousCountries : [];
  const allowlist = new Set([
    ...Array.from(FAMOUS_CAPITAL_COUNTRIES),
    ...customFamous.map((value) => normalizeCountryName(value)).filter(Boolean),
  ]);
  const normalizedDisplay = normalizeCountryName(countryDisplay);
  if (normalizedDisplay && allowlist.has(normalizedDisplay)) return true;
  for (const alias of aliases) {
    const normalizedAlias = normalizeCountryName(alias);
    if (normalizedAlias && allowlist.has(normalizedAlias)) return true;
  }
  return false;
}

function isWellKnownFlagCountry(displayName, namesArray = [], cfg = {}) {
  const custom = Array.isArray(cfg?.guessFlag?.famousCountries) ? cfg.guessFlag.famousCountries : [];
  const allowlist = new Set([
    ...Array.from(FLAG_WELL_KNOWN_COUNTRIES),
    ...custom.map((v) => normalizeCountryName(v)).filter(Boolean),
  ]);
  const normalizedDisplay = normalizeCountryName(displayName);
  if (normalizedDisplay && allowlist.has(normalizedDisplay)) return true;
  for (const n of namesArray || []) {
    const norm = normalizeCountryName(n);
    if (norm && allowlist.has(norm)) return true;
  }
  return false;
}

async function loadCountryList(cfg) {
  const now = Date.now();
  if (cachedCountries && now - cachedCountriesAt < COUNTRY_CACHE_TTL_MS)
    return cachedCountries;

  let apiUrl = cfg?.guessFlag?.apiUrl;
  if (apiUrl && apiUrl.includes("restcountries.com") && apiUrl.includes("fields=")) {
    apiUrl = apiUrl.replace(/fields=([^&]+)/, (_, f) => `fields=${f},region,subregion,population,languages`);
  }
  let list = [];
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      if (Array.isArray(res?.data)) {
        list = res.data;
      }
    } catch (err) {
      warnMinigame(err);
    }
  }

  const MIN_POPULATION_FOR_FLAG = 280000;
  const REGION_LABELS = { Europe: "Europa", Africa: "Africa", Americas: "Americhe", Asia: "Asia", Oceania: "Oceania", Antarctic: "Antartide" };
  const useWellKnownOnly = cfg?.guessFlag?.useWellKnownOnly !== false;
  const mapped = list.map((country) => {
    const names = collectCountryNames(country);
    const flagUrl = country?.flags?.png || country?.flags?.svg || country?.flags?.[0];
    const displayName = country?.translations?.ita?.common || country?.name?.common || country?.name?.official || null;
    if (!names.length || !flagUrl || !displayName) return null;
    const pop = country?.population;
    if (Number.isFinite(pop) && pop < MIN_POPULATION_FOR_FLAG) return null;
    const region = country?.region;
    const subregion = country?.subregion;
    const langs = country?.languages;
    let populationLabel = null;
    if (Number.isFinite(pop)) {
      if (pop >= 1_000_000_000) populationLabel = `~${(pop / 1_000_000_000).toFixed(1)} miliardi`;
      else if (pop >= 1_000_000) populationLabel = `~${Math.round(pop / 1_000_000)} milioni`;
      else if (pop >= 1_000) populationLabel = `~${Math.round(pop / 1_000)} mila`;
      else populationLabel = `~${pop}`;
    }
    const languageNames = langs && typeof langs === "object" ? Object.values(langs).slice(0, 2) : [];
    return {
      names,
      flagUrl,
      displayName,
      region: region ? (REGION_LABELS[region] || region) : null,
      subregion: subregion || null,
      populationLabel: populationLabel || null,
      languages: languageNames.length ? languageNames : null,
    };
  }).filter(Boolean).filter((item) => !useWellKnownOnly || isWellKnownFlagCountry(item.displayName, item.names, cfg));
  cachedCountries = mapped;
  cachedCountriesAt = now;
  return cachedCountries;
}

const ALLOWED_REWARD_EXP = [100, 150, 200, 250];

function normalizeRewardExp(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return ALLOWED_REWARD_EXP[0];
  let best = ALLOWED_REWARD_EXP[0];
  let bestDist = Math.abs(num - best);
  for (const a of ALLOWED_REWARD_EXP) {
    const d = Math.abs(num - a);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

function pickRandomItem(list = []) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[randomBetween(0, list.length - 1)] || null;
}

function getRecentQuestionKey(questionKey) {
  return String(questionKey || "").trim().toLowerCase();
}

function isQuestionKeyRecent(channelId, type, questionKey, recentLimit = 20) {
  if (!channelId || !type) return false;
  const key = `${channelId}:${type}`;
  const recent = recentQuestionKeysByChannel.get(key) || [];
  const k = getRecentQuestionKey(questionKey);
  return k && recent.includes(k);
}

function pushQuestionKeyToRecent(channelId, type, questionKey, recentLimit = 20) {
  if (!channelId || !type) return;
  const k = getRecentQuestionKey(questionKey);
  if (!k) return;
  const key = `${channelId}:${type}`;
  const recent = recentQuestionKeysByChannel.get(key) || [];
  const next = recent.filter((x) => x !== k);
  next.push(k);
  while (next.length > Math.max(5, Number(recentLimit || 20))) next.shift();
  recentQuestionKeysByChannel.set(key, next);
}

function pickQuestionAvoidRecent(channelId, type, list = [], keySelector, recentLimit = 20) {
  if (!channelId || !type || !Array.isArray(list) || !list.length) {
    return pickRandomItem(list);
  }
  const key = `${channelId}:${type}`;
  const recent = recentQuestionKeysByChannel.get(key) || [];
  const seen = new Set(recent);
  const pool = list.filter((item) => { const k = getRecentQuestionKey(keySelector?.(item)); if (!k) return true; return !seen.has(k); });
  const picked = pickRandomItem(pool.length ? pool : list);
  if (!picked) return null;
  const pickedKey = getRecentQuestionKey(keySelector?.(picked));
  if (pickedKey) pushQuestionKeyToRecent(channelId, type, pickedKey, recentLimit);
  return picked;
}

function parseStateTarget(rawTarget, fallback = {}) {
  try {
    const parsed = JSON.parse(rawTarget || "{}");
    if (parsed && typeof parsed === "object") return parsed;
  } catch (err) {
    warnMinigame(err);
  }
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

  const italianHints = new Set(["il", "lo", "la", "i", "gli", "le", "un", "una", "di", "del", "della", "che", "con", "per", "quale", "quando", "dove", "come", "chi", "quanti", "cosa",]);
  const englishHints = new Set(["the", "what", "which", "when", "where", "who", "how", "is", "are", "was", "were", "of", "in", "on",]);

  let itScore = 0;
  let enScore = 0;
  for (const token of tokens) {
    if (italianHints.has(token)) itScore += 1;
    if (englishHints.has(token)) enScore += 1;
  }

  return itScore >= enScore;
}

function polishItalianQuestionText(value) {
  const src = String(value || "").replace(/\s+/g, " ").trim();
  if (!src) return "";
  return src
    .replace(/\bd\s+Italia\b/gi, "d'Italia")
    .replace(/\bl\s+Italia\b/gi, "l'Italia")
    .replace(/\bl\s+unità\b/gi, "l'unità")
    .replace(/\bQual e\b/gi, "Qual è")
    .replace(/\bpiu\b/gi, "più");
}

function buildItalianGkApiUrls(cfg) {
  const rawUrls = Array.isArray(cfg?.italianGK?.apiUrls) ? cfg.italianGK.apiUrls : cfg?.italianGK?.apiUrl ? [cfg.italianGK.apiUrl] : [];

  const categories = Array.isArray(cfg?.italianGK?.categories) && cfg.italianGK.categories.length ? cfg.italianGK.categories : ITALIAN_GK_DEFAULT_CATEGORIES;

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
      question: polishItalianQuestionText(decodeQuizText(direct.question)),
      answers: buildAliases([
        decodeQuizText(direct.answer || direct.correct_answer),
      ]),
    };
  }

  const list = Array.isArray(direct?.data) ? direct.data : Array.isArray(direct?.results) ? direct.results : Array.isArray(payload) ? payload : [];
  if (!list.length) return null;

  const pick = pickRandomItem(list);
  if (!pick) return null;
  const question = pick.question || pick.domanda || pick.q || pick.text || null;
  const answer = pick.answer || pick.correct_answer || pick.risposta || pick.a || null;
  if (!question || !answer) return null;

  return {
    question: polishItalianQuestionText(decodeQuizText(question)),
    answers: buildAliases([decodeQuizText(answer)]),
  };
}

async function fetchWikiRegionImage(regionName) {
  const normalized = String(regionName || "").trim();
  if (!normalized) return null;
  if (regionImageCache.has(normalized)) return regionImageCache.get(normalized);

  const titles = [normalized, `${normalized}(regione italiana)`,
    `Regione ${normalized}`,
  ];

  for (const title of titles) {
    const url = `https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    try {
      const res = await axios.get(url, { timeout: 12000 });
      const image = res?.data?.thumbnail?.source || res?.data?.originalimage?.source || null;
      if (image) {
        regionImageCache.set(normalized, image);
        return image;
      }
    } catch (err) {
      warnMinigame(err);
    }
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

  const apiUrl = cfg?.guessCapital?.apiUrl || "https://restcountries.com/v3.1/all?fields=name,translations,capital,flags";
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data) ? res.data : [];
    for (const country of list) {
      const countryDisplay = country?.translations?.ita?.common || country?.name?.common || null;
      const capitals = Array.isArray(country?.capital) ? country.capital : [];
      const image = country?.flags?.png || country?.flags?.svg || null;
      if (!countryDisplay || !capitals.length) continue;
      const countryAliases = collectCountryNames(country);
      if (!isLikelyFamousCapitalCountry(countryDisplay, countryAliases, cfg)) continue;
      const capitalNames = [...capitals];
      for (const cap of capitals) {
        const it = CAPITAL_ITALIAN[String(cap || "").trim()];
        if (it && !capitalNames.includes(it)) capitalNames.push(it);
      }
      const aliases = buildAliases(capitalNames);
      if (!aliases.length) continue;
      out.push({ country: String(countryDisplay), answers: aliases, image });
    }
  } catch (err) {
    warnMinigame(err);
  }

  cachedCapitalQuestions = out.length ? out : getCapitalQuizBank().map((row) => ({ country: row.country, answers: row.answers, image: null }));
  cachedCapitalQuestionsAt = now;
  return cachedCapitalQuestions;
}

let cachedReverseCapitalQuestions = null;
let cachedReverseCapitalQuestionsAt = 0;

async function loadReverseCapitalQuestionBank(cfg) {
  const now = Date.now();
  if (
    cachedReverseCapitalQuestions &&
    now - cachedReverseCapitalQuestionsAt < CAPITAL_CACHE_TTL_MS
  ) {
    return cachedReverseCapitalQuestions;
  }
  const apiUrl = cfg?.guessReverseCapital?.apiUrl || cfg?.guessCapital?.apiUrl || "https://restcountries.com/v3.1/all?fields=name,translations,capital,flags";
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data) ? res.data : [];
    for (const country of list) {
      const countryDisplay = country?.translations?.ita?.common || country?.name?.common || null;
      const capitals = Array.isArray(country?.capital) ? country.capital : [];
      const image = country?.flags?.png || country?.flags?.svg || null;
      if (!countryDisplay || !capitals.length) continue;
      const countryAliases = collectCountryNames(country);
      if (!isLikelyFamousCapitalCountry(countryDisplay, countryAliases, cfg)) continue;
      const answers = buildAliases(countryAliases);
      if (!answers.length) continue;
      for (const cap of capitals) {
        const capitalStr = String(cap || "").trim();
        if (!capitalStr) continue;
        out.push({ capital: capitalStr, country: String(countryDisplay), answers, image });
      }
    }
  } catch (err) {
    warnMinigame(err);
  }
  cachedReverseCapitalQuestions = out.length ? out : [];
  cachedReverseCapitalQuestionsAt = now;
  return cachedReverseCapitalQuestions;
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
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res?.data?.data) ? res.data.data : [];
      for (const row of list) {
        const region = row?.region || row?.regione || row?.name || null;
        const capital = row?.capital || row?.capoluogo || null;
        if (!region || !capital) continue;
        const answers = buildAliases(Array.isArray(capital) ? capital : [capital],);
        if (!answers.length) continue;
        out.push({ region: String(region), answers });
      }
    } catch (err) {
      warnMinigame(err);
    }
  }

  if (!out.length) {
    for (const row of getItalianRegionCapitalBank()) {
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

  const apiBase = cfg?.guessTeam?.apiUrl || "https://www.thesportsdb.com/api/v1/json/123/search_all_teams.php?l=";
  const leagues = Array.isArray(cfg?.guessTeam?.leagues) && cfg.guessTeam.leagues.length ? cfg.guessTeam.leagues : DEFAULT_FOOTBALL_LEAGUES;
  const out = [];
  for (const league of leagues) {
    try {
      const url = `${apiBase}${encodeURIComponent(league)}`;
      const res = await axios.get(url, { timeout: 15000 });
      const teams = Array.isArray(res?.data?.teams) ? res.data.teams : [];
      for (const team of teams) {
        if (!isLikelyFamousTeam(team, cfg)) continue;
        const name = team?.strTeam;
        const badge = team?.strBadge || null;
        if (!name || !badge) continue;
        const normKey = normalizeCountryName(name);
        const italian = TEAM_ITALIAN_MAP.get(normKey);
        const displayName = italian?.display ?? name;
        const aliasSources = [name, team?.strTeamShort, team?.strTeamAlternate, displayName, ...(italian?.extraAliases ?? [])].filter(Boolean);
        const aliases = buildAliases(aliasSources);
        if (!aliases.length) continue;
        out.push({ team: displayName, teamId: team?.idTeam ? String(team.idTeam) : null, league, answers: aliases, image: badge });
      }
    } catch (err) {
      warnMinigame(err);
    }
  }

  cachedTeams = out;
  cachedTeamsAt = now;
  return cachedTeams;
}

const DEFAULT_ONLY_FAMOUS_MIN_FANS = 50000;
const FALLBACK_MIN_FANS = 20000;
const MIN_SINGERS_AFTER_FILTER = 15;

async function loadSingersFromApi(cfg) {
  const now = Date.now();
  if (cachedSingers && now - cachedSingersAt < SINGER_CACHE_TTL_MS)
    return cachedSingers;

  const apiUrl = cfg?.guessSinger?.apiUrl || "https://api.deezer.com/chart/0/artists?limit=100";
  const minFans = Number(cfg?.guessSinger?.onlyFamousMinFans ?? DEFAULT_ONLY_FAMOUS_MIN_FANS) || 0;
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data?.data) ? res.data.data : [];
    for (const artist of list) {
      const name = artist?.name;
      const image = pickBestSingerImage(artist);
      if (!name) continue;
      const fans = Number(artist?.nb_fan ?? 0);
      if (minFans > 0 && fans < minFans) continue;
      out.push({ name, answers: buildAliases([name]), image });
    }
    if (minFans > 0 && out.length < MIN_SINGERS_AFTER_FILTER) {
      out.length = 0;
      const fallback = Number(cfg?.guessSinger?.fallbackMinFans ?? FALLBACK_MIN_FANS) || FALLBACK_MIN_FANS;
      for (const artist of list) {
        const name = artist?.name;
        const image = pickBestSingerImage(artist);
        if (!name) continue;
        if (Number(artist?.nb_fan ?? 0) < fallback) continue;
        out.push({ name, answers: buildAliases([name]), image });
      }
    }
  } catch (err) {
    warnMinigame(err);
  }

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
  const candidates = [artist?.picture_xl, artist?.picture_big, artist?.picture_medium, artist?.picture_small, artist?.picture,].filter(Boolean);
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

  const fallbackApi = cfg?.guessSinger?.fallbackApiUrl || "https://www.theaudiodb.com/api/v1/json/2/search.php";
  try {
    const res = await axios.get(fallbackApi, { params: { s: artistName }, timeout: 15000, });
    const artists = Array.isArray(res?.data?.artists) ? res.data.artists : [];
    const best = artists.find((a) => normalizeCountryName(a?.strArtist) === normalizeCountryName(artistName),);
    const picked = best || artists[0];
    const fallbackUrl = picked?.strArtistThumb || picked?.strArtistFanart || picked?.strArtistFanart2 || picked?.strArtistFanart3 || null;
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

  const onlyFamousArtists = cfg?.guessAlbum?.onlyFamousArtists !== false;
  let famousArtistNames = null;
  if (onlyFamousArtists) {
    const singers = await loadSingersFromApi(cfg);
    famousArtistNames = new Set(singers.map((s) => normalizeCountryName(s?.name)).filter(Boolean));
  }

  const apiUrl = cfg?.guessAlbum?.apiUrl || "https://api.deezer.com/chart/0/albums?limit=100";
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data?.data) ? res.data.data : [];
    for (const album of list) {
      const title = album?.title;
      const artist = album?.artist?.name || "Artista sconosciuto";
      const image = album?.cover_xl || album?.cover_big || album?.cover_medium || album?.cover || null;
      if (!title || !image) continue;
      if (onlyFamousArtists && famousArtistNames && !famousArtistNames.has(normalizeCountryName(artist)))
        continue;
      out.push({ album: title, artist, answers: buildAliases([title]), image });
    }
  } catch (err) {
    warnMinigame(err);
  }

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

const LOOSE_STOPWORDS = new Set(["a", "an", "the", "of", "and", "or", "di", "del", "della", "dello", "dei", "degli", "da", "de", "d", "l", "il", "lo", "la", "i", "gli", "le", "feat", "ft", "featuring", "with",]);

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
  const compact = tokens.filter((t) => t.length > 1).join(" ").trim();
  if (!compact || compact === normalized) return null;
  return compact;
}

function buildSongAnswerAliases(rawTitle) {
  const raw = String(rawTitle || "").trim();
  if (!raw) return [];

  const aliases = new Set();
  const add = (value) => { const normalized = normalizeSongGuess(value); if (normalized) aliases.add(normalized); const compact = buildCompactAlias(value); if (compact) aliases.add(compact); };

  add(raw);

  const withoutBrackets = raw.replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, " ").replace(/\s+/g, " ").trim();
  add(withoutBrackets);

  const withoutFeat = raw.replace(/\s+(feat\.?|ft\.?|featuring|with)\s+.+$/i, "").trim();
  add(withoutFeat);
  add(
    withoutFeat
      .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

  const dashParts = raw.split(/\s(?:-|–|—)\s/).map((p) => p.trim()).filter(Boolean);
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

  const answers = Array.isArray(rawAnswers) ? rawAnswers.map((a) => normalizeCountryName(a)).filter(Boolean) : [normalizeCountryName(rawAnswers)].filter(Boolean);
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
  if (["vero", "v", "true", "t", "si", "sì", "yes", "y"].includes(v)) return true;
  if (["falso", "f", "false", "no", "n"].includes(v)) return false;
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
  const formatAnswer = (value) => { const num = Number(value); if (!Number.isFinite(num)) return String(value); if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num)); return String(Number(num.toFixed(2))); };

  const generators = [() => {
    const a = randomBetween(2, 60); const b = randomBetween(2, 60); const c = randomBetween(2, 40); return {
      expression: `${a}+${b}+${c}`,
      answer: formatAnswer(a + b + c),
    };
  },
  () => {
    let a = randomBetween(40, 120);
    const b = randomBetween(2, 50);
    const c = randomBetween(2, 30);
    if (a < b + c) a = b + c + randomBetween(5, 25);
    return {
      expression: `${a}-${b}-${c}`,
      answer: formatAnswer(a - b - c),
    };
  },
  () => {
    const a = randomBetween(2, 14);
    const b = randomBetween(2, 12);
    const c = randomBetween(2, 6);
    return {
      expression: `${a}×${b}×${c}`,
      answer: formatAnswer(a * b * c),
    };
  },
  () => {
    const divisor = randomBetween(2, 12);
    const result = randomBetween(2, 20);
    const dividend = divisor * result;
    return {
      expression: `${dividend}÷${divisor}`,
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
      expression: `(${a}×${b})+${c}-${d}`,
      answer: formatAnswer(left + c - d),
    };
  },
  () => {
    const root = randomBetween(2, 12);
    const n = root * root;
    const a = randomBetween(2, 30);
    const b = randomBetween(2, 20);
    return {
      expression: `√${n}+${a}-${b}`,
      answer: formatAnswer(root + a - b),
    };
  },
  ];

  const pick = generators[randomBetween(0, generators.length - 1)];
  return pick();
}

function parseMathGuess(raw) {
  const compact = normalizeUserAnswerText(raw).replace(/\s+/g, "");
  if (!compact) return null;
  if (/[\p{L}]/u.test(compact)) return null;
  const base = compact.replace(/[^0-9+\-*/().,×÷]/g, "").replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/");
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

function buildFastTypePromptImage(phrase) {
  try {
    registerCanvasFonts(canvasModule);
    const width = 1200;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const padding = CANVAS_STYLE.padding;
    const radius = 20;

    fillCanvasBackground(ctx, width, height);
    const cardX = padding;
    const cardY = padding;
    const cardW = width - padding * 2;
    const cardH = height - padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH, radius);

    const phraseText = String(phrase || "").trim() || "...";
    const usableWidth = cardW - 80;
    ctx.font = fontStackPrimaryOnly(42, "700");
    const phraseLines = wrapPromptText(ctx, phraseText, usableWidth);
    const lineHeight = 54;
    const totalPhraseHeight = phraseLines.length * lineHeight;
    const labelHeight = 36;
    const gapLabelPhrase = 16;
    const totalContentHeight = labelHeight + gapLabelPhrase + totalPhraseHeight;
    const contentStartY = cardY + (cardH - totalContentHeight) / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(28, "600");
    ctx.fillText("Scrivi esattamente questa frase", width / 2, contentStartY);

    let phraseY = contentStartY + labelHeight + gapLabelPhrase;
    ctx.font = fontStackPrimaryOnly(42, "700");
    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    for (const line of phraseLines) {
      ctx.fillText(line, width / 2, phraseY, usableWidth);
      phraseY += lineHeight;
    }

    const name = "fast_type.png";
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

function buildDrivingQuizPromptImage(row) {
  try {
    registerCanvasFonts(canvasModule);
    const width = 1400;
    const height = 780;
    const padding = CANVAS_STYLE.padding;
    const radius = CANVAS_STYLE.radius;
    const cardW = width - padding * 2;
    const cardH = height - padding * 2;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const hasSign = Boolean(row?.signType);
    const signAreaW = hasSign ? 420 : 0;
    const textAreaW = cardW - signAreaW - (hasSign ? 42 : 0);
    const usableWidth = textAreaW - 70;

    const isMultiple = (row?.questionType === "multiple" || hasSign) && Array.isArray(row?.options) && row.options.length >= 2;
    const statement = String(row?.statement ?? "").trim() || "Domanda";
    ctx.font = fontStackPrimaryOnly(58, "700");
    const statementLines = wrapPromptText(ctx, statement, usableWidth);
    let optionsLines = [];
    if (isMultiple) {
      ctx.font = fontStackPrimaryOnly(42, "700");
      for (let i = 0; i < row.options.length; i++) {
        const opt = String(row.options[i] ?? "").trim();
        const letter = ["A", "B", "C", "D"][i] ?? String(i + 1);
        optionsLines.push(...wrapPromptText(ctx, `${letter}) ${opt}`, usableWidth - 36));
      }
    }

    fillCanvasBackground(ctx, width, height);
    const cardX = padding;
    const cardY = padding;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH, radius);

    let textStartX = cardX + (cardW - textAreaW) / 2;
    if (hasSign) {
      textStartX = cardX + signAreaW + 24;
      const signCx = cardX + signAreaW / 2;
      const signCy = cardY + cardH / 2;
      drawRoadSign(ctx, row.signType, signCx, signCy, 260);
    }

    const textCenterX = hasSign ? textStartX + textAreaW / 2 : width / 2;
    const titleHeight = 54;
    const titleGap = 24;
    const statementLineHeight = 68;
    const optionsGap = 20;
    const optionLineHeight = 52;
    const boolHintHeight = 50;
    const boolGap = 16;

    const statementHeight = statementLines.length * statementLineHeight;
    const optionsHeight = isMultiple ? optionsGap + optionsLines.length * optionLineHeight : boolGap + boolHintHeight;
    const totalContentHeight = titleHeight + titleGap + statementHeight + optionsHeight;
    let y = cardY + (cardH - totalContentHeight) / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(56, "700");
    ctx.fillText("Quiz patente", textCenterX, y);
    y += titleHeight + titleGap;

    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    ctx.font = fontStackPrimaryOnly(58, "700");
    for (const line of statementLines) {
      ctx.fillText(line, textCenterX, y, usableWidth);
      y += statementLineHeight;
    }

    if (isMultiple) {
      y += optionsGap;
      ctx.font = fontStackPrimaryOnly(42, "700");
      for (const line of optionsLines) {
        ctx.fillText(line, textCenterX, y, usableWidth);
        y += optionLineHeight;
      }
    } else {
      y += boolGap;
      ctx.fillStyle = CANVAS_STYLE.titleColor;
      ctx.font = fontStackPrimaryOnly(46, "700");
      ctx.fillText("Rispondi: Vero o Falso", textCenterX, y);
    }

    const name = "driving_quiz.png";
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillCanvasBackground(ctx, width, height) {
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, CANVAS_STYLE.bgGradStart);
  g.addColorStop(1, CANVAS_STYLE.bgGradEnd);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function fillCanvasCard(ctx, x, y, w, h, radius = null) {
  const r = radius ?? CANVAS_STYLE.radius;
  ctx.fillStyle = CANVAS_STYLE.cardFill;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = CANVAS_STYLE.cardStroke;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

function drawRoadSign(ctx, signType, cx, cy, size) {
  const s = Math.max(20, size || 120);
  const r = s / 2;
  ctx.save();

  switch (String(signType || "").toLowerCase()) {
    case "danger": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r + 8);
      ctx.lineTo(cx + r - 8, cy + r * 0.5);
      ctx.lineTo(cx - r + 8, cy + r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e00";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 3), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", cx, cy);
      break;
    }
    case "stop": {
      const pts = 8;
      ctx.fillStyle = "#e00";
      ctx.beginPath();
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * Math.PI * 2 - Math.PI / 2;
        const x = cx + (r - 4) * Math.cos(a);
        const y = cy + (r - 4) * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 4.5), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("STOP", cx, cy);
      break;
    }
    case "give_way": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.moveTo(cx, cy + r - 8);
      ctx.lineTo(cx + r - 8, cy - r * 0.5);
      ctx.lineTo(cx - r + 8, cy - r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "no_entry": {
      ctx.fillStyle = "#e00";
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(cx - r * 0.6, cy - s / 8, r * 1.2, s / 4);
      break;
    }
    case "parking": {
      ctx.fillStyle = "#0066b3";
      ctx.fillRect(cx - r + 4, cy - r * 0.7, (r - 4) * 2, r * 1.4);
      ctx.fillStyle = "#fff";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 2.2), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P", cx, cy);
      break;
    }
    case "no_parking": {
      ctx.fillStyle = "#0066b3";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(3, s / 20);
      ctx.beginPath();
      ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(4, s / 15);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5, cy + r * 0.5);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.5);
      ctx.stroke();
      break;
    }
    case "speed_50": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 2.5), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("50", cx, cy);
      break;
    }
    case "obligation_right": {
      ctx.fillStyle = "#0066b3";
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.35, cy);
      ctx.lineTo(cx + r * 0.35, cy - r * 0.35);
      ctx.lineTo(cx + r * 0.35, cy + r * 0.35);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "obligation_forward": {
      ctx.fillStyle = "#0066b3";
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.4);
      ctx.lineTo(cx - r * 0.25, cy + r * 0.35);
      ctx.lineTo(cx, cy + r * 0.15);
      ctx.lineTo(cx + r * 0.25, cy + r * 0.35);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "pedestrian_crossing": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r + 8);
      ctx.lineTo(cx + r - 8, cy + r * 0.5);
      ctx.lineTo(cx - r + 8, cy + r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 4), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PED", cx, cy);
      break;
    }
    case "no_overtaking": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e00";
      ctx.fillRect(cx - r * 0.5, cy - r * 0.2, r * 0.35, r * 0.4);
      ctx.fillRect(cx + r * 0.15, cy - r * 0.2, r * 0.35, r * 0.4);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.45, cy);
      ctx.lineTo(cx + r * 0.45, cy);
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(3, s / 25);
      ctx.stroke();
      break;
    }
    case "priority_road": {
      const d = r - 4;
      ctx.fillStyle = "#ffcc00";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(2, s / 30);
      ctx.beginPath();
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d, cy);
      ctx.lineTo(cx, cy + d);
      ctx.lineTo(cx - d, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    default:
      ctx.fillStyle = "#888";
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
  }

  ctx.restore();
}

function buildHangmanImageAttachment(maskedWord, misses = 0, maxMisses = 7) {
  try {
    registerCanvasFonts(canvasModule);
    const width = 900;
    const height = 520;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);

    const innerGrad = ctx.createLinearGradient(0, 0, width, 0);
    innerGrad.addColorStop(0, "#3d2e26");
    innerGrad.addColorStop(0.5, "#5c4538");
    innerGrad.addColorStop(1, "#3d2e26");
    ctx.fillStyle = innerGrad;
    ctx.strokeStyle = CANVAS_STYLE.cardStroke;
    ctx.lineWidth = 3;
    roundRect(ctx, 32, 32, width - 64, height - 64, 16);
    ctx.fill();
    ctx.stroke();

    const m = Math.min(7, Math.max(0, Number(misses) || 0));
    const max = Math.max(1, Number(maxMisses) || 7);

    const leftZoneCenterX = 240;
    const wordCenterX = 600;
    const contentTop = 100;
    const contentBottom = 380;

    const poleBottomY = contentBottom - 24;
    const poleTopY = contentTop + 20;
    const poleX = leftZoneCenterX - 70;
    const beamStartX = poleX;
    const beamEndX = poleX + 140;
    const headCx = (beamStartX + beamEndX) / 2;
    const headCy = poleTopY + 32;
    const ropeY = poleTopY + 8;

    ctx.strokeStyle = "#b8a99a";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(poleX, poleBottomY);
    ctx.lineTo(poleX, poleTopY);
    ctx.lineTo(beamEndX, poleTopY);
    ctx.stroke();

    if (m >= 1) {
      ctx.beginPath();
      ctx.moveTo(headCx, poleTopY);
      ctx.lineTo(headCx, ropeY + 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(headCx, headCy, 20, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (m >= 2) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 20);
      ctx.lineTo(headCx, headCy + 58);
      ctx.stroke();
    }
    if (m >= 3) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 32);
      ctx.lineTo(headCx - 24, headCy + 52);
      ctx.stroke();
    }
    if (m >= 4) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 32);
      ctx.lineTo(headCx + 24, headCy + 52);
      ctx.stroke();
    }
    if (m >= 5) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 58);
      ctx.lineTo(headCx - 20, headCy + 88);
      ctx.stroke();
    }
    if (m >= 6) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 58);
      ctx.lineTo(headCx + 20, headCy + 88);
      ctx.stroke();
    }
    if (m >= 7) {
      ctx.beginPath();
      ctx.moveTo(headCx - 6, headCy - 4);
      ctx.lineTo(headCx + 6, headCy + 12);
      ctx.moveTo(headCx + 6, headCy - 4);
      ctx.lineTo(headCx - 6, headCy + 12);
      ctx.stroke();
    }

    ctx.fillStyle = "#e8e0d5";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontStackPrimaryOnly(42, "700");
    ctx.fillText("Impiccato", width / 2, 54);

    const wordStr = String(maskedWord || "").trim() || "_";
    ctx.fillStyle = "#e8e0d5";
    ctx.font = fontStackPrimaryOnly(44, "700");
    ctx.fillText(wordStr, wordCenterX, (contentTop + contentBottom) / 2, width - 320);

    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(28, "700");
    ctx.fillText(`Errori: ${m}/${max}`, width / 2, height - 56);

    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "hangman.png" });
  } catch {
    return null;
  }
}

function buildPromptImageAttachment(title, lines = [], fileBaseName = "minigame") {
  if (fileBaseName === "italian_gk" && Array.isArray(lines) && lines.length > 0) {
    try {
      registerCanvasFonts(canvasModule);
      const width = 1400;
      const height = 780;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      fillCanvasBackground(ctx, width, height);
      const cardX = CANVAS_STYLE.padding;
      const cardY = CANVAS_STYLE.padding;
      const cardW = width - CANVAS_STYLE.padding * 2;
      const cardH = height - CANVAS_STYLE.padding * 2;
      fillCanvasCard(ctx, cardX, cardY, cardW, cardH);

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = CANVAS_STYLE.titleColor;
      ctx.font = fontStackPrimaryOnly(76, "800");
      ctx.fillText("Cultura generale", width / 2, cardY + 100);

      const question = polishItalianQuestionText(String(lines[0] || "").trim() || "Domanda");
      const usableWidth = cardW - 150;
      let questionFont = 64;
      let questionLines = [];
      for (; questionFont >= 42; questionFont -= 2) {
        ctx.font = fontStackPrimaryOnly(questionFont, "700");
        questionLines = wrapPromptText(ctx, question, usableWidth);
        if (questionLines.length <= 5) break;
      }

      const lineHeight = Math.round(questionFont * 1.22);
      const totalH = questionLines.length * lineHeight;
      let y = Math.round(cardY + 200 + Math.max(0, (cardH - 300 - totalH) / 2));

      ctx.fillStyle = CANVAS_STYLE.bodyColor;
      ctx.font = fontStackPrimaryOnly(questionFont, "700");
      for (const line of questionLines) {
        ctx.fillText(line, width / 2, y, usableWidth);
        y += lineHeight;
      }

      return new AttachmentBuilder(canvas.toBuffer("image/png"), {
        name: "italian_gk.png",
      });
    } catch {
      return null;
    }
  }

  if (fileBaseName === "guess_word" && Array.isArray(lines) && lines.length > 0) {
    try {
      registerCanvasFonts(canvasModule);
      const width = 1400;
      const height = 780;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      fillCanvasBackground(ctx, width, height);
      const cardX = CANVAS_STYLE.padding;
      const cardY = CANVAS_STYLE.padding;
      const cardW = width - CANVAS_STYLE.padding * 2;
      const cardH = height - CANVAS_STYLE.padding * 2;
      fillCanvasCard(ctx, cardX, cardY, cardW, cardH);

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = CANVAS_STYLE.titleColor;
      ctx.font = fontStackPrimaryOnly(76, "800");
      ctx.fillText("Indovina la parola", width / 2, cardY + 100);

      const scrambled = String(lines[0] || "").trim() || "?";
      const usableWidth = cardW - 150;
      let fontSize = 72;
      let textLines = [];
      for (; fontSize >= 44; fontSize -= 4) {
        ctx.font = fontStackPrimaryOnly(fontSize, "700");
        textLines = wrapPromptText(ctx, scrambled, usableWidth);
        if (textLines.length <= 3) break;
      }
      const lineHeight = Math.round(fontSize * 1.22);
      const totalH = textLines.length * lineHeight;
      let y = Math.round(cardY + 200 + Math.max(0, (cardH - 300 - totalH) / 2));
      ctx.fillStyle = CANVAS_STYLE.bodyColor;
      ctx.font = fontStackPrimaryOnly(fontSize, "700");
      for (const line of textLines) {
        ctx.fillText(line, width / 2, y, usableWidth);
        y += lineHeight;
      }

      return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "guess_word.png" });
    } catch {
      return null;
    }
  }
  if (fileBaseName === "hangman" && Array.isArray(lines) && lines.length >= 2) {
    const masked = String(lines[0] || "").trim();
    const errMatch = String(lines[1] || "").match(/Errori:\s*(\d+)\/(\d+)/);
    const misses = errMatch ? parseInt(errMatch[1], 10) : 0;
    const maxMisses = errMatch ? parseInt(errMatch[2], 10) : 7;
    const out = buildHangmanImageAttachment(masked, misses, maxMisses);
    if (out) return out;
  }
  if (fileBaseName === "fast_type" && Array.isArray(lines) && lines.length > 0) {
    const out = buildFastTypePromptImage(lines[0]);
    if (out) return out;
  }

  try {
    registerCanvasFonts(canvasModule);
    const width = 1400;
    const height = 780;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);
    const cardX = CANVAS_STYLE.padding;
    const cardY = CANVAS_STYLE.padding;
    const cardW = width - CANVAS_STYLE.padding * 2;
    const cardH = height - CANVAS_STYLE.padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(68, "700");
    ctx.fillText(String(title || "Minigioco"), width / 2, cardY + 48);

    const usableWidth = cardW - 120;
    const sourceLines = Array.isArray(lines) ? lines.map((line) => String(line || "").trim()).filter(Boolean) : [];
    const renderedLines = [];
    for (const line of sourceLines) {
      ctx.font = fontStackPrimaryOnly(56, "700");
      renderedLines.push(...wrapPromptText(ctx, line, usableWidth));
    }
    if (!renderedLines.length) renderedLines.push("...");

    ctx.font = fontStackPrimaryOnly(56, "700");
    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    const lineHeight = 76;
    const totalHeight = renderedLines.length * lineHeight;
    let y = Math.max(cardY + 180, Math.round(cardY + (cardH - totalHeight) / 2));
    for (const line of renderedLines) {
      ctx.fillText(line, width / 2, y, usableWidth);
      y += lineHeight;
    }

    const name = `${String(fileBaseName || "minigame").replace(/[^a-z0-9_-]/gi, "_").toLowerCase()}.png`;
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

async function buildGuessFlagCardAttachment(flagUrl) {
  try {
    registerCanvasFonts(canvasModule);
    const flagImg = await loadImage(flagUrl).catch(() => null);
    if (!flagImg) return null;
    const width = 1400;
    const height = 780;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    fillCanvasBackground(ctx, width, height);
    const cardX = CANVAS_STYLE.padding;
    const cardY = CANVAS_STYLE.padding;
    const cardW = width - CANVAS_STYLE.padding * 2;
    const cardH = height - CANVAS_STYLE.padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH);
    ctx.textAlign = "center";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(68, "700");
    ctx.fillText("Indovina la bandiera", width / 2, cardY + 48);
    const maxW = cardW - 120;
    const maxH = cardH - 200;
    const scale = Math.min(maxW / flagImg.width, maxH / flagImg.height, 1);
    const drawW = Math.round(flagImg.width * scale);
    const drawH = Math.round(flagImg.height * scale);
    const x = (width - drawW) / 2;
    const y = cardY + 140;
    ctx.drawImage(flagImg, x, y, drawW, drawH);
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "guess_flag.png" });
  } catch {
    return null;
  }
}

function buildMathExpressionImageAttachment(expression) {
  try {
    registerCanvasFonts(canvasModule);
    const width = 1200;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);
    const pad = CANVAS_STYLE.padding;
    const cardW = width - pad * 2;
    const cardH = height - pad * 2;
    fillCanvasCard(ctx, pad, pad, cardW, cardH, 20);

    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontStackPrimaryOnly(120, "700");
    ctx.fillText(String(expression || ""), width / 2, height / 2);

    const name = "math_expression.png";
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

function normalizeCharForGuess(ch) {
  return String(ch || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function maskHangmanWord(word, guessed = new Set()) {
  return String(word || "")
    .split("")
    .map((ch) => (guessed.has(normalizeCharForGuess(ch)) ? ch : "_"))
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
  const answers = Array.isArray(rawAnswers) ? rawAnswers.map((x) => normalizeCountryName(x)).filter(Boolean) : [normalizeCountryName(rawAnswers)].filter(Boolean);
  if (!answers.length) return false;

  const compactGuess = compactNoSpaces(guess);
  for (const answer of answers) {
    if (!answer) continue;
    if (guess === answer || (compactGuess && compactGuess === compactNoSpaces(answer))) return true;
  }

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

  const answers = Array.isArray(rawAnswers) ? rawAnswers.map((a) => normalizer(a)).filter(Boolean) : [normalizer(rawAnswers)].filter(Boolean);
  if (!answers.length) return false;

  const uniqueAnswers = Array.from(new Set(answers));
  const paddedGuess = ` ${guess} `;
  const compactGuess = compactNoSpaces(guess);

  for (const answer of uniqueAnswers) {
    if (guess === answer) return true;
    if (compactGuess && compactGuess === compactNoSpaces(answer)) return true;
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

  const answers = Array.isArray(rawAnswers) ? rawAnswers.map((a) => normalizer(a)).filter(Boolean) : [normalizer(rawAnswers)].filter(Boolean);
  if (!answers.length) return false;

  if (isStrictAliasGuessCorrect(guess, answers, (v) => String(v || "")))
    return true;

  const uniqueAnswers = Array.from(new Set(answers));
  const minGuessLength = Number(options?.minGuessLength || 4);
  const minTokenLength = Number(options?.minTokenLength || 3);
  const singleTokenMinLength = Number(options?.singleTokenMinLength || 5);
  const paddedGuess = ` ${guess} `;
  const compactGuess = compactNoSpaces(guess);

  if (guess.length >= minGuessLength) {
    for (const answer of uniqueAnswers) {
      const paddedAnswer = ` ${answer} `;
      if (paddedAnswer.includes(paddedGuess)) return true;
      if (compactGuess && compactGuess === compactNoSpaces(answer)) return true;
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
    .filter((t) => t.length >= 4 && t.length <= 10);
  return Array.from(new Set(tokens));
}

function buildPlayerAnswerAliases(name, aliases = []) {
  const out = new Set();
  const add = (value) => { const normalized = normalizePlayerGuess(value); if (normalized) out.add(normalized); const compact = buildCompactAlias(value); if (compact) out.add(compact); const tokens = normalized ? normalized.split(/\s+/).filter(Boolean) : []; if (tokens.length > 0) { for (const token of tokens) { if (token.length >= 3) out.add(token); } } if (tokens.length > 1) { const surname = tokens[tokens.length - 1]; if (surname && surname.length >= 3) out.add(surname); const knownName = tokens[0]; if (knownName && knownName.length >= 3) out.add(knownName); const compoundSurname = tokens.slice(-2).join(" ").trim(); if (compoundSurname.length >= 5) out.add(compoundSurname); } };
  add(name);
  const extra = Array.isArray(aliases) ? aliases : [];
  for (const alias of extra) add(alias);
  return Array.from(out.values());
}

const PLAYER_RETIRED_PATTERNS = [
  /\s*_Retired\s*$/i,
  /\s*_retired\s*$/i,
  /\s*\(Retired\)\s*$/i,
  /\s*\(retired\)\s*$/i,
  /\s*-\s*Retired\s*$/i,
  /\s*Retired\s*$/i,
];
const PLAYER_RETIRED_ITALIAN = " (Ritirato)";

function normalizePlayerDisplayName(str) {
  if (!str || typeof str !== "string") return str;
  let out = String(str).trim();
  for (const re of PLAYER_RETIRED_PATTERNS) {
    out = out.replace(re, PLAYER_RETIRED_ITALIAN);
  }
  return out.trim() || str;
}

function buildPlayerAliases(player) {
  const aliases = new Set();
  const add = (value) => { const normalized = normalizePlayerGuess(value); if (normalized) aliases.add(normalized); };
  add(player?.strPlayer);
  add(normalizePlayerDisplayName(player?.strPlayer));
  add(player?.strKnownAs);
  add(player?.strNickname);
  return Array.from(aliases.values());
}

function isFootballPlayer(player) {
  if (!player || typeof player !== "object") return false;
  const sportRaw = String(player?.strSport || "").trim().toLowerCase();
  const teamRaw = String(player?.strTeam || "").trim().toLowerCase();
  const leagueRaw = String(player?.strLeague || "").trim().toLowerCase();
  const footballSports = new Set(["soccer", "association football", "football", "calcio",]);
  if (sportRaw && !footballSports.has(sportRaw)) return false;
  const blockedHints = ["rugby", "nfl", "basket", "nba", "hockey", "baseball", "cricket", "volley", "handball",];
  const combined = `${teamRaw} ${leagueRaw}`;
  if (blockedHints.some((hint) => combined.includes(hint))) return false;
  return true;
}

function isYouthReserveOrWomenTeam(team) {
  const combined = [
    team?.strTeam,
    team?.strLeague,
    team?.strLeagueAlternate,
    team?.strDescriptionEN,
    team?.strDescriptionIT,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return /(women|femminile|femenino|u17|u18|u19|u20|u21|u23|academy|primavera|reserve|reserves|b team|under-\d+)/i.test(combined);
}

function scoreTeamPopularity(team) {
  let score = 0;
  if (team?.strBadge) score += 3;
  if (team?.strLogo) score += 2;
  if (team?.strBanner) score += 1;
  if (team?.strFanart1 || team?.strFanart2 || team?.strFanart3 || team?.strFanart4) score += 2;
  if (team?.strStadiumThumb) score += 1;
  if (team?.strDescriptionEN || team?.strDescriptionIT) score += 1;
  if (team?.intFormedYear) score += 1;
  if (team?.strWebsite || team?.strFacebook || team?.strInstagram || team?.strTwitter || team?.strYoutube) score += 1;
  return score;
}

function isLikelyFamousTeam(team, cfg) {
  if (!team?.strTeam || !team?.strBadge) return false;
  if (isYouthReserveOrWomenTeam(team)) return false;
  const pinnedNames = Array.isArray(cfg?.guessTeam?.famousNames) ? cfg.guessTeam.famousNames.map((value) => normalizeCountryName(value)).filter(Boolean) : [];
  const normalizedName = normalizeCountryName(team.strTeam);
  if (normalizedName && pinnedNames.includes(normalizedName)) return true;
  const minScore = Math.max(4, Number(cfg?.guessTeam?.leagueFamousMinScore || 6));
  return scoreTeamPopularity(team) >= minScore;
}

function hasUsablePlayerImage(player) {
  return Boolean(player?.strThumb || player?.strCutout || player?.strRender);
}

function isYouthOrReservePlayer(player) {
  const combined = [
    player?.strTeam,
    player?.strLeague,
    player?.strPosition,
    player?.strDescriptionEN,
    player?.strDescriptionIT,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return /(u17|u18|u19|u20|u21|u23|youth|academy|primavera|reserve|reserves|b team|under-\d+)/i.test(combined);
}

function scorePlayerPopularity(player) {
  let score = 0;
  if (player?.strThumb) score += 4;
  if (player?.strCutout) score += 4;
  if (player?.strRender) score += 2;
  if (player?.strFanart1) score += 2;
  if (player?.strBanner) score += 1;
  if (player?.strDescriptionEN || player?.strDescriptionIT) score += 2;
  if (player?.strFacebook || player?.strInstagram || player?.strTwitter) score += 1;
  if (player?.strPosition) score += 1;
  if (player?.strNumber) score += 1;
  if (player?.strNationality) score += 1;
  return score;
}

function isLikelyFamousFootballPlayer(player, minScore = 7) {
  if (!isFootballPlayer(player)) return false;
  if (!player?.strPlayer) return false;
  if (isYouthOrReservePlayer(player)) return false;
  if (!hasUsablePlayerImage(player)) return false;
  return scorePlayerPopularity(player) >= minScore;
}

function buildPlayerInfoFromApiPlayer(player) {
  if (!player?.strPlayer) return null;
  const image = player.strThumb || player.strCutout || player.strRender || null;
  if (!image) return null;
  return {
    name: normalizePlayerDisplayName(player.strPlayer),
    team: player.strTeam || "Squadra sconosciuta",
    nationality: player.strNationality || "Nazionalità sconosciuta",
    image,
    aliases: buildPlayerAliases(player),
  };
}

async function loadLeaguePlayersFromApi(cfg) {
  const now = Date.now();
  if (cachedLeaguePlayers && now - cachedLeaguePlayersAt < LEAGUE_PLAYER_CACHE_TTL_MS) return cachedLeaguePlayers;

  const teams = await loadFootballTeamsFromApi(cfg);
  const playerApiBase = cfg?.guessPlayer?.teamApiUrl || "https://www.thesportsdb.com/api/v1/json/123/lookup_all_players.php?id=";
  const minPopularityScore = Math.max(5, Number(cfg?.guessPlayer?.leagueFamousMinScore || 7));
  const out = [];
  const seenNames = new Set();

  for (const team of teams) {
    const teamId = String(team?.teamId || "").trim();
    if (!teamId) continue;
    try {
      const url = `${playerApiBase}${encodeURIComponent(teamId)}`;
      const res = await axios.get(url, { timeout: 15000 });
      const players = Array.isArray(res?.data?.player) ? res.data.player : [];
      for (const player of players) {
        if (!isLikelyFamousFootballPlayer(player, minPopularityScore)) continue;
        const normalizedName = normalizePlayerGuess(player?.strPlayer);
        if (!normalizedName || seenNames.has(normalizedName)) continue;
        const info = buildPlayerInfoFromApiPlayer(player);
        if (!info) continue;
        seenNames.add(normalizedName);
        out.push(info);
      }
    } catch (err) {
      warnMinigame(err);
    }
  }

  cachedLeaguePlayers = out;
  cachedLeaguePlayersAt = now;
  return cachedLeaguePlayers;
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
    const player = source.find((p) => (p?.strThumb || p?.strCutout) && p?.strPlayer) || source[0];
    if (!player?.strPlayer) return null;
    if (!player.strThumb && !player.strCutout) return null;
    return {
      name: normalizePlayerDisplayName(player.strPlayer),
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
        name: normalizePlayerDisplayName(player.strPlayer),
        team: player.strTeam || "Squadra sconosciuta",
        nationality: player.strNationality || "Nazionalità sconosciuta",
        image: player.strThumb || player.strCutout || null,
        aliases: buildPlayerAliases(player),
      };
    } catch (err) {
      warnMinigame(err);
    }
  }
  return null;
}

async function fetchFamousPlayer(cfg) {
  const customNames = Array.isArray(cfg?.guessPlayer?.famousNames) ? cfg.guessPlayer.famousNames : [];
  const names = customNames.map((name) => String(name || "").trim()).filter(Boolean);
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

async function fetchLeagueFamousPlayer(cfg) {
  const players = await loadLeaguePlayersFromApi(cfg);
  if (!players.length) return null;
  return players[randomBetween(0, players.length - 1)] || null;
}

async function fetchRandomSong(cfg) {
  const apiBase = cfg?.guessSong?.apiUrl;
  if (!apiBase) return null;
  const popularTerms = Array.isArray(cfg?.guessSong?.popularTerms) && cfg.guessSong.popularTerms.length ? cfg.guessSong.popularTerms : ["the weeknd", "dua lipa", "ed sheeran", "drake", "ariana grande", "taylor swift", "billie eilish", "maneskin", "elodie", "sfera ebbasta", "thasup", "bad bunny", "eminem", "coldplay", "maroon 5", "bruno mars", "adele", "beyoncé", "rihanna", "justin bieber", "shawn mendes", "harry styles", "the chainsmokers", "david guetta", "calvin harris", "marco mengoni", "fedez", "j-ax", "ghali", "salmo", "lazza", "madame", "rosa chemical", "tananai", "blanco", "ultimo", "lorenzo fragola", "laura pausini", "eros ramazzotti", "vasco rossi", "ligabue", "tiziano ferro", "jovanotti", "giorgia", "alessandra amoroso", "articolo 31", "gemitaiz", "caparezza",];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const term = popularTerms[randomBetween(0, popularTerms.length - 1)];
    const url = `${apiBase}${encodeURIComponent(term)}&entity=song&limit=50`;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      const results = Array.isArray(res?.data?.results) ? res.data.results : [];
      const songs = results.filter((item) => item?.trackName && item?.artistName && item?.previewUrl,);
      if (!songs.length) continue;
      const song = songs[randomBetween(0, songs.length - 1)];
      const artwork = song.artworkUrl100 ? song.artworkUrl100.replace("100x100bb", "600x600bb") : null;
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
    } catch (err) {
      warnMinigame(err);
    }
  }
  return null;
}

async function fetchAudioAttachment(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, });
    const data = Buffer.from(res.data);
    if (!data || !data.length) return null;
    return data;
  } catch {
    return null;
  }
}

const POPULAR_SONG_TOP_PER_SOURCE = 50;
const DEFAULT_POPULAR_FEEDS = [
  "https://itunes.apple.com/it/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/us/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/gb/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/fr/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/de/rss/topsongs/limit=100/json",
];

async function loadPopularSongList(cfg) {
  const now = Date.now();
  if (cachedSongs && now - cachedSongsAt < SONG_CACHE_TTL_MS)
    return cachedSongs;
  const all = [];
  const topN = Math.max(20, Number(cfg?.guessSong?.topPerSource ?? POPULAR_SONG_TOP_PER_SOURCE) || POPULAR_SONG_TOP_PER_SOURCE);

  const deezerChartUrl = cfg?.guessSong?.deezerChartUrl || "https://api.deezer.com/chart/0/tracks?limit=100";
  try {
    const chartRes = await axios.get(deezerChartUrl, { timeout: 15000 });
    const tracks = Array.isArray(chartRes?.data?.data) ? chartRes.data.data : [];
    const slice = tracks.slice(0, topN);
    for (const track of slice) {
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
  } catch (err) {
    warnMinigame(err);
  }

  const feeds = Array.isArray(cfg?.guessSong?.popularFeeds)?.length ? cfg.guessSong.popularFeeds : DEFAULT_POPULAR_FEEDS;
  for (const feed of feeds) {
    if (!feed) continue;
    try {
      const res = await axios.get(feed, { timeout: 15000 });
      const entries = Array.isArray(res?.data?.feed?.entry) ? res.data.feed.entry : [];
      const sliceEntries = entries.slice(0, topN);
      for (const entry of sliceEntries) {
        const id = entry?.id?.attributes?.["im:id"] || entry?.id?.attributes?.im_id;
        const title = entry?.["im:name"]?.label || entry?.title?.label;
        const artist = entry?.["im:artist"]?.label || entry?.["im:artist"]?.name;
        const images = Array.isArray(entry?.["im:image"]) ? entry["im:image"] : [];
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
    } catch (err) {
      warnMinigame(err);
    }
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
  const scored = candidates.map((artist) => { const artistLabel = normalizeArtistLabel(artist?.name); const hasCountry = Boolean(artist?.country || artist?.area?.name); const mbScore = Number(artist?.score || 0); let nameScore = 0; if (artistLabel && target) { if (artistLabel === target) nameScore = 120; else if (artistLabel.includes(target) || target.includes(artistLabel)) nameScore = 60; } const countryBonus = hasCountry ? 30 : 0; return { artist, score: mbScore + nameScore + countryBonus }; }).sort((a, b) => b.score - a.score);
  return scored[0]?.artist || null;
}

async function fetchArtistCountry(cfg, artistName) {
  if (!artistName) return null;
  const apiBase = cfg?.guessSong?.artistApiUrl || "https://musicbrainz.org/ws/2/artist/?query=artist:";
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
      const res = await axios.get(url, { timeout: 15000, headers: { "User-Agent": "ViniliCaffeBot/1.0 (discord bot)", }, });
      const candidates = Array.isArray(res?.data?.artists) ? res.data.artists : [];
      const artist = pickBestArtistCandidate(candidates, artistName);
      const country = artist?.country || artist?.area?.name || null;
      if (country) return country;
    } catch (err) {
      warnMinigame(err);
    }
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
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", });
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
    .setTitle("Indovina il numero <a:VC_Exclamation:1448687427836444854>")
    .setDescription(
      [
        `<:VC_EXP:1468714279673925883> Indovina un numero tra **${min}** e **${max}** per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per indovinarlo!`,
        `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildGuessWordEmbed(scrambled, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina la parola <a:VC_Exclamation:1448687427836444854>")
    .setDescription(
      [
        `<:VC_EXP:1468714279673925883> Indovina la parola da queste lettere: **${scrambled}** per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per indovinarla!`,
        `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildGuessFlagEmbed(flagUrl, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina la bandiera <a:VC_Exclamation:1448687427836444854>")
    .setDescription(
      [
        `<:VC_EXP:1468714279673925883> Indovina la nazione da questa bandiera per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per indovinarla!`,
        `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    )
    .setImage(flagUrl);
}

function buildGuessPlayerEmbed(rewardExp, durationMs, imageUrl) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina il calciatore <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> Indovina il calciatore pi\u00F9 famoso per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per indovinarlo!`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),);
  if (imageUrl) {
    embed.setImage(imageUrl);
  }
  return embed;
}

function buildGuessSongEmbed(rewardExp, durationMs, artworkUrl) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina la canzone <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> Indovina la canzone per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per indovinarla!`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),);
  if (artworkUrl) embed.setImage(artworkUrl);
  return embed;
}

function buildGuessCapitalEmbed(country, rewardExp, durationMs, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina la capitale <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> Indovina la capitale di **${country}** per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per rispondere!`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessRegionCapitalEmbed(region, rewardExp, durationMs, imageUrl = null, imageName = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina il capoluogo <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> Indovina il capoluogo della regione **${region}** per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per rispondere!`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageName) embed.setImage(`attachment://${imageName}`);
  else if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessReverseCapitalEmbed(capital, rewardExp, durationMs, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Capitale inverso <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> **${capital}** è la capitale di quale Stato? Indovina per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per rispondere!`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildFastTypeEmbed(phrase, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Scrivi per primo la frase <a:VC_Exclamation:1448687427836444854>")
    .setDescription(
      [
        `<:VC_EXP:1468714279673925883> Il primo che scrive questa frase ottiene **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per scrivere la frase.`,
        `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildGuessTeamEmbed(rewardExp, durationMs, imageUrl) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina la squadra di calcio <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> Indovina la squadra di calcio dal logo per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per indovinare la squadra.`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessSingerEmbed(rewardExp, durationMs, imageUrl) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina il cantante <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> Indovina il cantante dalla foto per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per indovinare il cantante.`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessAlbumEmbed(rewardExp, durationMs, imageUrlOrAttachment) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina l'album <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> Indovina l'album dalla copertina per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per indovinare l'album.`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageUrlOrAttachment) embed.setImage(imageUrlOrAttachment);
  return embed;
}

const CENSORED_ARTWORK_MAX_SIDE = 600;
const CENSOR_MAX_BLUR_PX = 55;
const CENSOR_STEP_INTERVAL_MS = 60 * 1000;

/**
 * Carica l'artwork e applica blur reale su tutta la copertina (0 = nitida, 1 = massimo blur).
 * @param {string} imageUrl - URL dell'immagine
 * @param {{ attachmentName?: string, overlayAlpha?: number }} [opts] - overlayAlpha in [0,1]: 0 = nessun blur, 1 = blur massimo
 * @returns {Promise<{ buffer: Buffer, attachmentName: string } | null>}
 */
async function censorArtworkImage(imageUrl, opts = {}) {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const overlayAlpha = Math.max(0, Math.min(1, Number(opts?.overlayAlpha ?? 0.98)));
  try {
    const res = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 12000 });
    const buf = Buffer.from(res.data);
    if (!buf?.length) return null;
    const img = await loadImage(buf);
    if (!img || !img.width || !img.height) return null;

    const maxSide = CENSORED_ARTWORK_MAX_SIDE;
    let w = img.width;
    let h = img.height;
    if (w > maxSide || h > maxSide) {
      if (w >= h) {
        h = Math.round((h * maxSide) / w);
        w = maxSide;
      } else {
        w = Math.round((w * maxSide) / h);
        h = maxSide;
      }
    }

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");

    if (overlayAlpha > 0) {
      const blurPx = (Math.min(w, h) / 400) * CENSOR_MAX_BLUR_PX * overlayAlpha;
      ctx.filter = `blur(${Math.max(1, Math.round(blurPx))}px)`;
    }
    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);
    ctx.filter = "none";

    const attachmentName = opts?.attachmentName || "minigame_artwork.png";
    return { buffer: canvas.toBuffer("image/png"), attachmentName };
  } catch {
    return null;
  }
}

/**
 * Schedula gli aggiornamenti a tempo: ogni minuto si riduce la censura, nell'ultimo minuto immagine pulita.
 * @param {object} params - channelId, channel, gameMessageId, originalArtworkUrl, durationMs, buildEmbed, rewardExp, attachmentName, gameType
 * @returns {NodeJS.Timeout[]} timeouts da clearare alla fine del gioco
 */
function scheduleArtworkCensorSteps(params) {
  const { channelId, channel, gameMessageId, originalArtworkUrl, durationMs, buildEmbed, rewardExp, attachmentName, gameType } = params;
  if (!channelId || !channel || !gameMessageId || !originalArtworkUrl || !buildEmbed) return [];
  const timeouts = [];
  const totalMinutes = Math.max(1, Math.floor(durationMs / CENSOR_STEP_INTERVAL_MS));
  for (let step = 1; step < totalMinutes; step++) {
    const delay = durationMs - step * CENSOR_STEP_INTERVAL_MS;
    if (delay < 8000) continue;
    const isLastStep = step === totalMinutes - 1;
    const alpha = isLastStep ? 0 : Math.max(0, 0.9 - (step * 0.9) / Math.max(1, totalMinutes - 1));
    const t = setTimeout(async () => {
      const game = activeGames.get(channelId);
      if (!game || (game.type !== "guessSong" && game.type !== "guessAlbum")) return;
      try {
        const msg = await channel.messages.fetch(gameMessageId).catch(() => null);
        if (!msg?.editable) return;
        if (alpha <= 0) {
          const embed = buildEmbed(rewardExp, durationMs, originalArtworkUrl);
          const payload = gameType === "guessSong" ? { embeds: [embed], components: msg.components, files: [] } : { embeds: [embed], files: [] };
          await msg.edit(payload).catch(() => {});
          return;
        }
        const censored = await censorArtworkImage(originalArtworkUrl, { attachmentName, overlayAlpha: alpha });
        if (!censored) return;
        const embed = buildEmbed(rewardExp, durationMs, `attachment://${censored.attachmentName}`);
        const files = [new AttachmentBuilder(censored.buffer, { name: censored.attachmentName })];
        const payload = gameType === "guessSong" ? { embeds: [embed], components: msg.components, files } : { embeds: [embed], files };
        await msg.edit(payload).catch(() => {});
      } catch (err) {
      warnMinigame(err);
    }
    }, delay);
    if (typeof t.unref === "function") t.unref();
    timeouts.push(t);
  }
  return timeouts;
}

function buildHangmanEmbed(maskedWord, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Impiccato <a:VC_Exclamation:1448687427836444854>")
    .setDescription(
      [
        `<:VC_EXP:1468714279673925883> Scrivi una lettera o prova la parola intera per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per indovinare la parola.`,
        `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildRegionNameImageAttachment(regionName) {
  const safeRegion = String(regionName || "").trim();
  if (!safeRegion) return null;
  try {
    registerCanvasFonts(canvasModule);
    const width = 1200;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);
    const pad = CANVAS_STYLE.padding;
    const cardW = width - pad * 2;
    const cardH = height - pad * 2;
    fillCanvasCard(ctx, pad, pad, cardW, cardH, 20);

    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontStackPrimaryOnly(52, "700");
    ctx.fillText("Regione", width / 2, 140);
    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    ctx.font = fontStackPrimaryOnly(96, "700");
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
    .setTitle("Cultura generale <a:VC_Exclamation:1448687427836444854>")
    .setDescription(
      [
        `<:VC_EXP:1468714279673925883> **Domanda:** ${question} per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per rispondere alla domanda.`,
        `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

const DRIVING_QUIZ_LETTERS = ["A", "B", "C", "D"];

function getDrivingQuizThematicHint(row) {
  const s = String(row?.statement || "").toLowerCase();
  if (!s) return null;
  if (/velocit|limite|km\/h|130|50|90/.test(s)) return `<a:VC_Flame:1473106990493335665> La domanda riguarda i **limiti di velocità**.`;
  if (/precedenza|incrocio|destra|fermarsi/.test(s)) return `<a:VC_Flame:1473106990493335665> La domanda riguarda **precedenza** o **incroci**.`;
  if (/semaforo|rosso|giallo|verde/.test(s)) return `<a:VC_Flame:1473106990493335665> La domanda riguarda i **semafori**.`;
  if (/segnal|triangolo|circolare|ottagonale|stop/.test(s)) return `<a:VC_Flame:1473106990493335665> La domanda riguarda la **segnaletica stradale**.`;
  if (/sosta|parcheggio|divieto/.test(s)) return `<a:VC_Flame:1473106990493335665> La domanda riguarda **sosta** o **parcheggio**.`;
  if (/cintur|casco|telefono/.test(s)) return `<a:VC_Flame:1473106990493335665> La domanda riguarda **obblighi** del conducente.`;
  if (/sorpasso|autostrada|corsia/.test(s)) return `<a:VC_Flame:1473106990493335665> La domanda riguarda **sorpasso** o **autostrada**.`;
  return `<a:VC_Flame:1473106990493335665> La risposta è **Vero** o **Falso**: rifletti sulla normativa.`;
}

function buildDrivingQuizEmbed(row, rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const statement = row?.statement ?? "";
  const isMultiple = row?.questionType === "multiple" && Array.isArray(row.options) && row.options.length >= 2;
  const lines = [`<:VC_EXP:1468714279673925883> **${isMultiple ? "Domanda" : "Affermazione"}:**${statement}`,
  ];
  if (isMultiple) {
    row.options.forEach((opt, i) => {
      const letter = DRIVING_QUIZ_LETTERS[i] ?? String(i + 1);
      lines.push(`**${letter})** ${opt}`);
    });
    lines.push("Rispondi con la lettera (A, B, C, D), il numero (1-4) o il testo della risposta.");
  } else {
    lines.push("Rispondi con `vero` o `falso`.");
  }
  lines.push(
    `Ricompensa: **${rewardExp} exp**`,
    `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti**.`,
  );
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Quiz patente <a:VC_Exclamation:1448687427836444854>")
    .setDescription(lines.join("\n"));
}

function buildMathExpressionEmbed( expression, rewardExp, durationMs, imageName = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Espressione matematica <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> Risolvi: **${expression}** per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per risolvere l'espressione.`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageName) embed.setImage(`attachment://${imageName}`);
  return embed;
}

function buildFindBotEmbed(rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Trova il bot <a:VC_Exclamation:1448687427836444854>")
    .setDescription(
      [
        `<:VC_EXP:1468714279673925883> Trova il messaggio del bot tra i canali del server, premi il bottone per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per trovarlo.`,
        `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildFindBotButtonEmbed(rewardExp, durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Sei vicino al bot <a:VC_Exclamation:1448687427836444854>")
    .setDescription(
      [
        `<:VC_EXP:1468714279673925883> Hai trovato il messaggio nascosto: clicca il bottone per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per cliccare il bottone.`,
        `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildMinuteHintEmbed(channelId) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Heart:1448672728822448141> Indizio")
    .setDescription(`<a:VC_Arrow:1448672967721615452> <#${channelId}>`);
}

function buildGenericHintEmbed(text) {
  const safeText = normalizeHintTextForDiscord(typeof text === "string" ? text : String(text ?? ""));
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Heart:1448672728822448141> Indizio")
    .setDescription(`<a:VC_Arrow:1448672967721615452> ${safeText}`);
}

function buildMaskedTextHint(value) {
  const normalized = normalizeCountryName(value);
  if (!normalized) return null;
  const plain = normalized.replace(/\s+/g, "");
  if (plain.length <= 2) return `<a:VC_Flame:1473106990493335665> Inizia con **${plain[0] || "?"}**`;
  return `<a:VC_Flame:1473106990493335665> Inizia con **${plain[0]}** e termina con **${plain[plain.length - 1]}** (${plain.length} lettere)`;
}

const ACCENT_TO_ASCII = {
  à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a", ā: "a", ă: "a", ą: "a", æ: "ae",
  è: "e", é: "e", ê: "e", ë: "e", ē: "e", ĕ: "e", ė: "e", ę: "e", ě: "e",
  ì: "i", í: "i", î: "i", ï: "i", ı: "i", ī: "i", ĭ: "i", į: "i",
  ò: "o", ó: "o", ô: "o", õ: "o", ö: "o", ō: "o", ŏ: "o", ő: "o", œ: "oe",
  ù: "u", ú: "u", û: "u", ü: "u", ū: "u", ŭ: "u", ů: "u", ű: "u",
  ñ: "n", Ñ: "N", ç: "c", Ç: "C", ý: "y", ÿ: "y", ß: "ss",
  À: "A", Á: "A", Â: "A", Ã: "A", Ä: "A", Å: "A", È: "E", É: "E", Ê: "E", Ë: "E",
  Ì: "I", Í: "I", Î: "I", Ï: "I", Ò: "O", Ó: "O", Ô: "O", Õ: "O", Ö: "O",
  Ù: "U", Ú: "U", Û: "U", Ü: "U",
};

function normalizeHintTextForDiscord(str) {
  if (str == null || typeof str !== "string") return "";
  let s = String(str).normalize("NFKC");
  const out = [];
  for (const ch of Array.from(s)) {
    const cp = ch.codePointAt(0);
    if (!Number.isFinite(cp)) {
      out.push(ch);
      continue;
    }
    if (ACCENT_TO_ASCII[ch] !== undefined) {
      out.push(ACCENT_TO_ASCII[ch]);
      continue;
    }
    if (cp >= 0xff01 && cp <= 0xff5e) {
      out.push(String.fromCodePoint(cp - 0xff01 + 0x21));
      continue;
    }
    if (cp >= 0x1d400 && cp <= 0x1d7ff) {
      const mathToAscii = [
        [0x1d400, 0x1d419, 0x41], [0x1d41a, 0x1d433, 0x61], [0x1d434, 0x1d44d, 0x41], [0x1d44e, 0x1d467, 0x61],
        [0x1d468, 0x1d481, 0x41], [0x1d482, 0x1d49b, 0x61], [0x1d49c, 0x1d4b5, 0x41], [0x1d4b6, 0x1d4cf, 0x61],
        [0x1d4d0, 0x1d4e9, 0x41], [0x1d4ea, 0x1d503, 0x61], [0x1d504, 0x1d51d, 0x41], [0x1d51e, 0x1d537, 0x61],
        [0x1d538, 0x1d551, 0x41], [0x1d552, 0x1d56b, 0x61], [0x1d56c, 0x1d585, 0x41], [0x1d586, 0x1d59f, 0x61],
        [0x1d5a0, 0x1d5b9, 0x41], [0x1d5ba, 0x1d5d3, 0x61], [0x1d5d4, 0x1d5ed, 0x41], [0x1d5ee, 0x1d607, 0x61],
        [0x1d608, 0x1d621, 0x41], [0x1d622, 0x1d63b, 0x61], [0x1d63c, 0x1d655, 0x41], [0x1d656, 0x1d66f, 0x61],
        [0x1d670, 0x1d689, 0x41], [0x1d68a, 0x1d6a3, 0x61],
        [0x1d7ce, 0x1d7d7, 0x30], [0x1d7e2, 0x1d7eb, 0x30], [0x1d7ec, 0x1d7f5, 0x30],
      ];
      let mapped = null;
      for (const [start, end, base] of mathToAscii) {
        if (cp >= start && cp <= end) {
          mapped = String.fromCodePoint(base + (cp - start));
          break;
        }
      }
      out.push(mapped ?? ch);
      continue;
    }
    if (cp <= 0x7f) {
      out.push(ch);
      continue;
    }
    const decomp = ch.normalize("NFD");
    if (decomp.length >= 1 && decomp[0].codePointAt(0) <= 0x7f) {
      out.push(decomp[0]);
      continue;
    }
    out.push(ch);
  }
  return out.join("");
}

/**
 * Indizio con lettere rivelate in posizione (es. "p _ r _ l a"). Non banale come "inizia per" o "N lettere".
 * Mantiene case originale e tutti gli spazi per non perdere caratteri in output.
 */
function buildRevealHint(value, revealRatio = 0.4, includeEmoji = false) {
  const raw = (typeof value === "string" ? value : String(value || ""));
  const normalized = normalizeHintTextForDiscord(raw).trim();
  if (!normalized) return null;
  const chars = normalized.split("");
  const charsLower = normalized.toLowerCase().split("");
  const indices = charsLower
    .map((_, i) => i)
    .filter((i) => /[a-z0-9]/.test(charsLower[i]));
  if (indices.length === 0) return null;
  const wrap = (s) => (includeEmoji ? `<a:VC_Flame:1473106990493335665> **${s}**` : `**${s}**`);
  const isLetterOrDigit = (c) => /[a-z0-9]/i.test(c);
  if (indices.length <= 2) {
    const out = chars.map((c, i) => (indices.includes(i) ? c : isLetterOrDigit(c) ? "_" : c)).join("");
    return wrap(out.replace(/_/g, "\\_"));
  }
  const toReveal = Math.max(2, Math.min(indices.length, Math.round(indices.length * Math.min(0.5, Math.max(0.35, revealRatio)))));
  const revealedSet = new Set([indices[0], indices[indices.length - 1]]);
  const middle = indices.slice(1, -1);
  const step = middle.length <= 1 ? 1 : Math.max(1, Math.floor(middle.length / (toReveal - 2)));
  for (let k = 0; k < middle.length && revealedSet.size < toReveal; k += step) {
    revealedSet.add(middle[k]);
  }
  const out = chars.map((c, i) => {
    if (revealedSet.has(i)) return c;
    if (isLetterOrDigit(c)) return "_";
    return c;
  });
  const rawOut = out.join("");
  const escapedForDiscord = rawOut.replace(/_/g, "\\_");
  return wrap(escapedForDiscord);
}

function buildCountryHint(country) {
  if (!country) return null;
  const parts = [];
  if (country.region) parts.push(`Continente: **${country.region}**`);
  if (country.subregion) parts.push(`Area: **${country.subregion}**`);
  if (country.populationLabel) parts.push(`Popolazione: **${country.populationLabel}**`);
  if (Array.isArray(country.languages) && country.languages.length) {
    parts.push(`Lingua/e: **${country.languages.slice(0, 2).join(", ")}**`);
  }
  if (!parts.length) return null;
  return `<a:VC_Flame:1473106990493335665> ${parts.join(" \u2022 ")}`;
}

function buildCapitalHint(countryName) {
  const key = normalizeCountryName(countryName || "").replace(/\s+/g, " ");
  const region = key ? CAPITAL_COUNTRY_REGION[key] : null;
  if (!region) return null;
  return `<a:VC_Flame:1473106990493335665> Capitale di un paese in **${region}**.`;
}

function buildRegionCapitalHint(regionName) {
  const data = regionName ? REGION_HINT_DATA[regionName] : null;
  if (!data) return null;
  const parts = [];
  if (Array.isArray(data.near) && data.near.length) {
    parts.push(`confina con **${data.near.join("** e **")}**`);
  }
  if (data.sea) {
    parts.push(`si affaccia sul **${data.sea}**`);
  }
  if (data.population) {
    parts.push(`ha circa **${data.population}** abitanti`);
  }
  if (!parts.length) return null;
  return `<a:VC_Flame:1473106990493335665> Capoluogo di una regione che ${parts.join(" • ")}.`;
}

function buildNumberNearHint(target, min, max) {
  const low = Number(min || 1);
  const high = Number(max || 100);
  const range = Math.max(1, high - low);
  const band = Math.max(2, Math.round(range * 0.18));
  const from = Math.max(low, Number(target) - band);
  const to = Math.min(high, Number(target) + band);
  return `<a:VC_Flame:1473106990493335665> Il numero è tra **${from}** e **${to}**.`;
}

function buildHintEmbed(isHigher) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      isHigher
        ? "<:thumbsup:1471292172145004768> <a:VC_Arrow:1448672967721615452> Più alto!"
        : "<:thumbsdown:1471292163957457013> <a:VC_Arrow:1448672967721615452> Più basso!",
    );
}

function buildYearHintEmbed(guessBeforeTarget) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      guessBeforeTarget
        ? "<:thumbsup:1471292172145004768> <a:VC_Arrow:1448672967721615452> Dopo!"
        : "<:thumbsdown:1471292163957457013> <a:VC_Arrow:1448672967721615452> Prima!",
    );
}

function buildWinEmbed(winnerId, effectiveExp, totalExp, details = null) {
  const lines = [
    `<a:VC_Winner:1448687700235256009> Complimenti <@${winnerId}>, hai vinto e guadagnato **${effectiveExp} exp**<a:VC_Exclamation:1448687427836444854>`,
  ];
  if (details) {
    const extras = [];
    if (details.fastBonus > 0) extras.push(`<a:VC_Flame:1473106990493335665> Risposta fulminea **+${details.fastBonus} exp**`);
    if (details.streakBonus > 0) extras.push(`<a:VC_Flame:1473106990493335665> Streak ${details.newStreak} **+${details.streakBonus} exp**`);
    if (extras.length) lines.push("", ...extras);
  }
  lines.push("", "<:VC_Stats:1448695844923510884> **Le tue statistiche:**", `<a:VC_Arrow:1448672967721615452> Ora hai un totale di **${totalExp} exp**`);
  if (details?.newStreak > 1) lines.push(`<a:VC_Arrow:1448672967721615452> Serie di vittorie: **${details.newStreak}** (record: **${details.bestStreak}**)`);
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Events:1448688007438667796> Un utente ha vinto<a:VC_Exclamation:1448687427836444854>")
    .setDescription(lines.join("\n"))
    .setFooter({
      text: 'Digita il comando "+mstats" per vedere i tuoi progressi',
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
  const remaining = nextReward ? Math.max(0, nextReward.exp - Number(totalExp || 0)) : 0;

  const description = [
    "<a:VC_Flower:1468685050966179841> Premio ricevuto <a:VC_Flower:1468685050966179841>",
    "",
    `<a:VC_Events:1448688007438667796> **__<@${member.id}>__**`,
    `hai ottenuto il ruolo <@&${reward.roleId}> per aver raggiunto **${reward.exp}** exp ai **Minigiochi** <a:VC_HeartsPink:1468685897389052008>`,
    "",
    nextReward
      ? `<a:VC_HeartsBlue:1468686100045369404> / ti mancano **${remaining}** exp per la prossima ricompensa!`
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
      text: "Gli exp guadagnati si sommano al tuo livello globale! Controlla le tue statistiche con il comando \`+mstats\`",
    });
}

async function handleExpReward(client, member, totalExp) {
  if (!member?.guild) return;
  const reward = getHighestEligibleReward(totalExp);
  if (!reward) return;
  if (member.roles.cache.has(reward.roleId)) return;

  await member.roles.add(reward.roleId).catch(() => { });

  const rewardChannel = await getChannelCached(client, REWARD_CHANNEL_ID);
  if (!rewardChannel) return;
  await rewardChannel
    .send({
      content: `${member}`,
      embeds: [buildRewardEmbed(member, reward, totalExp)],
    })
    .catch(() => { });
}

function buildTimeoutNumberEmbed(number) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! Il numero era **${number}**.`,
    );
}

function buildTimeoutWordEmbed(word) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! La parola era **${word}**.`,
    );
}

function buildTimeoutFlagEmbed(name) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! La bandiera era **${name}**.`,
    );
}

function buildTimeoutPlayerEmbed(name) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! Il calciatore era **${name}**.`,
    );
}

function buildTimeoutSongEmbed(title, artist) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! Era **${title}** \u2014 ${artist}.`,
    );
}

function buildTimeoutFindBotEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      "<a:VC_pixeltime:1470796283320209600> Tempo scaduto! Nessuno ha trovato il bot.",
    );
}

function buildTimeoutCapitalEmbed(country, answer) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! La capitale di **${country}** era **${answer}**.`,
    );
}

function buildTimeoutRegionCapitalEmbed(region, answer) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! Il capoluogo di **${region}** era **${answer}**.`,
    );
}

function buildTimeoutReverseCapitalEmbed(capital, answer) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! **${capital}** è la capitale di **${answer}**.`,
    );
}

function buildTimeoutFastTypeEmbed(phrase) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! La frase era \`${phrase}\`.`,
    );
}

function buildTimeoutTeamEmbed(team) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! La squadra era **${team}**.`,
    );
}

function buildTimeoutSingerEmbed(name) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! Il cantante era **${name}**.`,
    );
}

function buildTimeoutAlbumEmbed(name, artist) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! Era **${name}** di ${artist}.`,
    );
}

function buildTimeoutHangmanEmbed(word) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! La parola era **${word}**.`,
    );
}

function buildTimeoutItalianGkEmbed(answer) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! La risposta era **${answer}**.`,
    );
}

function buildTimeoutDrivingQuizEmbed(game) {
  const isMultiple = game?.questionType === "multiple" && Array.isArray(game?.options) && Number.isFinite(game?.correctIndex);
  let text;
  if (isMultiple && game.options[game.correctIndex] != null) {
    const letter = DRIVING_QUIZ_LETTERS[game.correctIndex] ?? String(game.correctIndex + 1);
    text = `La risposta corretta era **${letter}) ${game.options[game.correctIndex]}**.`;
  } else {
    text = `La risposta corretta era **${game?.answer ? "vero" : "falso"}**.`;
  }
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! ${text}`,
    );
}

function buildTimeoutMathEmbed(answer) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! Il risultato corretto era **${answer}**.`,
    );
}

function buildTimeoutGuessYearEmbed(title, subtitle, year) {
  const sub = subtitle ? ` — ${subtitle}` : "";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! **${title}**${sub} era del **${year}**.`,
    );
}

function buildTimeoutCompleteVerseEmbed(answer, song, artist) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! La risposta era **${answer}** (${song} — ${artist}).`,
    );
}

function buildTimeoutGuessEmojiEmbed(emojis, answer) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! ${emojis} era **${answer}**.`,
    );
}

function buildTimeoutQuoteFilmEmbed(quote, answer) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! La citazione è da **${answer}**.`,
    );
}

function buildTimeoutCompleteProverbEmbed(start, end) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! Il proverbio completo: **${start} ${end}**.`,
    );
}

function buildTimeoutSynonymAntonymEmbed(word, answer, kind) {
  const label = kind === "antonym" ? "Il contrario" : "Un sinonimo";
  const safeWord = word != null && String(word).trim() !== "" ? String(word) : "—";
  const safeAnswer = answer != null && String(answer).trim() !== "" ? String(answer) : "—";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! ${label} di **${safeWord}** era **${safeAnswer}**.`,
    );
}

function buildTimeoutGuessCityEmbed(landmark, city) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<a:VC_pixeltime:1470796283320209600> Tempo scaduto! **${landmark}** si trova a **${city}**.`,
    );
}

function buildGuessYearEmbed(title, subtitle, rewardExp, durationMs, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const sub = subtitle ? ` — ${subtitle}` : "";
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina l'anno <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> In che anno è uscito **${title}**${sub}? Scrivi l'anno per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per rispondere!`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildCompleteVerseEmbed(verse, rewardExp, durationMs, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Completa il verso <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> Completa: **${verse}** per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per rispondere!`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessEmojiEmbed(emojis, rewardExp, durationMs, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina da emoji <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> Cosa rappresenta **${emojis}**? Scrivi film, serie o canzone per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per rispondere!`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildQuoteFilmEmbed(quote, rewardExp, durationMs, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Citazione da film/serie <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> *"${quote}"* — Da quale film o serie? **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per rispondere!`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildCompleteProverbEmbed(start, rewardExp, durationMs, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Completa il proverbio <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> **${start}** ... Completa il proverbio per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per rispondere!`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildSynonymAntonymEmbed(word, kind, rewardExp, durationMs, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const label = kind === "antonym" ? "il contrario" : "un sinonimo";
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(kind === "antonym" ? "Trova il contrario <a:VC_Exclamation:1448687427836444854>" : "Trova il sinonimo <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> Scrivi ${label} di **${word}** per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per rispondere!`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessCityEmbed(landmark, rewardExp, durationMs, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Indovina la città <a:VC_Exclamation:1448687427836444854>")
    .setDescription([
      `<:VC_EXP:1468714279673925883> In quale città si trova **${landmark}**? **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1470796283320209600> Hai **${minutes} minuti** per rispondere!`,
      `> <a:VC_Winner:1448687700235256009> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function getAvailableGameTypes(cfg) {
  const types = [];
  if (cfg?.guessNumber !== false) types.push("guessNumber");
  if (cfg?.guessWord?.apiUrl) types.push("guessWord");
  if (cfg?.guessFlag?.apiUrl) types.push("guessFlag");
  if (cfg?.guessPlayer?.apiUrl) types.push("guessPlayer");
  if (cfg?.guessSong) types.push("guessSong");
  if (cfg?.guessCapital !== false) types.push("guessCapital");
  if (cfg?.guessReverseCapital !== false && (cfg?.guessReverseCapital?.apiUrl || cfg?.guessCapital?.apiUrl)) types.push("guessReverseCapital");
  if (cfg?.guessRegionCapital !== false) types.push("guessRegionCapital");
  if (cfg?.fastType !== false) types.push("fastType");
  if (cfg?.guessTeam) types.push("guessTeam");
  if (cfg?.guessSinger) types.push("guessSinger");
  if (cfg?.guessAlbum) types.push("guessAlbum");
  if (cfg?.hangman !== false) types.push("hangman");
  if (cfg?.italianGK !== false) types.push("italianGK");
  if (cfg?.drivingQuiz !== false) types.push("drivingQuiz");
  if (cfg?.mathExpression !== false) types.push("mathExpression");
  if (cfg?.findBot !== false) types.push("findBot");
  if (cfg?.guessYear !== false) types.push("guessYear");
  if (cfg?.completeVerse !== false) types.push("completeVerse");
  if (cfg?.guessEmoji !== false) types.push("guessEmoji");
  if (cfg?.quoteFilm !== false) types.push("quoteFilm");
  if (cfg?.completeProverb !== false) types.push("completeProverb");
  if (cfg?.synonymAntonym !== false) types.push("synonymAntonym");
  if (cfg?.guessCity !== false) types.push("guessCity");
  return types;
}

async function loadRotationState(client, cfg, guildIdOverride = null) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  const guildId = guildIdOverride ?? cfg?.guildId ?? (await getChannelCached(client, channelId))?.guild?.id ?? null;
  if (!guildId) return;
  const dateKey = getRomeDateKey(new Date());
  const doc = await MinigameRotation.findOne({ guildId, channelId }).lean().catch(() => null);
  if (doc && Array.isArray(doc.queue) && doc.dateKey === dateKey) {
    rotationDate = doc.dateKey;
    rotationQueue = shuffleArray(doc.queue.slice());
    return;
  }
  rotationDate = dateKey;
  rotationQueue = [];
  await MinigameRotation.findOneAndUpdate(
    { guildId, channelId },
    { $set: { dateKey, queue: [] } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => { });
}

async function saveRotationState(client, cfg, guildIdOverride = null) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  const guildId = guildIdOverride ?? cfg?.guildId ?? (await getChannelCached(client, channelId))?.guild?.id ?? null;
  if (!guildId) return;
  const dateKey = rotationDate || getRomeDateKey(new Date());
  await MinigameRotation.findOneAndUpdate(
    { guildId, channelId },
    { $set: { dateKey, queue: rotationQueue } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => { });
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function getNextGameType(client, cfg) {
  const available = getAvailableGameTypes(cfg);
  if (available.length === 0) return null;
  const guildId = cfg?.guildId ?? (cfg?.channelId ? (await getChannelCached(client, cfg.channelId))?.guild?.id ?? null : null);
  await loadRotationState(client, cfg, guildId);
  const todayKey = getRomeDateKey(new Date());
  const queueSet = new Set(rotationQueue);
  const availableSet = new Set(available);
  const queueMatchesConfig = available.length === queueSet.size && available.every((t) => queueSet.has(t));
  if (rotationDate !== todayKey || rotationQueue.length === 0 || !queueMatchesConfig) {
    rotationDate = todayKey;
    rotationQueue = shuffleArray(available.slice());
  }
  const channelId = cfg?.channelId;
  const now = Date.now();
  const lastPlayedArr = channelId ? (lastPlayedGameTypesByChannel.get(channelId) || []) : [];
  const excludeSet = new Set(lastPlayedArr);
  const cooldownUntilByType = channelId ? (lastPlayedAtByChannelAndType.get(channelId) || new Map()) : new Map();
  const isOnCooldown = (type) => {
    const at = cooldownUntilByType.get(type);
    return typeof at === "number" && now - at < GAME_TYPE_COOLDOWN_MS;
  };
  const halfAvailable = Math.floor(available.length / 2);
  if (rotationQueue.length < halfAvailable && available.length > 0) {
    rotationQueue = shuffleArray(available.slice());
  }
  let next = rotationQueue.shift() || available[0];
  while ((excludeSet.has(next) || isOnCooldown(next)) && (rotationQueue.length > 0 || available.length > 1)) {
    if (rotationQueue.length > 0) {
      rotationQueue.push(next);
      next = rotationQueue.shift();
    } else {
      const others = available.filter((t) => !excludeSet.has(t) && !isOnCooldown(t));
      next = others.length ? others[randomBetween(0, others.length - 1)] : available[0];
      break;
    }
  }
  await saveRotationState(client, cfg, guildId);
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

async function scheduleMinuteHint(client, hintChannelId, durationMs, channelId) {
  if (!hintChannelId || !durationMs || durationMs <= 60 * 1000) return null;
  const mainChannel = await getChannelCached(client, channelId);
  if (!mainChannel) return null;
  const delay = durationMs - 60 * 1000;
  const timer = setTimeout(async () => {
    await mainChannel
      .send({ embeds: [buildMinuteHintEmbed(hintChannelId)] })
      .catch(() => { });
  }, delay);
  timer.unref?.();
  return timer;
}

async function scheduleGenericHint(client, channelId, durationMs, hintText) {
  if (!channelId || !durationMs || durationMs <= 60 * 1000 || !hintText)
    return null;
  const channel = await getChannelCached(client, channelId);
  if (!channel) return null;
  const delay = durationMs - 60 * 1000;
  const timer = setTimeout(async () => {
    await channel
      .send({ embeds: [buildGenericHintEmbed(hintText)] })
      .catch(() => { });
  }, delay);
  timer.unref?.();
  return timer;
}

async function startGuessNumberGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const min = Math.max(1, Number(cfg?.guessNumber?.min || 1));
  const max = Math.max(min, Number(cfg?.guessNumber?.max || 100));
  const rewardExp = normalizeRewardExp(cfg?.guessNumber?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.guessNumber?.durationMs || 180000),);

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const target = randomBetween(min, max);
  const roleId = cfg.roleId;

  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => { });
  }
  const numberAttachment = buildPromptImageAttachment("Indovina il numero", [`Tra ${min} e ${max}`], "guess_number");
  const numberEmbed = buildGuessNumberEmbed(min, max, rewardExp, durationMs);
  if (numberAttachment) numberEmbed.setImage(`attachment://${numberAttachment.name}`);
  const gameMessage = await channel.send({ embeds: [numberEmbed], files: numberAttachment ? [numberAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutNumberEmbed(game.target)] }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, buildNumberNearHint(target, min, max),);

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

  const rewardExp = normalizeRewardExp(cfg?.guessWord?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessWord?.durationMs || 180000),);

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const target = String(words[randomBetween(0, words.length - 1)] || "",).toLowerCase();
  if (!target) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => { });
  }
  const scrambled = shuffleString(target);
  const wordAttachment = buildPromptImageAttachment("Indovina la parola", [scrambled], "guess_word",);
  const wordEmbed = buildGuessWordEmbed(scrambled, rewardExp, durationMs);
  if (wordAttachment) {
    wordEmbed.setImage(`attachment://${wordAttachment.name}`);
  }
  const gameMessage = await channel.send({ embeds: [wordEmbed], files: wordAttachment ? [wordAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutWordEmbed(game.target)] }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Parola: ${buildRevealHint(target, 0.4, false)}`,
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

  const rewardExp = normalizeRewardExp(cfg?.guessFlag?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessFlag?.durationMs || 180000),);

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const target = pickQuestionAvoidRecent(channelId, "guessFlag", countries, (c) => c?.displayName || (Array.isArray(c?.names) ? c.names[0] : "") || "", 20) || countries[randomBetween(0, countries.length - 1)];
  if (!target) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => { });
  }

  const flagEmbed = buildGuessFlagEmbed(target.flagUrl, rewardExp, durationMs);
  const gameMessage = await channel.send({ embeds: [flagEmbed] }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutFlagEmbed(game.displayName)] }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();

  const countryHint = buildCountryHint(target);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    countryHint || `Nazione: ${buildRevealHint(target.displayName)}`,
  );

  activeGames.set(channelId, {
    type: "guessFlag",
    answers: target.names,
    displayName: target.displayName,
    hintData: target.region || target.populationLabel || target.languages ? { region: target.region, subregion: target.subregion, populationLabel: target.populationLabel, languages: target.languages } : null,
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
      region: target.region,
      subregion: target.subregion,
      populationLabel: target.populationLabel,
      languages: target.languages,
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

  const rewardExp = normalizeRewardExp(cfg?.guessPlayer?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.guessPlayer?.durationMs || 180000),);

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const [infoFamous, infoLeague, infoLetter] = await Promise.all([
    fetchFamousPlayer(cfg),
    fetchLeagueFamousPlayer(cfg),
    fetchPlayerFromRandomLetter(cfg),
  ]);
  let info = infoFamous || infoLeague || infoLetter;
  if (!info) return false;

  if (cfg?.translateApiToItalian !== false) {
    const [name, team, nationality] = await Promise.all([translateToItalian(info.name, cfg), translateToItalian(info.team, cfg), translateToItalian(info.nationality, cfg),]);
    if (name) info = { ...info, name };
    if (team) info = { ...info, team };
    if (nationality) info = { ...info, nationality };
  }

  const roleId = cfg.roleId;
  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => { });
  }
  const playerFallbackAttachment = !info.image ? buildPromptImageAttachment("Indovina il calciatore", [buildMaskedTextHint(info.name) || info.name], "guess_player",) : null;
  const playerEmbed = buildGuessPlayerEmbed(rewardExp, durationMs, info.image || null,);
  if (playerFallbackAttachment) {
    playerEmbed.setImage(`attachment://${playerFallbackAttachment.name}`);
  }

  const gameMessage = await channel.send({ embeds: [playerEmbed], files: playerFallbackAttachment ? [playerFallbackAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutPlayerEmbed(game.displayName)] }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();

  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `${info.team} \u2022 ${info.nationality} \u2022 ${buildRevealHint(info.name)}`,
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

  const rewardExp = normalizeRewardExp(cfg?.guessSong?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.guessSong?.durationMs || 180000),);

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const onlyFamous = cfg?.guessSong?.onlyFamous !== false;
  let info = await fetchPopularSong(cfg);
  if (!info && !onlyFamous) {
    info = await fetchRandomSong(cfg);
  }
  if (!info?.title || !info?.artist) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await channel.send({ content: `<@&${roleId}>` }).catch(() => { });
  }

  const previewCustomId = `minigame_song_preview:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(previewCustomId).setLabel("Ascolta anteprima").setEmoji(`<:VC_Preview:1462941162393309431>`).setStyle(ButtonStyle.Secondary).setDisabled(!info.previewUrl),);

  const songAttachmentName = "minigame_song.png";
  let songImageUrl = info.artwork;
  const songCensored = info.artwork ? await censorArtworkImage(info.artwork, { attachmentName: songAttachmentName, overlayAlpha: 0.98 }) : null;
  if (songCensored) {
    songImageUrl = `attachment://${songCensored.attachmentName}`;
  }
  const songFiles = songCensored ? [new AttachmentBuilder(songCensored.buffer, { name: songCensored.attachmentName })] : [];
  const gameMessage = await channel.send({ embeds: [buildGuessSongEmbed(rewardExp, durationMs, songImageUrl)], components: [row], files: songFiles, }).catch(() => null);

  const censorRevealTimeouts = info.artwork && gameMessage?.id
    ? scheduleArtworkCensorSteps({
        channelId,
        channel,
        gameMessageId: gameMessage.id,
        originalArtworkUrl: info.artwork,
        durationMs,
        buildEmbed: buildGuessSongEmbed,
        rewardExp,
        attachmentName: songAttachmentName,
        gameType: "guessSong",
      })
    : [];

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    if (Array.isArray(game.censorRevealTimeouts)) game.censorRevealTimeouts.forEach(clearTimeout);
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel.send({ embeds: [buildTimeoutSongEmbed(game.title, game.artist)] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  timeout.unref?.();

  const songHint = info.artistCountry || info.genre
    ? `<a:VC_Flame:1473106990493335665> Artista da **${info.artistCountry || "?"}**, genere **${info.genre || "?"}**. Il titolo: ${buildRevealHint(info.title)}`
    : `Canzone: ${buildRevealHint(info.title)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, songHint,
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
    censorRevealTimeouts,
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
  const pick = pickQuestionAvoidRecent(channelId, "guessCapital", questions, (row) => row?.country, 28,);
  if (!pick?.country || !Array.isArray(pick?.answers) || !pick.answers.length)
    return false;

  const rewardExp = normalizeRewardExp(cfg?.guessCapital?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessCapital?.durationMs || 180000),);
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => { });
  const capitalAttachment = !pick.image ? buildPromptImageAttachment("Indovina la capitale", [pick.country], "guess_capital") : null;
  const capitalEmbed = buildGuessCapitalEmbed(pick.country, rewardExp, durationMs, pick.image || (capitalAttachment ? `attachment://${capitalAttachment.name}` : null),);
  const gameMessage = await channel.send({ embeds: [capitalEmbed], files: capitalAttachment ? [capitalAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutCapitalEmbed(game.country, game.displayAnswer)], }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();
  const displayAnswer = String(pick.answers[0] || "sconosciuta");
  const capitalHint = buildCapitalHint(pick.country);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    capitalHint || `Capitale: ${buildRevealHint(displayAnswer)}`,
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
  const pick = pickQuestionAvoidRecent(channelId, "guessRegionCapital", questions, (row) => row?.region, 20,);
  if (!pick?.region || !Array.isArray(pick?.answers) || !pick.answers.length)
    return false;

  const rewardExp = normalizeRewardExp(cfg?.guessRegionCapital?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessRegionCapital?.durationMs || 180000),);
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => { });
  const image = await fetchWikiRegionImage(pick.region);
  const regionNameAttachment = !image ? (buildRegionNameImageAttachment(pick.region) || buildPromptImageAttachment("Indovina il capoluogo", [pick.region], "guess_region_capital")) : null;
  const regionImageUrl = image || (regionNameAttachment ? `attachment://${regionNameAttachment.name}` : null);
  const gameMessage = await channel.send({ embeds: [buildGuessRegionCapitalEmbed(pick.region, rewardExp, durationMs, regionImageUrl, regionNameAttachment?.name || null,),], files: regionNameAttachment ? [regionNameAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutRegionCapitalEmbed(game.region, game.displayAnswer),], }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();
  const displayAnswer = String(pick.answers[0] || "sconosciuto");
  const regionHint = buildRegionCapitalHint(pick.region);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    regionHint || `Capoluogo: ${buildRevealHint(displayAnswer)}`,
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

async function startGuessReverseCapitalGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  const questions = await loadReverseCapitalQuestionBank(cfg);
  if (!questions.length) return false;
  const pick = pickQuestionAvoidRecent(channelId, "guessReverseCapital", questions, (row) => `${row?.capital ?? ""}\t${row?.country ?? ""}`, 28,);
  if (!pick?.capital || !pick?.country || !Array.isArray(pick?.answers) || !pick.answers.length)
    return false;

  const rewardExp = normalizeRewardExp(cfg?.guessReverseCapital?.rewardExp ?? cfg?.guessCapital?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessReverseCapital?.durationMs ?? cfg?.guessCapital?.durationMs ?? 180000),);
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => { });
  const reverseCapitalAttachment = !pick.image ? buildPromptImageAttachment("Capitale inverso", [pick.capital], "guess_reverse_capital") : null;
  const reverseCapitalEmbed = buildGuessReverseCapitalEmbed(pick.capital, rewardExp, durationMs, pick.image || (reverseCapitalAttachment ? `attachment://${reverseCapitalAttachment.name}` : null),);
  const gameMessage = await channel.send({ embeds: [reverseCapitalEmbed], files: reverseCapitalAttachment ? [reverseCapitalAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutReverseCapitalEmbed(game.capital, game.displayAnswer)], }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();
  const displayAnswer = String(pick.country);
  const capitalHint = buildCapitalHint(pick.country);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    capitalHint || `Stato: ${buildRevealHint(displayAnswer)}`,
  );
  activeGames.set(channelId, {
    type: "guessReverseCapital",
    capital: pick.capital,
    country: pick.country,
    answers: pick.answers,
    displayAnswer,
    image: pick.image || null,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessReverseCapital",
    target: JSON.stringify({
      capital: pick.capital,
      country: pick.country,
      answers: pick.answers,
      displayAnswer,
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

function parsePhraseFromApiPayload(payload) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload.trim();
  const text = payload.content ?? payload.quote ?? payload.text ?? payload.phrase ?? payload.frase ?? payload.body ?? payload.q ?? payload.message ?? "";
  return String(text).trim();
}

async function fetchPhraseFromApi(apiUrl, timeoutMs = 15000) {
  try {
    const res = await axios.get(apiUrl, { timeout: timeoutMs });
    const data = res?.data;
    if (Array.isArray(data)) {
      const item = pickRandomItem(data);
      return parsePhraseFromApiPayload(item);
    }
    return parsePhraseFromApiPayload(data);
  } catch {
    return "";
  }
}

async function fetchPhraseFromApiCandidates(apiCandidates, timeoutMs = 15000) {
  const candidates = Array.isArray(apiCandidates) ? apiCandidates : [apiCandidates];
  for (const candidate of candidates) {
    const apiUrl = String(candidate || "").trim();
    if (!apiUrl) continue;
    const phrase = await fetchPhraseFromApi(apiUrl, timeoutMs);
    if (phrase) return phrase;
  }
  return "";
}

async function startFastTypeGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  let phrase = "";
  let fromApi = false;
  const customApiUrl = cfg?.fastType?.apiUrl || null;
  if (customApiUrl) {
    phrase = await fetchPhraseFromApiCandidates(customApiUrl);
    if (phrase) fromApi = true;
  }
  if (!phrase && (cfg?.fastType?.useDefaultApi !== false)) {
    phrase = await fetchPhraseFromApiCandidates(DEFAULT_FAST_TYPE_API_URLS);
    if (phrase) fromApi = true;
  }
  if (!phrase) {
    const customPhrases = Array.isArray(cfg?.fastType?.phrases) ? cfg.fastType.phrases : [];
    const fallbackPhrases = customPhrases.length ? customPhrases : getFastTypingPhrases();
    phrase = String(pickRandomItem(fallbackPhrases) || "").trim();
  }
  if (!phrase) return false;
  if (fromApi) {
    const translated = await translateToItalian(phrase, cfg);
    if (translated) phrase = translated;
  }

  const maxLen = Number(cfg?.fastType?.maxPhraseLength) || DEFAULT_MAX_FAST_TYPE_PHRASE_LENGTH;
  if (phrase.length > maxLen) {
    const lastSpace = phrase.slice(0, maxLen).lastIndexOf(" ");
    phrase = (lastSpace > 0 ? phrase.slice(0, lastSpace) : phrase.slice(0, maxLen)).trim();
  }
  if (!phrase) return false;

  const rewardExp = normalizeRewardExp(cfg?.fastType?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.fastType?.durationMs || 120000),);
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => { });
  const fastTypeAttachment = buildPromptImageAttachment("Scrivi la frase", [phrase], "fast_type",);
  const fastTypeEmbed = buildFastTypeEmbed(phrase, rewardExp, durationMs);
  if (fastTypeAttachment) {
    fastTypeEmbed.setImage(`attachment://${fastTypeAttachment.name}`);
  }
  const gameMessage = await channel.send({ embeds: [fastTypeEmbed], files: fastTypeAttachment ? [fastTypeAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutFastTypeEmbed(game.phrase)] }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();

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
  const pick = pickQuestionAvoidRecent(channelId, "guessTeam", teams, (t) => t?.team || t?.id || "", 15) || pickRandomItem(teams);
  if (!pick?.team || !pick?.answers?.length) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessTeam?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessTeam?.durationMs || 180000),);
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => { });
  const teamAttachment = !pick.image ? buildPromptImageAttachment("Indovina la squadra", [pick.team], "guess_team") : null;
  const teamEmbed = buildGuessTeamEmbed(rewardExp, durationMs, pick.image || (teamAttachment ? `attachment://${teamAttachment.name}` : null));
  const gameMessage = await channel.send({ embeds: [teamEmbed], files: teamAttachment ? [teamAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutTeamEmbed(game.team)] }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Squadra: ${buildRevealHint(pick.team)}`,
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
  const pick = pickQuestionAvoidRecent(channelId, "guessSinger", singers, (s) => s?.name || "", 15) || pickRandomItem(singers);
  if (!pick?.name || !pick?.answers?.length) return false;
  const resolvedImage = pick.image || (await fetchSingerImageFallback(pick.name, cfg));

  const rewardExp = normalizeRewardExp(cfg?.guessSinger?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessSinger?.durationMs || 180000),);
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => { });
  const singerAttachment = !resolvedImage ? buildPromptImageAttachment("Indovina il cantante", [pick.name], "guess_singer") : null;
  const singerEmbed = buildGuessSingerEmbed(rewardExp, durationMs, resolvedImage || (singerAttachment ? `attachment://${singerAttachment.name}` : null));
  const gameMessage = await channel.send({ embeds: [singerEmbed], files: singerAttachment ? [singerAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutSingerEmbed(game.name)] }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Cantante: ${buildRevealHint(pick.name)}`,
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
  const pick = pickQuestionAvoidRecent(channelId, "guessAlbum", albums, (a) => `${a?.album || ""}|${a?.artist || ""}`, 15) || pickRandomItem(albums);
  if (!pick?.album || !pick?.answers?.length) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessAlbum?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessAlbum?.durationMs || 180000),);
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => { });

  const albumAttachmentName = "minigame_album.png";
  let albumImageUrl = pick.image;
  const albumCensored = pick.image ? await censorArtworkImage(pick.image, { attachmentName: albumAttachmentName, overlayAlpha: 0.98 }) : null;
  if (albumCensored) {
    albumImageUrl = `attachment://${albumCensored.attachmentName}`;
  }
  const albumFallbackAttachment = !albumImageUrl ? buildPromptImageAttachment("Indovina l'album", [pick.album, pick.artist], "guess_album") : null;
  if (albumFallbackAttachment) albumImageUrl = `attachment://${albumFallbackAttachment.name}`;
  const albumFiles = albumCensored ? [new AttachmentBuilder(albumCensored.buffer, { name: albumCensored.attachmentName })] : (albumFallbackAttachment ? [albumFallbackAttachment] : []);
  const gameMessage = await channel.send({ embeds: [buildGuessAlbumEmbed(rewardExp, durationMs, albumImageUrl)], files: albumFiles, }).catch(() => null);

  const censorRevealTimeouts = pick.image && gameMessage?.id
    ? scheduleArtworkCensorSteps({
        channelId,
        channel,
        gameMessageId: gameMessage.id,
        originalArtworkUrl: pick.image,
        durationMs,
        buildEmbed: buildGuessAlbumEmbed,
        rewardExp,
        attachmentName: albumAttachmentName,
        gameType: "guessAlbum",
      })
    : [];

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    if (Array.isArray(game.censorRevealTimeouts)) game.censorRevealTimeouts.forEach(clearTimeout);
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel.send({ embeds: [buildTimeoutAlbumEmbed(game.album, game.artist)] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Artista: **${pick.artist}** \u2022 Album: ${buildRevealHint(pick.album)}`,
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
    censorRevealTimeouts,
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

function isValidHangmanWord(word) {
  if (!word || typeof word !== "string") return false;
  const w = word.trim();
  if (w.length < 4 || w.length > 12) return false;
  return /^\p{L}+$/u.test(w);
}

async function startHangmanGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  let words = [];
  const apiUrl = cfg?.hangman?.apiUrl || cfg?.guessWord?.apiUrl || null;
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      const list = extractWordListFromApiPayload(res?.data);
      words = list.map(normalizeWord).filter(isValidHangmanWord);
    } catch (err) {
      warnMinigame(err);
    }
  }
  if (!words.length) {
    const fromShared = await loadWordList(cfg);
    words = fromShared.filter(isValidHangmanWord);
  }
  if (!words.length) {
    const customWords = Array.isArray(cfg?.hangman?.words) ? cfg.hangman.words : [];
    const fallbackWords = customWords.length ? customWords : getHangmanWords();
    words = fallbackWords.map(normalizeWord).filter(isValidHangmanWord);
  }
  if (!words.length) return false;

  const pickedWord = pickQuestionAvoidRecent(channelId, "hangman", words, (w) => normalizeCountryName(w) || String(w || "").trim().toLowerCase(), 20) || pickRandomItem(words);
  const word = normalizeCountryName(pickedWord);
  if (!word) return false;

  const rewardExp = normalizeRewardExp(cfg?.hangman?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.hangman?.durationMs || 240000),);
  const maxMisses = Math.max(3, Number(cfg?.hangman?.maxMisses || 7));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => { });
  const guessedLetters = [];
  const maskedWord = maskHangmanWord(word, new Set(guessedLetters));
  const hangmanAttachment = buildPromptImageAttachment("Impiccato", [maskedWord, `Errori: 0/${maxMisses}`],
    "hangman",
  );
  const hangmanEmbed = buildHangmanEmbed(maskedWord, 0, maxMisses, rewardExp, durationMs,);
  if (hangmanAttachment) {
    hangmanEmbed.setImage(`attachment://${hangmanAttachment.name}`);
  }
  const gameMessage = await channel.send({ embeds: [hangmanEmbed], files: hangmanAttachment ? [hangmanAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutHangmanEmbed(game.word)] }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Parola: ${buildRevealHint(word, 0.4, false)}`,
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

  let questionRow = null;
  const localPick = pickQuestionAvoidRecent(channelId, "italianGK", getItalianGkBank(), (q) => q?.question, 20);
  if (localPick?.question && Array.isArray(localPick?.answers)) {
    questionRow = {
      question: polishItalianQuestionText(String(localPick.question)),
      answers: buildAliases(localPick.answers),
    };
  }
  let fromApi = false;
  if (!questionRow) {
    const apiUrls = buildItalianGkApiUrls(cfg);
    const requireItalian = cfg?.italianGK?.requireItalian !== false;
    if (apiUrls.length) {
      for (const apiUrl of apiUrls) {
        try {
          const res = await axios.get(apiUrl, { timeout: 15000 });
          const parsed = parseItalianGkQuestionFromPayload(res?.data);
          if (!parsed?.question || !parsed?.answers?.length) continue;
          if (requireItalian && !isLikelyItalianText(parsed.question)) continue;
          if (isQuestionKeyRecent(channelId, "italianGK", parsed.question, 20)) continue;
          questionRow = parsed;
          fromApi = true;
          break;
        } catch (err) {
      warnMinigame(err);
    }
      }
    }
    if (questionRow && apiUrls.length && cfg?.translateApiToItalian !== false) {
      const [q, a] = await Promise.all([
        translateToItalian(questionRow.question, cfg),
        translateToItalian(String(questionRow.answers?.[0] || ""), cfg),
      ]);
      if (q) questionRow = { ...questionRow, question: polishItalianQuestionText(q) };
      if (a) questionRow = { ...questionRow, answers: buildAliases([a]) };
    }
  }
  if (!questionRow) return false;
  if (!questionRow.answers.length) return false;
  if (fromApi) pushQuestionKeyToRecent(channelId, "italianGK", questionRow.question, 20);
  questionRow = {
    ...questionRow,
    question: polishItalianQuestionText(questionRow.question),
  };

  const rewardExp = normalizeRewardExp(cfg?.italianGK?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.italianGK?.durationMs || 180000),);
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => { });
  const gkAttachment = buildPromptImageAttachment("Cultura generale", [questionRow.question], "italian_gk",);
  const gkEmbed = buildItalianGkEmbed(questionRow.question, rewardExp, durationMs);
  if (gkAttachment) {
    gkEmbed.setImage(`attachment://${gkAttachment.name}`);
  }
  const gameMessage = await channel.send({ embeds: [gkEmbed], files: gkAttachment ? [gkAttachment] : [], }).catch(() => null);
  const displayAnswer = String(questionRow.answers[0] || "sconosciuta");

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutItalianGkEmbed(game.displayAnswer)] }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Risposta: ${buildRevealHint(displayAnswer)}`,
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

function shuffleArray(arr) {
  const a = Array.isArray(arr) ? [...arr] : [];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseDrivingQuizFromPayload(payload) {
  if (payload == null) return null;

  if (Array.isArray(payload?.results) && payload.results.length > 0) {
    const item = pickRandomItem(payload.results);
    const question = item?.question;
    if (!question) return null;
    try {
      const statement = decodeURIComponent(String(question).replace(/\+/g, " "));
      if (!statement) return null;

      const qType = String(item?.type || "boolean").toLowerCase();
      if (qType === "multiple") {
        const correct = decodeURIComponent(String(item?.correct_answer || "").replace(/\+/g, " "),);
        const incorrect = Array.isArray(item?.incorrect_answers) ? item.incorrect_answers.map((a) => decodeURIComponent(String(a || "").replace(/\+/g, " ")),) : [];
        const all = shuffleArray([correct, ...incorrect]);
        const correctIndex = all.indexOf(correct);
        if (correctIndex < 0 || all.length < 2) return null;
        return {
          questionType: "multiple",
          statement,
          options: all,
          correctIndex,
        };
      }

      const correct = String(item?.correct_answer || "").toLowerCase();
      if (correct === "true" || correct === "false")
        return {
          questionType: "trueFalse",
          statement,
          answer: correct === "true",
        };
    } catch (err) {
      warnMinigame(err);
    }
    return null;
  }

  const statement = payload.statement ?? payload.question ?? payload.text ?? "";
  if (!statement) return null;

  const options = payload.options ?? payload.choices;
  if (Array.isArray(options) && options.length >= 2) {
    const correctIndex = typeof payload.correctIndex === "number" ? payload.correctIndex : typeof payload.correct === "number" ? payload.correct : -1;
    const correctAnswer = payload.correctAnswer ?? payload.correct_answer;
    let idx = correctIndex;
    if (idx < 0 && correctAnswer != null) {
      const norm = normalizeCountryName(String(correctAnswer));
      idx = options.findIndex(
        (o) => normalizeCountryName(String(o)) === norm,
      );
    }
    if (idx >= 0 && idx < options.length)
      return {
        questionType: "multiple",
        statement: String(statement).trim(),
        options: options.map((o) => String(o).trim()),
        correctIndex: idx,
      };
  }

  const rawAnswer = payload.answer ?? payload.correct_answer ?? payload.correct;
  const parsedAnswer = typeof rawAnswer === "boolean" ? rawAnswer : normalizeTruthValue(String(rawAnswer ?? ""));
  if (parsedAnswer === null) return null;
  return {
    questionType: "trueFalse",
    statement: String(statement).trim(),
    answer: parsedAnswer,
  };
}

function isDrivingPatenteRelated(statement) {
  if (!statement || typeof statement !== "string") return false;
  const s = statement.toLowerCase();
  const offTopic = [
    "logo", "animale", "animal", "marchio", "brand", "manufacturer", "automobilistica",
    "raffigurato", "depicted", "which animal", "quale animale", "porsche", "ferrari",
    "symbol of", "simbolo del", "casa automobilistica", "car manufacturer", "depicted on",
  ];
  if (offTopic.some((w) => s.includes(w))) return false;
  const onTopic = [
    "conducente", "segnale", "strada", "velocit", "speed", "limit", "limite", "patente",
    "veicolo", "vehicle", "semaforo", "traffic", "precedenza", "priority", "divieto",
    "obbligo", "corsia", "lane", "autostrada", "highway", "sorpasso", "overtak",
    "sosta", "parking", "pedonale", "pedestrian", "incrocio", "intersection", "freno",
    "brake", "cintura", "seat belt", "triangolo", "hazard", "incident", "incidente",
  ];
  return onTopic.some((w) => s.includes(w));
}

function appendCacheBuster(url) {
  if (!url || typeof url !== "string") return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_=${Date.now()}`;
}

async function fetchDrivingQuizFromApi(apiUrl, timeoutMs = 15000) {
  try {
    const res = await axios.get(apiUrl, { timeout: timeoutMs });
    const data = res?.data;
    if (Array.isArray(data)) {
      const item = pickRandomItem(data);
      return parseDrivingQuizFromPayload(item);
    }
    return parseDrivingQuizFromPayload(data);
  } catch {
    return null;
  }
}

async function startDrivingQuizGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  let row = null;
  let fromApi = false;

  const customApiUrl = cfg?.drivingQuiz?.apiUrl || null;
  const maxApiRetries = 3;
  if (customApiUrl) {
    for (let r = 0; r < maxApiRetries && !row; r++) {
      row = await fetchDrivingQuizFromApi(appendCacheBuster(customApiUrl));
      if (row && !isDrivingPatenteRelated(row.statement)) row = null;
      if (row && isQuestionKeyRecent(channelId, "drivingQuiz", row.statement, 20)) row = null;
      if (row) fromApi = true;
    }
  }
  if (!row && (cfg?.drivingQuiz?.useDefaultApi !== false)) {
    for (let r = 0; r < maxApiRetries && !row; r++) {
      row = await fetchDrivingQuizFromApi(appendCacheBuster(DEFAULT_DRIVING_QUIZ_API_URL));
      if (row && !isDrivingPatenteRelated(row.statement)) row = null;
      if (row && isQuestionKeyRecent(channelId, "drivingQuiz", row.statement, 20)) row = null;
      if (row) fromApi = true;
    }
  }

  if (!row) {
    const fallbackSources = [
      () => { const signPick = pickQuestionAvoidRecent(channelId, "drivingSign", getDrivingSignQuestions(), (x) => x?.statement, 20); if (signPick?.statement && signPick?.signType && Array.isArray(signPick?.options) && signPick.options.length >= 2 && typeof signPick?.correctIndex === "number" && signPick.correctIndex >= 0 && signPick.correctIndex < signPick.options.length) { return { questionType: "multiple", signType: String(signPick.signType), statement: String(signPick.statement), options: signPick.options.map((o) => String(o)), correctIndex: signPick.correctIndex, }; } return null; },
      () => { const localPick = pickQuestionAvoidRecent(channelId, "drivingMultiple", getDrivingMultipleChoiceBank(), (x) => x?.statement, 20); if (localPick?.statement && Array.isArray(localPick?.options) && localPick.options.length >= 2 && typeof localPick?.correctIndex === "number" && localPick.correctIndex >= 0 && localPick.correctIndex < localPick.options.length) { return { questionType: "multiple", statement: String(localPick.statement), options: localPick.options.map((o) => String(o)), correctIndex: localPick.correctIndex, }; } return null; },
      () => { const localPick = pickQuestionAvoidRecent(channelId, "drivingTrueFalse", getDrivingTrueFalseBank(), (x) => x?.statement, 20); if (localPick?.statement != null && typeof localPick?.answer === "boolean") { return { questionType: "trueFalse", statement: String(localPick.statement), answer: Boolean(localPick.answer), }; } return null; },
    ];
    for (let i = fallbackSources.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [fallbackSources[i], fallbackSources[j]] = [fallbackSources[j], fallbackSources[i]];
    }
    for (const getFallback of fallbackSources) {
      row = getFallback();
      if (row) break;
    }
  }
  if (!row) return false;
  if (fromApi && row.statement) pushQuestionKeyToRecent(channelId, "drivingQuiz", row.statement, 20);
  if (fromApi && row.statement) {
    const toTranslate = [row.statement];
    if (row.questionType === "multiple" && Array.isArray(row.options)) toTranslate.push(...row.options);
    const translatedAll = await Promise.all(toTranslate.map((o) => translateToItalian(o, cfg)));
    if (translatedAll[0]) row = { ...row, statement: translatedAll[0] };
    if (row.questionType === "multiple" && translatedAll.length > 1 && translatedAll.slice(1).every(Boolean))
      row = { ...row, options: translatedAll.slice(1) };
  }

  const rewardExp = normalizeRewardExp(cfg?.drivingQuiz?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.drivingQuiz?.durationMs || 180000),);
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => { });
  const drivingAttachment = buildDrivingQuizPromptImage(row);
  const drivingEmbed = buildDrivingQuizEmbed(row, rewardExp, durationMs);
  if (drivingAttachment) {
    drivingEmbed.setImage(`attachment://${drivingAttachment.name}`);
  }
  const gameMessage = await channel.send({ embeds: [drivingEmbed], files: drivingAttachment ? [drivingAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutDrivingQuizEmbed(game)] }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();

  let hintTimeout = null;
  if (row.questionType === "multiple" && Number.isFinite(row.correctIndex) && Array.isArray(row.options) && row.options.length >= 2) {
    const correctIdx = row.correctIndex;
    const n = row.options.length;
    const otherIdx = correctIdx <= 0 ? 1 : (correctIdx >= n - 1 ? n - 2 : (Math.random() < 0.5 ? correctIdx - 1 : correctIdx + 1));
    const [i1, i2] = [Math.min(correctIdx, otherIdx), Math.max(correctIdx, otherIdx)];
    const L1 = DRIVING_QUIZ_LETTERS[i1] ?? String(i1 + 1);
    const L2 = DRIVING_QUIZ_LETTERS[i2] ?? String(i2 + 1);
    hintTimeout = await scheduleGenericHint(
      client,
      channelId,
      durationMs,
      `<a:VC_Flame:1473106990493335665> La risposta è tra **${L1}** e **${L2}**.`,
    );
  } else if (row.questionType === "trueFalse" && row.statement) {
    const thematicHint = getDrivingQuizThematicHint(row);
    if (thematicHint) {
      hintTimeout = await scheduleGenericHint(client, channelId, durationMs, thematicHint);
    }
  }

  const gameState = { type: "drivingQuiz", questionType: row.questionType ?? "trueFalse", statement: row.statement, rewardExp, startedAt: Date.now(), endsAt: Date.now() + durationMs, timeout, hintTimeout, gameMessageId: gameMessage?.id || null, };
  if (row.questionType === "multiple") {
    gameState.options = row.options;
    gameState.correctIndex = row.correctIndex;
  } else {
    gameState.answer = Boolean(row.answer);
  }

  activeGames.set(channelId, gameState);

  await saveActiveGame(client, cfg, {
    type: "drivingQuiz",
    target: JSON.stringify(
      row.questionType === "multiple"
        ? {
          statement: row.statement,
          options: row.options,
          correctIndex: row.correctIndex,
        }
        : {
          statement: row.statement,
          answer: row.answer,
        },
    ),
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

  const rewardExp = normalizeRewardExp(cfg?.mathExpression?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.mathExpression?.durationMs || 150000),);
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => { });
  const expressionAttachment = buildMathExpressionImageAttachment(row.expression);
  const files = expressionAttachment ? [expressionAttachment] : [];
  const gameMessage = await channel.send({ embeds: [buildMathExpressionEmbed(row.expression, rewardExp, durationMs, expressionAttachment?.name || null,),], files, }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutMathEmbed(game.answer)] }).catch(() => { }); await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.();
  const answerNum = Number(row.answer);
  const hintRangeText = Number.isFinite(answerNum) ? `<a:VC_Flame:1473106990493335665> Il risultato è compreso tra **${Math.floor(answerNum - 2)}** e **${Math.ceil(answerNum + 2)}**.`
    : `<a:VC_Flame:1473106990493335665> Il risultato è un numero intero.`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintRangeText,);

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

async function pickRandomFindBotChannel(guild, requiredRoleId, excludeChannelId = null, excludedChannelIds = null) {
  if (!guild) return null;
  await guild.channels.fetch().catch(() => {});
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  const roleToCheck = requiredRoleId ? guild.roles.cache.get(requiredRoleId) : guild.roles.everyone;
  const excludedSet = new Set(
    [excludeChannelId].filter(Boolean).concat(Array.isArray(excludedChannelIds) ? excludedChannelIds.filter((id) => id != null && String(id).trim()) : []),
  );

  const channels = guild.channels.cache.filter((channel) => {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return false;
    if (excludedSet.has(channel.id)) return false;
    if (!channel.viewable) return false;
    if (me && !me.permissions?.has(PermissionsBitField.Flags.Administrator) && !channel.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) return false;
    const memberPerms = channel.permissionsFor(roleToCheck);
    if (!memberPerms?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) return false;
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

  const durationMs = Math.max(60000, Number(cfg?.findBot?.durationMs || 300000),);
  const rewardExp = normalizeRewardExp(cfg?.findBot?.rewardExp ?? 100);
  const requiredRoleId = cfg?.findBot?.requiredRoleId || null;
  const excludedChannelIds = cfg?.findBot?.excludedChannelIds || null;

  const mainChannel = await getChannelCached(client, channelId);
  if (!mainChannel?.guild) return false;

  let targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId, channelId, excludedChannelIds);
  if (!targetChannel) {
    targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId, null, excludedChannelIds);
  }
  if (!targetChannel) return false;

  const roleId = cfg.roleId;
  if (roleId) {
    await mainChannel.send({ content: `<@&${roleId}>` }).catch(() => { });
  }

  const findBotAttachment = buildPromptImageAttachment("Trova il bot", ["Cerca il messaggio nascosto in un canale del server.", "Clicca il pulsante quando lo trovi!"], "find_bot");
  const findBotEmbed = buildFindBotEmbed(rewardExp, durationMs);
  if (findBotAttachment) findBotEmbed.setImage(`attachment://${findBotAttachment.name}`);
  const mainMessage = await mainChannel.send({ embeds: [findBotEmbed], files: findBotAttachment ? [findBotAttachment] : [], }).catch(() => null);

  const customId = `minigame_findbot:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId).setEmoji(`<a:VC_Heart:1448672728822448141>`).setLabel("Clicca qui per vincere!").setStyle(ButtonStyle.Primary),);
  const gameMessage = await targetChannel.send({ embeds: [buildFindBotButtonEmbed(rewardExp, durationMs)], components: [row] }).catch((err) => {
    global.logger?.error?.("[MINIGAMES] FindBot: send to target channel failed", { channelId: targetChannel.id, channelName: targetChannel.name, err: err?.message || err });
    return null;
  });
  if (!gameMessage) return false;

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game || game.customId !== customId) return; recordNoParticipationIfNeeded(channelId, game); activeGames.delete(channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); if (game.channelId && game.messageId) { const ch = mainChannel.guild.channels.cache.get(game.channelId) || (await mainChannel.guild.channels.fetch(game.channelId).catch(() => null)); if (ch) { const msg = await ch.messages.fetch(game.messageId).catch(() => null); if (msg) { await msg.delete().catch(() => { }); } await mainChannel.send({ embeds: [buildTimeoutFindBotEmbed()] }).catch(() => { }); } } await clearActiveGame(client, cfg); }, durationMs); timeout.unref?.(); const hintTimeout = await scheduleMinuteHint(client, targetChannel.id, durationMs, channelId,);

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

async function startGuessYearGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getGuessYearBank();
  const pick = pickQuestionAvoidRecent(channelId, "guessYear", bank, (r) => `${r.type}:${r.title}:${r.year}`, 25);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.guessYear?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessYear?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  if (cfg.roleId) await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const typeLabel = { film: "Film", series: "Serie TV", song: "Canzone", album: "Album" }[pick.type] || pick.type;
  const lines = [pick.subtitle ? `${pick.title} — ${pick.subtitle}` : pick.title, `Categoria: ${typeLabel}`];
  const attachment = buildPromptImageAttachment("Indovina l'anno", lines, "guess_year");
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildGuessYearEmbed(pick.title, pick.subtitle || null, rewardExp, durationMs, imageUrl);
  const gameMessage = await channel.send({ embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    recordNoParticipationIfNeeded(channelId, game);
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel.send({ embeds: [buildTimeoutGuessYearEmbed(game.title, game.subtitle, game.year)] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  timeout.unref?.();
  const yearHint = `<a:VC_Flame:1473106990493335665> L'anno è tra **${pick.year - 5}** e **${pick.year + 5}**.`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, yearHint);
  activeGames.set(channelId, {
    type: "guessYear",
    title: pick.title,
    subtitle: pick.subtitle || null,
    year: pick.year,
    answers: [String(pick.year), String(pick.year).slice(-2)],
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "guessYear",
    target: JSON.stringify({ title: pick.title, subtitle: pick.subtitle, year: pick.year }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

async function startCompleteVerseGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getCompleteVerseBank();
  const pick = pickQuestionAvoidRecent(channelId, "completeVerse", bank, (r) => r.verse, 15);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.completeVerse?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.completeVerse?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  if (cfg.roleId) await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const attachment = buildPromptImageAttachment("Completa il verso", [pick.verse, `${pick.song} — ${pick.artist}`], "complete_verse");
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildCompleteVerseEmbed(pick.verse, rewardExp, durationMs, imageUrl);
  const gameMessage = await channel.send({ embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    recordNoParticipationIfNeeded(channelId, game);
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel.send({ embeds: [buildTimeoutCompleteVerseEmbed(game.answer, game.song, game.artist)] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  timeout.unref?.();
  const hintText = `Verso: ${buildRevealHint(pick.answer)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  const answerNorm = normalizeCountryName(pick.answer);
  const answers = [answerNorm, pick.answer, compactNoSpaces(answerNorm)];
  activeGames.set(channelId, {
    type: "completeVerse",
    verse: pick.verse,
    answer: pick.answer,
    answers,
    song: pick.song,
    artist: pick.artist,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "completeVerse",
    target: JSON.stringify({ verse: pick.verse, answer: pick.answer, song: pick.song, artist: pick.artist }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

async function startGuessEmojiGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getGuessEmojiBank();
  if (!Array.isArray(bank) || !bank.length) return false;
  let pick = pickQuestionAvoidRecent(channelId, "guessEmoji", bank, (r) => r.emojis, 15);
  if (!pick) pick = pickRandomItem(bank);
  if (!pick) return false;
  const sourceAnswers = Array.isArray(pick.answers) && pick.answers.length
    ? pick.answers
    : (pick.answer ? [pick.answer] : []);
  const displayAnswer = String(sourceAnswers[0] || "").trim();
  const answers = Array.from(
    new Set(
      sourceAnswers.flatMap((value) => {
        const raw = String(value || "").trim();
        const normalized = normalizeCountryName(raw);
        const compact = compactNoSpaces(normalized || raw);
        return [normalized, compact];
      }).filter(Boolean),
    ),
  );
  if (!answers.length) return false;
  const rewardExp = normalizeRewardExp(cfg?.guessEmoji?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessEmoji?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  if (cfg.roleId) await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const attachment = buildPromptImageAttachment("Indovina da emoji", [pick.emojis, `Categoria: ${pick.category}`], "guess_emoji");
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildGuessEmojiEmbed(pick.emojis, rewardExp, durationMs, imageUrl);
  const gameMessage = await channel.send({ embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
  if (!gameMessage) return false;
  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    recordNoParticipationIfNeeded(channelId, game);
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel.send({ embeds: [buildTimeoutGuessEmojiEmbed(game.emojis, game.displayAnswer || game.answers[0] || "")] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  timeout.unref?.();
  const hintText = `Risposta: ${buildRevealHint(displayAnswer || sourceAnswers[0] || "")}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  activeGames.set(channelId, {
    type: "guessEmoji",
    emojis: pick.emojis,
    displayAnswer,
    answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "guessEmoji",
    target: JSON.stringify({ emojis: pick.emojis, answers: sourceAnswers, displayAnswer }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

async function startQuoteFilmGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getQuoteFilmBank();
  const pick = pickQuestionAvoidRecent(channelId, "quoteFilm", bank, (r) => r.quote, 15);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.quoteFilm?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.quoteFilm?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  if (cfg.roleId) await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const attachment = buildPromptImageAttachment("Citazione da film/serie", [pick.quote], "quote_film");
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildQuoteFilmEmbed(pick.quote, rewardExp, durationMs, imageUrl);
  const gameMessage = await channel.send({ embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    recordNoParticipationIfNeeded(channelId, game);
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel.send({ embeds: [buildTimeoutQuoteFilmEmbed(game.quote, game.displayAnswer)] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  timeout.unref?.();
  const hintText = `Film/Serie: ${buildRevealHint(pick.answer)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  const displayAnswer = pick.answer;
  const answers = [normalizeCountryName(pick.answer), normalizeCountryName(displayAnswer)];
  if (pick.answers && pick.answers.length) answers.push(...pick.answers.map((a) => normalizeCountryName(a)));
  activeGames.set(channelId, {
    type: "quoteFilm",
    quote: pick.quote,
    answer: pick.answer,
    answers,
    displayAnswer,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "quoteFilm",
    target: JSON.stringify({ quote: pick.quote, answer: pick.answer, displayAnswer: pick.answer }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

async function startCompleteProverbGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getProverbBank();
  const pick = pickQuestionAvoidRecent(channelId, "completeProverb", bank, (r) => r.start, 15);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.completeProverb?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.completeProverb?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  if (cfg.roleId) await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const attachment = buildPromptImageAttachment("Completa il proverbio", [pick.start], "complete_proverb");
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildCompleteProverbEmbed(pick.start, rewardExp, durationMs, imageUrl);
  const gameMessage = await channel.send({ embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    recordNoParticipationIfNeeded(channelId, game);
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel.send({ embeds: [buildTimeoutCompleteProverbEmbed(game.start, game.end)] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  timeout.unref?.();
  const hintText = `Completamento: ${buildRevealHint(pick.end)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  const endNorm = normalizeCountryName(pick.end);
  const answers = [endNorm, pick.end, compactNoSpaces(endNorm)].filter(Boolean);
  activeGames.set(channelId, {
    type: "completeProverb",
    start: pick.start,
    end: pick.end,
    answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "completeProverb",
    target: JSON.stringify({ start: pick.start, end: pick.end }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

async function startSynonymAntonymGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getSynonymAntonymBank();
  const pick = pickQuestionAvoidRecent(channelId, "synonymAntonym", bank, (r) => `${r.word}:${r.kind}`, 20);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.synonymAntonym?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.synonymAntonym?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  if (cfg.roleId) await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const answer = pick.kind === "antonym" ? pick.antonym : pick.synonym;
  const kindLabel = pick.kind === "antonym" ? "il contrario" : "un sinonimo";
  const attachment = buildPromptImageAttachment(pick.kind === "antonym" ? "Trova il contrario" : "Trova il sinonimo", [`Parola: **${pick.word}**`, `Scrivi ${kindLabel} di questa parola.`], "synonym_antonym");
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildSynonymAntonymEmbed(pick.word, pick.kind, rewardExp, durationMs, imageUrl);
  const gameMessage = await channel.send({ embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    recordNoParticipationIfNeeded(channelId, game);
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel.send({ embeds: [buildTimeoutSynonymAntonymEmbed(game.word, game.answer, game.kind)] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  timeout.unref?.();
  const hintText = `Risposta: ${buildRevealHint(answer)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  const answerNorm = normalizeCountryName(answer);
  const answers = [answerNorm, answer, compactNoSpaces(answerNorm)].filter(Boolean);
  activeGames.set(channelId, {
    type: "synonymAntonym",
    word: pick.word,
    answer,
    answers,
    kind: pick.kind,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "synonymAntonym",
    target: JSON.stringify({ word: pick.word, answer, kind: pick.kind }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

async function startGuessCityGame(client, cfg) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getGuessCityBank();
  const pick = pickQuestionAvoidRecent(channelId, "guessCity", bank, (r) => r.landmark, 20);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.guessCity?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessCity?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  if (cfg.roleId) await channel.send({ content: `<@&${cfg.roleId}>` }).catch(() => {});
  const attachment = buildPromptImageAttachment("Indovina la città", [pick.landmark, pick.country ? `Paese: ${pick.country}` : ""].filter(Boolean), "guess_city");
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildGuessCityEmbed(pick.landmark, rewardExp, durationMs, imageUrl);
  const gameMessage = await channel.send({ embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    recordNoParticipationIfNeeded(channelId, game);
    activeGames.delete(channelId);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    await channel.send({ embeds: [buildTimeoutGuessCityEmbed(game.landmark, game.city)] }).catch(() => {});
    await clearActiveGame(client, cfg);
  }, durationMs);
  timeout.unref?.();
  const hintText = `Città: ${buildRevealHint(pick.city)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  const cityNorm = normalizeCountryName(pick.city);
  const answers = [cityNorm, pick.city, compactNoSpaces(cityNorm)].filter(Boolean);
  activeGames.set(channelId, {
    type: "guessCity",
    landmark: pick.landmark,
    city: pick.city,
    answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "guessCity",
    target: JSON.stringify({ landmark: pick.landmark, city: pick.city }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

function is429Error(error) {
  const status = error?.response?.status;
  const msg = error?.message || String(error);
  return status === 429 || (typeof msg === "string" && msg.includes("429"));
}

async function safeStartGameByType(client, cfg, gameType) {
  try {
    if (gameType === "guessWord") return startGuessWordGame(client, cfg);
    if (gameType === "guessFlag") return startGuessFlagGame(client, cfg);
    if (gameType === "guessPlayer") return startGuessPlayerGame(client, cfg);
    if (gameType === "guessSong") return startGuessSongGame(client, cfg);
    if (gameType === "guessCapital") return startGuessCapitalGame(client, cfg);
    if (gameType === "guessReverseCapital") return startGuessReverseCapitalGame(client, cfg);
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
    if (gameType === "guessYear") return startGuessYearGame(client, cfg);
    if (gameType === "completeVerse") return startCompleteVerseGame(client, cfg);
    if (gameType === "guessEmoji") return startGuessEmojiGame(client, cfg);
    if (gameType === "quoteFilm") return startQuoteFilmGame(client, cfg);
    if (gameType === "completeProverb") return startCompleteProverbGame(client, cfg);
    if (gameType === "synonymAntonym") return startSynonymAntonymGame(client, cfg);
    if (gameType === "guessCity") return startGuessCityGame(client, cfg);
    return false;
  } catch (error) {
    warnMinigame(error);
    if (is429Error(error)) {
      return { started: false, skipToNext: true };
    }
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
        recordNoParticipationIfNeeded(cfg.channelId, game);
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

    const channel = await getChannelCached(client, cfg.channelId);
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

      const result = await safeStartGameByType(client, cfg, gameType);
      const started = result === true || (result && result.started);

      if (started) {
        if (cfg.channelId) {
          const prev = lastPlayedGameTypesByChannel.get(cfg.channelId) || [];
          const next = [...prev.filter((t) => t !== gameType), gameType].slice(-LAST_PLAYED_ROTATION_SIZE);
          lastPlayedGameTypesByChannel.set(cfg.channelId, next);
          let atMap = lastPlayedAtByChannelAndType.get(cfg.channelId);
          if (!atMap) {
            atMap = new Map();
            lastPlayedAtByChannelAndType.set(cfg.channelId, atMap);
          }
          atMap.set(gameType, Date.now());
        }
        pendingGames.delete(cfg.channelId);
        return;
      }
      if (result && result.skipToNext) {
        pendingGames.delete(cfg.channelId);
        pending = null;
        continue;
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

  const runAtSlot = async () => {
    const cfg = getConfig(client);
    if (!cfg?.enabled) return;
    const rome = getMinigameRomeTime(new Date(), client);
    if (!isMinigameFixedSlot(rome)) return;
    const slotKey = `${rome.year}-${String(rome.month).padStart(2, "0")}-${String(rome.day).padStart(2, "0")}_${rome.hour}_${rome.minute}`;
    if (slotKey === lastMinigameSlotKey) return;
    lastMinigameSlotKey = slotKey;
    if (!pendingGames.has(cfg.channelId)) {
      const type = await getNextGameType(client, cfg);
      if (!type) return;
      pendingGames.set(cfg.channelId, { type, createdAt: Date.now() });
    }
    await maybeStartRandomGame(client, false);
  };

  const timer = setInterval(runAtSlot, 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  loopIntervals.set(client, timer);
  runAtSlot();
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

async function awardWinAndReply(message, rewardExp, game = null) {
  clearNoParticipationDelay(message.channelId);
  const cfg = getConfig(message.client);
  const baseExp = normalizeRewardExp(rewardExp || 0);
  const startedAt = game?.startedAt ?? 0;
  const elapsed = typeof startedAt === "number" ? Date.now() - startedAt : Infinity;
  const fastCfg = cfg?.fastGuess ?? {};
  const windowMs = Number(fastCfg.windowMs ?? 30000) || 0;
  const fastMultiplier = Number(fastCfg.multiplier ?? 1.5) || 1;
  const isFastGuess = windowMs > 0 && elapsed <= windowMs;
  const fastBonus = isFastGuess ? Math.round(baseExp * (fastMultiplier - 1)) : 0;
  const streakCfg = cfg?.streak ?? {};
  const percentPerWin = Number(streakCfg.bonusPercentPerWin ?? 10) || 0;
  const maxBonusPercent = Number(streakCfg.maxBonusPercent ?? 50) || 0;
  let doc = await MinigameUser.findOne({ guildId: message.guild.id, userId: message.author.id }).lean().catch(() => null);
  const prevStreak = Number(doc?.currentStreak ?? 0);
  const prevBest = Number(doc?.bestStreak ?? 0);
  const newStreak = prevStreak + 1;
  const bestStreak = Math.max(prevBest, newStreak);
  const streakBonusPercent = percentPerWin > 0 ? Math.min((newStreak - 1) * percentPerWin, maxBonusPercent) : 0;
  const streakBonus = Math.round(baseExp * streakBonusPercent / 100);
  const effectiveExp = baseExp + fastBonus + streakBonus;
  try {
    doc = await MinigameUser.findOneAndUpdate(
      { guildId: message.guild.id, userId: message.author.id },
      { $inc: { totalExp: effectiveExp }, $set: { currentStreak: newStreak, bestStreak } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    warnMinigame(err);
  }
  const nextTotal = Number(doc?.totalExp ?? 0);
  MinigameUser.updateMany(
    { guildId: message.guild.id, userId: { $ne: message.author.id } },
    { $set: { currentStreak: 0 } },
  ).catch((err) => warnMinigame(err));
  const member = message.member || (await getGuildMemberCached(message.guild, message.author.id, { ttlMs: 20_000 }));
  const ignoreExp = await shouldIgnoreExpForMember({ guildId: message.guild.id, member, channelId: message.channel?.id || message.channelId || null, });
  if (!ignoreExp) {
    try {
      await addExpWithLevel(message.guild, message.author.id, effectiveExp, false, false);
    } catch (err) {
      warnMinigame(err);
    }
  }
  let reacted = false;
  try {
    await message.react(MINIGAME_WIN_EMOJI);
    reacted = true;
  } catch (err) {
    warnMinigame(err);
  }
  if (!reacted) {
    await message.react(MINIGAME_CORRECT_FALLBACK_EMOJI).catch(() => { });
  }
  const details = (fastBonus > 0 || streakBonus > 0) ? { baseExp, fastBonus, streakBonus, newStreak, bestStreak } : null;
  await message.reply({ embeds: [buildWinEmbed(message.author.id, effectiveExp, nextTotal, details)] }).catch(() => { });
  if (member) {
    await handleExpReward(message.client, member, nextTotal);
  }
  await clearActiveGame(message.client, { ...cfg, guildId: message.guild.id });
}

async function handleMinigameMessage(message, client) {
  const cfg = getConfig(client);
  if (!cfg?.enabled) return false;
  if (!message?.guild) return false;
  if (message.author?.bot) return false;
  if (message.channelId !== cfg.channelId) return false;
  recordActivity(cfg.channelId, getActivityWindowMs(cfg));
  
  const game = activeGames.get(cfg.channelId);
  if (game) {
    if (game.hadParticipation === undefined) game.hadParticipation = false;
    game.hadParticipation = true;
  }
  if (!game) return false;

  const content = String(message.content || "").trim();
  const contentForGuess = normalizeUserAnswerText(content);

  if (game.type === "guessNumber") {
    if (!/^\d+$/.test(content)) return false;
    const guess = Number(content);
    if (!Number.isFinite(guess)) return false;
    if (guess < game.min || guess > game.max) return false;

    if (guess === game.target) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }

    const range = Math.max(1, Number(game.max || 100) - Number(game.min || 1));
    const nearThreshold = Math.max(2, Math.round(range * 0.05));
    if (Math.abs(guess - game.target) <= nearThreshold) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    }
    await message
      .reply({ embeds: [buildHintEmbed(guess < game.target)] })
      .catch(() => { });
    return true;
  }

  if (game.type === "guessWord") {
    const guessCandidates = extractWordGuessCandidates(contentForGuess);
    if (!guessCandidates.length) {
      return false;
    }
    const targetNorm = normalizeCountryName(game.target || "");
    const targetCompact = targetNorm ? compactNoSpaces(targetNorm) : "";
    const match =
      guessCandidates.includes(game.target) ||
      guessCandidates.some(
        (c) => {
          const cNorm = normalizeCountryName(c);
          return cNorm === targetNorm || (targetCompact && cNorm && compactNoSpaces(cNorm) === targetCompact);
        },
      );
    if (match) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (
      guessCandidates.some((candidate) =>
        isNearTextGuess(candidate, [game.target], {
          maxDistance: 1,
          maxRatio: 0.25,
        }),
      )
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
      return false;
    }
    await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    return false;
  }

  if (game.type === "guessFlag") {
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 4,
        minTokenLength: 3,
        singleTokenMinLength: 5,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    }
    return false;
  }

  if (game.type === "guessPlayer") {
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizePlayerGuess, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    }
    return false;
  }

  if (game.type === "guessSong") {
    const songAnswers = buildSongAnswerAliases(game.title);
    if (
      isSongGuessCorrect(contentForGuess, songAnswers.length ? songAnswers : game.title)
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      if (Array.isArray(game.censorRevealTimeouts)) game.censorRevealTimeouts.forEach(clearTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (
      isNearTextGuess(
        contentForGuess,
        songAnswers.length ? songAnswers : [game.title],
        { maxDistance: 3, maxRatio: 0.25 },
      )
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    }
    return false;
  }

  if (game.type === "guessCapital") {
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    }
    return false;
  }

  if (game.type === "guessReverseCapital") {
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    }
    return false;
  }

  if (game.type === "guessRegionCapital") {
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    }
    return false;
  }

  if (game.type === "fastType") {
    const normalizedContent = normalizeCountryName(contentForGuess);
    const phraseNorm = game.normalizedPhrase || normalizeCountryName(game.phrase || "");
    if (
      normalizedContent === phraseNorm ||
      (compactNoSpaces(normalizedContent) && compactNoSpaces(normalizedContent) === compactNoSpaces(phraseNorm))
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (
      isNearTextGuess(normalizedContent, [game.normalizedPhrase], {
        maxDistance: 2,
        maxRatio: 0.2,
        minGuessLength: 6,
      })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    }
    return false;
  }

  if (game.type === "guessTeam") {
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 3,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    }
    return false;
  }

  if (game.type === "guessSinger") {
    if (isSingerGuessCorrect(contentForGuess, game.answers)) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    }
    return false;
  }

  if (game.type === "guessAlbum") {
    if (isSongGuessCorrect(contentForGuess, game.answers)) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      if (Array.isArray(game.censorRevealTimeouts)) game.censorRevealTimeouts.forEach(clearTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 3, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    }
    return false;
  }

  if (game.type === "italianGK") {
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, {
        maxDistance: 2,
        maxRatio: 0.25,
        minGuessLength: 2,
      })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    }
    return false;
  }

  if (game.type === "drivingQuiz") {
    const isMultiple = game.questionType === "multiple" && Array.isArray(game.options) && Number.isFinite(game.correctIndex);
    let correct = false;
    if (isMultiple) {
      const norm = normalizeCountryName(contentForGuess);
      const letter = norm.charAt(0);
      const num = Number.parseInt(norm, 10);
      if (Number.isFinite(num) && num >= 1 && num <= game.options.length && num - 1 === game.correctIndex)
        correct = true;
      else if (DRIVING_QUIZ_LETTERS.indexOf(letter.toUpperCase()) >= 0) {
        const idx = DRIVING_QUIZ_LETTERS.indexOf(letter.toUpperCase());
        if (idx < game.options.length && idx === game.correctIndex) correct = true;
      } else {
        const correctText = normalizeCountryName(game.options[game.correctIndex] || "");
        if (
          correctText &&
          (norm === correctText || (compactNoSpaces(norm) && compactNoSpaces(norm) === compactNoSpaces(correctText)))
        )
          correct = true;
      }
    } else {
      const guess = normalizeTruthValue(contentForGuess);
      if (guess !== null && guess === game.answer) correct = true;
    }
    if (correct) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    return false;
  }

  if (game.type === "mathExpression") {
    const guessNum = parseMathGuess(contentForGuess);
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
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (
      Number.isFinite(guessNum) &&
      Number.isFinite(answerNum) &&
      Math.abs(guessNum - answerNum) <= 1
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });    }
    return false;
  }

  if (game.type === "hangman") {
    const normalized = normalizeCountryName(contentForGuess);
    if (!normalized) return false;
    const guessParts = normalized.split(" ").filter(Boolean);
    if (guessParts.length !== 1) return false;
    const guessText = guessParts[0];
    const wordNorm = normalizeCountryName(String(game.word || ""));

    if (
      wordNorm &&
      (guessText === wordNorm || compactNoSpaces(guessText) === compactNoSpaces(wordNorm))
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }

    if (
      guessText.length > 1 &&
      isNearTextGuess(guessText, [game.word], {
        maxDistance: 2,
        maxRatio: 0.28,
        minGuessLength: 4,
      })
    ) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => { });
    }

    const guessed = new Set(Array.isArray(game.guessedLetters) ? game.guessedLetters : [],);
    let guessHandled = false;
    if (guessText.length === 1 && /^[a-z0-9]$/.test(guessText)) {
      const letter = guessText;
      guessHandled = true;
      if (guessed.has(letter)) return true;
      guessed.add(letter);
      game.guessedLetters = Array.from(guessed.values());
      const isCorrectLetter = wordNorm && wordNorm.includes(letter);
      if (!isCorrectLetter) {
        game.misses = Number(game.misses || 0) + 1;
        await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
      } else {
        await message.react(MINIGAME_CORRECT_FALLBACK_EMOJI).catch(() => { });
      }
    } else if (guessText.length > 1) {
      guessHandled = true;
      game.misses = Number(game.misses || 0) + 1;
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
    }
    if (!guessHandled) return false;

    const solved = wordNorm && wordNorm.split("").every((ch) => guessed.has(ch));
    if (solved) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }

    if (Number(game.misses || 0) >= Number(game.maxMisses || 7)) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await message.channel
        .send({ embeds: [buildTimeoutHangmanEmbed(game.word)] })
        .catch(() => { });
      await clearActiveGame(client, cfg);
      return true;
    }

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

    const maskedWord = maskHangmanWord(game.word, guessed);
    const hangmanUpdateAttachment = buildPromptImageAttachment("Impiccato", [maskedWord, `Errori: ${Number(game.misses || 0)}/${Number(game.maxMisses || 7)}`,
    ],
      "hangman",
    );
    const hangmanUpdateEmbed = buildHangmanEmbed(maskedWord, Number(game.misses || 0), Number(game.maxMisses || 7), game.rewardExp, Math.max(1000, game.endsAt - Date.now()),);
    if (hangmanUpdateAttachment) {
      hangmanUpdateEmbed.setImage(`attachment://${hangmanUpdateAttachment.name}`);
    }
    const channel = message.channel;
    const gameMsg = game.gameMessageId && channel ? await channel.messages.fetch(game.gameMessageId).catch(() => null) : null;
    if (gameMsg) {
      await gameMsg
        .edit({
          embeds: [hangmanUpdateEmbed],
          files: hangmanUpdateAttachment ? [hangmanUpdateAttachment] : [],
        })
        .catch(() => { });
    }
    return true;
  }

  if (game.type === "guessYear") {
    const guessNum = parseInt(content.replace(/\D/g, ""), 10);
    if (!Number.isFinite(guessNum)) return false;
    if (guessNum === game.year) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    const diff = Math.abs(guessNum - game.year);
    if (diff <= 2) await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    else await message.react(MINIGAME_WRONG_EMOJI).catch(() => {});
    await message
      .reply({ embeds: [buildYearHintEmbed(guessNum < game.year)] })
      .catch(() => {});
    return true;
  }

  if (game.type === "completeVerse") {
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.3 })) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => {});
    }
    return false;
  }

  if (game.type === "guessEmoji") {
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.3 })) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => {});
    }
    return false;
  }

  if (game.type === "quoteFilm") {
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 3,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => {});
    }
    return false;
  }

  if (game.type === "completeProverb") {
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 1,
        minTokenLength: 1,
        singleTokenMinLength: 2,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.35 })) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => {});
    }
    return false;
  }

  if (game.type === "synonymAntonym") {
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 1, maxRatio: 0.25 })) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => {});
    }
    return false;
  }

  if (game.type === "guessCity") {
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 3,
      })
    ) {
      clearTimeout(game.timeout);
      if (game.hintTimeout) clearTimeout(game.hintTimeout);
      activeGames.delete(cfg.channelId);
      await awardWinAndReply(message, game.rewardExp, game);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })) {
      await message.react("<a:VC_Flame:1473106990493335665>").catch(() => {});
    } else {
      await message.react(MINIGAME_WRONG_EMOJI).catch(() => {});
    }
    return false;
  }

  return false;
}

async function handleMinigameButton(interaction, client) {
  if (!interaction?.isButton?.()) return false;
  const cfg = getConfig(client);
  if (!cfg?.enabled) return false;

  if (interaction.customId.startsWith("minigame_song_preview:")) {
    const clickedCustomId = String(interaction.customId || "");
    const clickedMessageId = String(interaction.message?.id || "");
    const clickedChannelId = String(interaction.channelId || "");

    let game = null;
    for (const [channelId, state] of activeGames.entries()) {
      if (!state || state.type !== "guessSong") continue;
      if (String(state.previewCustomId || "") === clickedCustomId) {
        game = state;
        break;
      }
      if (
        clickedMessageId &&
        clickedChannelId &&
        String(channelId || "") === clickedChannelId &&
        String(state.gameMessageId || "") === clickedMessageId
      ) {
        game = state;
      }
    }

    if (!game) {
      await interaction
        .reply({ content: "<:cancel:1461730653677551691> Anteprima non disponibile.", flags: 1 << 6 })
        .catch(() => { });
      return true;
    }

    await interaction.deferReply({ flags: 1 << 6 }).catch(() => { });
    if (!game.previewUrl) {
      await interaction
        .editReply({ content: "<:cancel:1461730653677551691> Anteprima non disponibile." })
        .catch(() => { });
      return true;
    }

    const audio = await fetchAudioAttachment(game.previewUrl);
    if (!audio) {
      await interaction
        .editReply({
          content: `<:cancel:1461730653677551691> Non riesco ad allegare il file, ascoltala qui:
${game.previewUrl}`,
        })
        .catch(() => { });
      return true;
    }

    const fallbackText = "<:link:1470064815899803668> Se su telefono non si riproduce, apri questo link per ascoltare: " + game.previewUrl;
    await interaction
      .editReply({
        content: fallbackText,
        files: [new AttachmentBuilder(audio, { name: "anteprima.m4a" })],
      })
      .catch(() => { });
    return true;
  }

  const game = activeGames.get(cfg.channelId);
  if (!game || game.type !== "findBot") return false;
  if (interaction.customId !== game.customId) return false;

  clearNoParticipationDelay(cfg.channelId);
  clearTimeout(game.timeout);
  if (game.hintTimeout) clearTimeout(game.hintTimeout);
  activeGames.delete(cfg.channelId);

  const baseExp = normalizeRewardExp(game.rewardExp || 0);
  const startedAt = game.startedAt ?? 0;
  const elapsed = typeof startedAt === "number" ? Date.now() - startedAt : Infinity;
  const fastCfg = cfg?.fastGuess ?? {};
  const windowMs = Number(fastCfg.windowMs ?? 30000) || 0;
  const fastMultiplier = Number(fastCfg.multiplier ?? 1.5) || 1;
  const isFastGuess = windowMs > 0 && elapsed <= windowMs;
  const fastBonus = isFastGuess ? Math.round(baseExp * (fastMultiplier - 1)) : 0;
  const streakCfg = cfg?.streak ?? {};
  const percentPerWin = Number(streakCfg.bonusPercentPerWin ?? 10) || 0;
  const maxBonusPercent = Number(streakCfg.maxBonusPercent ?? 50) || 0;
  let doc = await MinigameUser.findOne({ guildId: interaction.guild.id, userId: interaction.user.id }).lean().catch(() => null);
  const prevStreak = Number(doc?.currentStreak ?? 0);
  const prevBest = Number(doc?.bestStreak ?? 0);
  const newStreak = prevStreak + 1;
  const bestStreak = Math.max(prevBest, newStreak);
  const streakBonusPercent = percentPerWin > 0 ? Math.min((newStreak - 1) * percentPerWin, maxBonusPercent) : 0;
  const streakBonus = Math.round(baseExp * streakBonusPercent / 100);
  const effectiveExp = baseExp + fastBonus + streakBonus;
  try {
    doc = await MinigameUser.findOneAndUpdate(
      { guildId: interaction.guild.id, userId: interaction.user.id },
      { $inc: { totalExp: effectiveExp }, $set: { currentStreak: newStreak, bestStreak } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    warnMinigame(err);
  }
  const nextTotal = Number(doc?.totalExp ?? 0);
  MinigameUser.updateMany(
    { guildId: interaction.guild.id, userId: { $ne: interaction.user.id } },
    { $set: { currentStreak: 0 } },
  ).catch((err) => warnMinigame(err));
  try {
    await addExpWithLevel(interaction.guild, interaction.user.id, effectiveExp, false, false);
  } catch (err) {
    warnMinigame(err);
  }

  const details = (fastBonus > 0 || streakBonus > 0) ? { baseExp, fastBonus, streakBonus, newStreak, bestStreak } : null;
  const winEmbed = buildWinEmbed(interaction.user.id, effectiveExp, nextTotal, details);
  const mainChannel = await getChannelCached(interaction.client, cfg.channelId);
  if (mainChannel) {
    await mainChannel.send({ embeds: [winEmbed] }).catch(() => { });
  }
  await interaction
    .reply({ content: "<a:VC_Events:1448688007438667796> Hai vinto!", flags: 1 << 6 })
    .catch(() => { });
  const member = interaction.member || (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
  if (member) {
    await handleExpReward(interaction.client, member, nextTotal);
  }
  await clearActiveGame(interaction.client, { ...cfg, guildId: interaction.guild.id });

  try {
    const channel = interaction.channel;
    const message = await channel.messages.fetch(game.messageId).catch(() => null);
    if (message) {
      await message.delete().catch(() => { });
    }
  } catch (err) {
    warnMinigame(err);
  }

  return true;
}

async function restoreActiveGames(client) {
  const cfg = getConfig(client);
  if (!cfg?.enabled || !cfg.channelId) return;
  const channel = await getChannelCached(client, cfg.channelId);
  const guildId = channel?.guild?.id || null;
  if (!guildId) return;
  await loadRotationState(client, cfg);
  const state = await MinigameState.findOne({ guildId, channelId: cfg.channelId, }).lean().catch(() => null);
  if (!state) return;
  const now = Date.now();
  const endsAt = new Date(state.endsAt).getTime();
  if (endsAt <= now) {
    if (state.type === "guessNumber") {
      await channel
        .send({ embeds: [buildTimeoutNumberEmbed(Number(state.target))] })
        .catch(() => { });
    } else if (state.type === "guessWord") {
      await channel
        .send({ embeds: [buildTimeoutWordEmbed(String(state.target))] })
        .catch(() => { });
    } else if (state.type === "guessFlag") {
      let name = "la bandiera";
      try {
        const parsed = JSON.parse(state.target || "{}");
        name = parsed?.displayName || name;
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutFlagEmbed(name)] })
        .catch(() => { });
    } else if (state.type === "guessPlayer") {
      let name = "il calciatore";
      try {
        const parsed = JSON.parse(state.target || "{}");
        name = parsed?.name || name;
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutPlayerEmbed(name)] })
        .catch(() => { });
    } else if (state.type === "guessSong") {
      let title = "la canzone";
      let artist = "";
      try {
        const parsed = JSON.parse(state.target || "{}");
        title = parsed?.title || title;
        artist = parsed?.artist || "";
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutSongEmbed(title, artist)] })
        .catch(() => { });
    } else if (state.type === "guessCapital") {
      let country = "nazione sconosciuta";
      let displayAnswer = "sconosciuta";
      try {
        const parsed = JSON.parse(state.target || "{}");
        country = parsed?.country || country;
        displayAnswer =
          parsed?.displayAnswer || parsed?.answers?.[0] || displayAnswer;
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutCapitalEmbed(country, displayAnswer)] })
        .catch(() => { });
    } else if (state.type === "guessReverseCapital") {
      let capital = "capitale sconosciuta";
      let displayAnswer = "sconosciuto";
      try {
        const parsed = JSON.parse(state.target || "{}");
        capital = parsed?.capital || capital;
        displayAnswer = parsed?.displayAnswer || parsed?.country || parsed?.answers?.[0] || displayAnswer;
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutReverseCapitalEmbed(capital, displayAnswer)] })
        .catch(() => { });
    } else if (state.type === "guessRegionCapital") {
      let region = "regione sconosciuta";
      let displayAnswer = "sconosciuto";
      try {
        const parsed = JSON.parse(state.target || "{}");
        region = parsed?.region || region;
        displayAnswer =
          parsed?.displayAnswer || parsed?.answers?.[0] || displayAnswer;
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({
          embeds: [buildTimeoutRegionCapitalEmbed(region, displayAnswer)],
        })
        .catch(() => { });
    } else if (state.type === "fastType") {
      let phrase = "frase sconosciuta";
      try {
        const parsed = JSON.parse(state.target || "{}");
        phrase = parsed?.phrase || phrase;
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutFastTypeEmbed(phrase)] })
        .catch(() => { });
    } else if (state.type === "guessTeam") {
      let team = "squadra sconosciuta";
      try {
        const parsed = JSON.parse(state.target || "{}");
        team = parsed?.team || team;
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutTeamEmbed(team)] })
        .catch(() => { });
    } else if (state.type === "guessSinger") {
      let name = "cantante sconosciuto";
      try {
        const parsed = JSON.parse(state.target || "{}");
        name = parsed?.name || name;
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutSingerEmbed(name)] })
        .catch(() => { });
    } else if (state.type === "guessAlbum") {
      let album = "album sconosciuto";
      let artist = "artista sconosciuto";
      try {
        const parsed = JSON.parse(state.target || "{}");
        album = parsed?.album || album;
        artist = parsed?.artist || artist;
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutAlbumEmbed(album, artist)] })
        .catch(() => { });
    } else if (state.type === "hangman") {
      let word = "parola sconosciuta";
      try {
        const parsed = JSON.parse(state.target || "{}");
        word = parsed?.word || word;
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutHangmanEmbed(word)] })
        .catch(() => { });
    } else if (state.type === "italianGK") {
      let displayAnswer = "sconosciuta";
      try {
        const parsed = JSON.parse(state.target || "{}");
        displayAnswer =
          parsed?.displayAnswer || parsed?.answers?.[0] || displayAnswer;
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutItalianGkEmbed(displayAnswer)] })
        .catch(() => { });
    } else if (state.type === "drivingQuiz") {
      let gamePayload = { answer: false };
      try {
        const parsed = JSON.parse(state.target || "{}");
        if (Array.isArray(parsed?.options) && Number.isFinite(parsed?.correctIndex)) {
          gamePayload = { questionType: "multiple", options: parsed.options, correctIndex: parsed.correctIndex };
        } else {
          gamePayload = { answer: Boolean(parsed?.answer) };
        }
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutDrivingQuizEmbed(gamePayload)] })
        .catch(() => { });
    } else if (state.type === "mathExpression") {
      let answer = "0";
      try {
        const parsed = JSON.parse(state.target || "{}");
        answer = String(parsed?.answer || answer);
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutMathEmbed(answer)] })
        .catch(() => { });
    } else if (state.type === "findBot") {
      await channel
        .send({ embeds: [buildTimeoutFindBotEmbed()] })
        .catch(() => { });
      const targetChannel = channel.guild.channels.cache.get(state.targetChannelId) || (await channel.guild.channels.fetch(state.targetChannelId).catch(() => null));
      if (targetChannel && state.gameMessageId && state.customId) {
        const msg = await targetChannel.messages.fetch(state.gameMessageId).catch(() => null);
        if (msg) {
          const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(state.customId).setLabel("trova il bot").setStyle(ButtonStyle.Primary).setDisabled(true),);
          await msg.edit({ components: [row] }).catch(() => { });
        }
      }
    } else if (state.type === "guessYear") {
      let title = "titolo", subtitle = "", year = 0;
      try {
        const parsed = JSON.parse(state.target || "{}");
        title = parsed?.title || title;
        subtitle = parsed?.subtitle || "";
        year = Number(parsed?.year) || 0;
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutGuessYearEmbed(title, subtitle, year)] })
        .catch(() => { });
    } else if (state.type === "completeVerse") {
      let answer = "verso", song = "canzone", artist = "artista";
      try {
        const parsed = JSON.parse(state.target || "{}");
        answer = parsed?.answer || answer;
        song = parsed?.song || song;
        artist = parsed?.artist || artist;
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutCompleteVerseEmbed(answer, song, artist)] })
        .catch(() => { });
    } else if (state.type === "guessEmoji") {
      let emojis = "", answer = "";
      try {
        const parsed = JSON.parse(state.target || "{}");
        emojis = parsed?.emojis || "";
        answer = parsed?.answers?.[0] || "";
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutGuessEmojiEmbed(emojis, answer)] })
        .catch(() => { });
    } else if (state.type === "quoteFilm") {
      let quote = "citazione", answer = "";
      try {
        const parsed = JSON.parse(state.target || "{}");
        quote = parsed?.quote || quote;
        answer = parsed?.answers?.[0] || "";
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutQuoteFilmEmbed(quote, answer)] })
        .catch(() => { });
    } else if (state.type === "completeProverb") {
      let start = "", end = "";
      try {
        const parsed = JSON.parse(state.target || "{}");
        start = parsed?.start || "";
        end = parsed?.end || "";
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutCompleteProverbEmbed(start, end)] })
        .catch(() => { });
    } else if (state.type === "synonymAntonym") {
      let word = "", answer = "", kind = "synonym";
      try {
        const parsed = JSON.parse(state.target || "{}");
        word = parsed?.word || "";
        answer = parsed?.answers?.[0] ?? parsed?.answer ?? "";
        kind = parsed?.kind || "synonym";
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutSynonymAntonymEmbed(word, answer, kind)] })
        .catch(() => { });
    } else if (state.type === "guessCity") {
      let landmark = "", city = "";
      try {
        const parsed = JSON.parse(state.target || "{}");
        landmark = parsed?.landmark || "";
        city = parsed?.city || parsed?.answers?.[0] || "";
      } catch (err) {
      warnMinigame(err);
    }
      await channel
        .send({ embeds: [buildTimeoutGuessCityEmbed(landmark, city)] })
        .catch(() => { });
    }
    await MinigameState.deleteOne({ guildId, channelId: cfg.channelId }).catch(
      () => { },
    );
    return;
  }
  const remainingMs = endsAt - now;
  if (state.type === "guessNumber") {
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); await channel.send({ embeds: [buildTimeoutNumberEmbed(game.target)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
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
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); await channel.send({ embeds: [buildTimeoutWordEmbed(game.target)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
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
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutFlagEmbed(game.displayName)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    const countryHint = buildCountryHint(parsed);
    const hintTimeout = await scheduleGenericHint(
      client,
      cfg.channelId,
      remainingMs,
      countryHint || `Nazione: ${buildRevealHint(displayName)}`,
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
    const nationality = parsed?.nationality || "Nazionalit\u00E0 sconosciuta";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutPlayerEmbed(game.displayName)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, `${team} \u2022 ${nationality} \u2022 ${buildRevealHint(name)}`,
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
    const artistCountry = parsed?.artistCountry || "Nazionalit\u00E0 sconosciuta";
    const genre = parsed?.genre || "Genere sconosciuto";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutSongEmbed(game.title, game.artist)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, `${artistCountry} \u2022 ${genre} \u2022 Canzone: ${buildRevealHint(title)}`,
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
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutCapitalEmbed(game.country, game.displayAnswer)], }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    const capitalHint = buildCapitalHint(country);
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, capitalHint || `Capitale: ${buildRevealHint(displayAnswer)}`);
    activeGames.set(cfg.channelId, {
      type: "guessCapital",
      country,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessReverseCapital") {
    const parsed = parseStateTarget(state.target);
    const capital = parsed?.capital || "capitale sconosciuta";
    const country = parsed?.country || "nazione sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || country || answers[0] || "sconosciuto";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutReverseCapitalEmbed(game.capital, game.displayAnswer)], }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    const capitalHint = buildCapitalHint(country);
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, capitalHint || `Stato: ${buildRevealHint(displayAnswer)}`);
    activeGames.set(cfg.channelId, {
      type: "guessReverseCapital",
      capital,
      country,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessRegionCapital") {
    const parsed = parseStateTarget(state.target);
    const region = parsed?.region || "regione sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || answers[0] || "sconosciuto";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutRegionCapitalEmbed(game.region, game.displayAnswer),], }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    const regionHint = buildRegionCapitalHint(region);
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, regionHint || `Capoluogo: ${buildRevealHint(displayAnswer)}`);
    activeGames.set(cfg.channelId, {
      type: "guessRegionCapital",
      region,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "fastType") {
    const parsed = parseStateTarget(state.target);
    const phrase = parsed?.phrase || "";
    const normalizedPhrase = parsed?.normalizedPhrase || normalizeCountryName(phrase);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); await channel.send({ embeds: [buildTimeoutFastTypeEmbed(game.phrase)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
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
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : buildAliases([team]);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); await channel.send({ embeds: [buildTimeoutTeamEmbed(game.team)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
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
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : buildAliases([name]);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); await channel.send({ embeds: [buildTimeoutSingerEmbed(game.name)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
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
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : buildAliases([album]);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); await channel.send({ embeds: [buildTimeoutAlbumEmbed(game.album, game.artist)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
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
    const guessedLetters = Array.isArray(parsed?.guessedLetters) ? parsed.guessedLetters : [];
    const misses = Number(parsed?.misses || 0);
    const maxMisses = Number(parsed?.maxMisses || 7);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); await channel.send({ embeds: [buildTimeoutHangmanEmbed(game.word)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
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
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); await channel.send({ embeds: [buildTimeoutItalianGkEmbed(game.displayAnswer)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
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
    const isMultiple = Array.isArray(parsed?.options) && Number.isFinite(parsed?.correctIndex);
    const gameState = { type: "drivingQuiz", questionType: isMultiple ? "multiple" : "trueFalse", statement, rewardExp: Number(state.rewardExp || 0), startedAt: new Date(state.startedAt).getTime(), endsAt, timeout: null, gameMessageId: state.gameMessageId || null, };
    if (isMultiple) {
      gameState.options = parsed.options;
      gameState.correctIndex = parsed.correctIndex;
    } else {
      gameState.answer = Boolean(parsed?.answer);
    }
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); await channel.send({ embeds: [buildTimeoutDrivingQuizEmbed(game)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    gameState.timeout = timeout;
    activeGames.set(cfg.channelId, gameState);
    return;
  }
  if (state.type === "mathExpression") {
    const parsed = parseStateTarget(state.target);
    const expression = parsed?.expression || "";
    const answer = String(parsed?.answer || "0");
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); await channel.send({ embeds: [buildTimeoutMathEmbed(game.answer)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
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
  if (state.type === "guessYear") {
    const parsed = parseStateTarget(state.target);
    const year = Number(parsed?.year) || 0;
    const title = parsed?.title || "";
    const subtitle = parsed?.subtitle || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutGuessYearEmbed(game.title, game.subtitle, game.year)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    const hintText = `Anno: ${buildRevealHint(String(year))}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "guessYear",
      year,
      title,
      subtitle,
      answers: [String(year), String(year).slice(-2)],
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "completeVerse") {
    const parsed = parseStateTarget(state.target);
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const verse = parsed?.verse || "";
    const answer = parsed?.answer || "";
    const song = parsed?.song || "";
    const artist = parsed?.artist || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutCompleteVerseEmbed(game.answer, game.song, game.artist)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    const hintText = `Verso: ${buildRevealHint(answer)}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "completeVerse",
      answers,
      verse,
      answer,
      song,
      artist,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessEmoji") {
    const parsed = parseStateTarget(state.target);
    const sourceAnswers = Array.isArray(parsed?.answers) && parsed.answers.length
      ? parsed.answers
      : (parsed?.answer ? [parsed.answer] : []);
    const answers = Array.from(
      new Set(
        sourceAnswers.map((value) => normalizeCountryName(value)).filter(Boolean),
      ),
    );
    const displayAnswer = String(parsed?.displayAnswer || sourceAnswers[0] || answers[0] || "").trim();
    if (!answers.length) return;
    const emojis = parsed?.emojis || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutGuessEmojiEmbed(game.emojis, game.displayAnswer || game.answers?.[0] || "")] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    const hintText = `Risposta: ${buildRevealHint(displayAnswer || answers[0] || "")}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "guessEmoji",
      answers,
      displayAnswer,
      emojis,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "quoteFilm") {
    const parsed = parseStateTarget(state.target);
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const quote = parsed?.quote || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutQuoteFilmEmbed(game.quote, game.answers?.[0] || "")] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    const hintText = `Film/Serie: ${buildRevealHint(answers[0] || "")}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "quoteFilm",
      answers,
      quote,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "completeProverb") {
    const parsed = parseStateTarget(state.target);
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const start = parsed?.start || "";
    const end = parsed?.end || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutCompleteProverbEmbed(game.start, game.end)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    const hintText = `Fine proverbio: ${buildRevealHint(end)}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "completeProverb",
      answers,
      start,
      end,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "synonymAntonym") {
    const parsed = parseStateTarget(state.target);
    const answerRaw = parsed?.answer;
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : (answerRaw != null ? [answerRaw] : []);
    const word = parsed?.word || "";
    const kind = parsed?.kind || "synonym";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); const solution = game.answers?.[0] ?? game.answer ?? ""; await channel.send({ embeds: [buildTimeoutSynonymAntonymEmbed(game.word, solution, game.kind)] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    const hintReveal = buildRevealHint(answers[0] ?? answerRaw ?? "");
    const hintText = (kind === "antonym" ? "Contrario: " : "Sinonimo: ") + (hintReveal != null ? hintReveal : "—");
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "synonymAntonym",
      answers,
      word,
      kind,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessCity") {
    const parsed = parseStateTarget(state.target);
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const landmark = parsed?.landmark || "";
    const city = parsed?.city || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); await channel.send({ embeds: [buildTimeoutGuessCityEmbed(game.landmark, game.city || game.answers?.[0] || "")] }).catch(() => { }); await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.();
    const hintText = `Città: ${buildRevealHint(city || answers[0] || "")}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "guessCity",
      answers,
      landmark,
      city,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "findBot") {
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(state.customId).setLabel("trova il bot").setStyle(ButtonStyle.Primary),);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game || game.customId !== state.customId) return; recordNoParticipationIfNeeded(cfg.channelId, game); activeGames.delete(cfg.channelId); if (game.hintTimeout) clearTimeout(game.hintTimeout); if (game.channelId && game.messageId) { const ch = channel.guild.channels.cache.get(game.channelId) || (await channel.guild.channels.fetch(game.channelId).catch(() => null)); if (ch) { const msg = await ch.messages.fetch(game.messageId).catch(() => null); if (msg) { const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(row.components[0]).setDisabled(true),); await msg.edit({ components: [disabledRow] }).catch(() => { }); } await channel.send({ embeds: [buildTimeoutFindBotEmbed()] }).catch(() => { }); } } await clearActiveGame(client, cfg); }, remainingMs); timeout.unref?.(); const hintTimeout = await scheduleMinuteHint(client, state.targetChannelId, remainingMs, cfg.channelId,);
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

function clearGameForChannel(channelId, client = null, guildId = null) {
  const id = String(channelId || "");
  if (!id) return;
  const game = activeGames.get(id);
  if (game) {
    if (game.timeout) clearTimeout(game.timeout);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
  }
  activeGames.delete(id);
  if (guildId) {
    MinigameState.deleteOne({ guildId, channelId: id }).catch(() => { });
    MinigameRotation.deleteOne({ guildId, channelId: id }).catch(() => { });
  }
}

module.exports = { startMinigameLoop, forceStartMinigame, restoreActiveGames, handleMinigameMessage, handleMinigameButton, clearGameForChannel };