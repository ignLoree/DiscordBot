const { joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus, StreamType, } = require("@discordjs/voice");
const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const prism = require("prism-media");
const ffmpegStatic = require("ffmpeg-static");
const VoiceState = require("../../Schemas/Voice/voiceStateSchema");
const IDs = require("../../Utils/Config/ids");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { getVoiceSession } = require("../Voice/voiceSessionService");
const { EPHEMERAL_TTL_SHORT_MS, scheduleMessageDeletion } = require("../../Utils/Config/ephemeralMessageTtl");
const ttsStates = new Map();
const guildLocks = new Map();
const lastSavedChannels = new Map();
let emojiNameMap = null;
let nodeEmoji = null;
const userLangs = new Map();

try {
  emojiNameMap = require("emoji-name-map");
} catch (error) {
  global.logger?.warn?.(
    "[TTS] emoji-name-map non disponibile:",
    error?.message || error,
  );
}
try {
  nodeEmoji = require("node-emoji");
} catch (error) {
  global.logger?.warn?.(
    "[TTS] node-emoji non disponibile:",
    error?.message || error,
  );
}

function booleanFromConfig(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = String(value || "").trim().toLowerCase();
  if (["true", "1", "on", "yes", "si", "enabled", "attivo"].includes(raw))
    return true;
  if (
    ["false", "0", "off", "no", "disabled", "disattivo"].includes(raw)
  )
    return false;
  return fallback;
}

function shouldHandleMessage(message, config, prefix) {
  if (!config?.tts?.enabled) return false;
  if (!message?.channel) return false;
  const rawContent = String(message.content ?? "");
  if (prefix && rawContent.startsWith(prefix)) return false;
  if (rawContent.startsWith("-")) return false;
  const isVoiceChannel = message.channel.isVoiceBased?.() && !message.channel.isThread?.();
  const isVoiceChannelThread = message.channel.isThread?.() && message.channel.parent?.isVoiceBased?.();
  const extraTextIds = [IDs.channels.noMic].filter(Boolean).map((id) => String(id));
  const channelIdStr = String(message.channel?.id ?? "");
  const parentIdStr = message.channel?.parentId ? String(message.channel.parentId) : "";
  const isExtraText = extraTextIds.some((id) => id === channelIdStr || id === parentIdStr,);
  return isVoiceChannel || isVoiceChannelThread || isExtraText;
}

function sanitizeText(text) {
  if (!text) return "";
  let cleaned = text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?/gi, "")
    .replace(/\bdiscord\.gg\/\S+/gi, "")
    .replace(
      /\b[a-z0-9-]+\s*(?:\[\s*(?:dot|punto)\s*\]|\(\s*(?:dot|punto)\s*\)|\{\s*(?:dot|punto)\s*\}|dot|punto)\s*[a-z]{2,}(?:\/\S*)?/gi,
      "",
    )
    .replace(/\b[a-z]{2,}:\/\/\S+/gi, "")
    .replace(
      /\b\S+\.(?:com|net|org|gg|it|io|co|dev|app|me|xyz|ly|to|ai|tv|uk|de|fr|es|ru|jp|br|us|ca|au)\b\S*/gi,
      "",
    )
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .trim();
  const maxEmojis = 4;
  let emojiCount = 0;
  cleaned = cleaned.replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, (_, name) => {
    emojiCount += 1;
    return emojiCount <= maxEmojis ? ` emoji ${name} ` : " ";
  });
  cleaned = cleaned.replace(/\p{Extended_Pictographic}/gu, (m) => {
    emojiCount += 1;
    if (emojiCount > maxEmojis) return " ";
    const name = getUnicodeEmojiName(m);
    return name ? ` emoji ${name} ` : " emoji ";
  });
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function normalizeCaseForTts(text) {
  if (!text || typeof text !== "string") return text;
  const letters = text.replace(/\P{L}/gu, "");
  if (letters.length < 2) return text;
  const upper = text.replace(/\P{L}/gu, "").replace(/\P{Lu}/gu, "");
  if (upper.length / letters.length >= 0.8) return text.toLocaleLowerCase();
  return text;
}

const TTS_ABBREVIATIONS_IT = {
  tvb: "ti voglio bene", nn: "non", xk: "perché", xke: "perché", xché: "perché",
  xò: "però", xo: "però", cmq: "comunque", qnd: "quando", cn: "con", sn: "sono",
  pk: "perché", cm: "come", ke: "che", tt: "tutto", tb: "tanto bene", gg: "buon gioco",
  wp: "well played", dm: "messaggio privato", dv: "dove", qlk: "qualcosa", qlc: "qualcosa",
  fra: "fratello", cvd: "come volevasi dimostrare", aka: "noto anche come",
  asap: "il prima possibile", lol: "ride forte", lmao: "sto morendo dal ridere",
  omg: "oh mio dio", fyi: "per tua informazione", ez: "facile", gl: "buona fortuna",
  hf: "divertiti", msg: "messaggio", pic: "foto", vid: "video", bday: "compleanno",
  gn: "buonanotte", gm: "buongiorno", cya: "ci vediamo", brb: "torno subito",
  gtg: "devo andare", g2g: "devo andare", atm: "al momento", rn: "adesso",
  irl: "nella vita reale", idc: "non mi interessa", smh: "scuotendo la testa",
  imho: "a mio modesto parere", tbf: "a dire il vero", afaik: "per quanto ne so",
  bbl: "torno più tardi", bbs: "torno tra poco", tc: "stammi bene",
  rofl: "mi rotolo dal ridere", wtf: "che diavolo", wth: "che cavolo", ngl: "senza mentire",
  lowkey: "in segreto", highkey: "davvero", bet: "scommetto", yeet: "via", vibe: "vibrazione",
  sus: "sospetto", based: "basato", cringe: "imbarazzante", stan: "fan ossessionato",
  simp: "simp", drip: "stile", flex: "flex", salty: "incazzato", tilted: "tilting",
  istg: "giuro", tmi: "troppe informazioni", jk: "scherzo", sry: "scusa", mb: "colpa mia",
  fwiw: "per quel che vale", tldr: "in sintesi", iirc: "se ricordo bene", amirite: "ho ragione",
  tfw: "quella sensazione quando", mfw: "la mia faccia quando", mrw: "la mia reazione quando",
  op: "autore del post", oc: "contenuto originale", obv: "ovviamente", prob: "probabilmente",
  def: "decisamente", legit: "davvero", totes: "totalmente", srsly: "seriamente", rly: "davvero",
  probs: "probabilmente", kinda: "un po", sorta: "un po", gotta: "devo", wanna: "voglio",
  gonna: "sto per", dunno: "non so", lemme: "lasciami", gimme: "dammi", outta: "fuori da",
  lotta: "un sacco di", whatcha: "cosa stai", gotcha: "capito", wyd: "cosa fai", wbu: "e tu",
  hbu: "e tu", nbd: "niente di grave", tgif: "grazie a dio è venerdì", diy: "fai da te",
  faq: "domande frequenti", ama: "chiedimi qualsiasi cosa", eli5: "spiega in parole semplici",
  til: "oggi ho imparato", nah: "no", ikr: "lo so vero", eta: "orario previsto", psa: "avviso",
  tba: "da annunciare", tbd: "da decidere", nsfw: "non sicuro per il lavoro", sfw: "sicuro",
  iykyk: "se sai sai", icymi: "se te lo sei perso", ftr: "per la cronaca", jic: "per sicurezza",
  wdym: "cosa intendi", wym: "cosa intendi", idgaf: "non me ne importa", wth: "che cavolo",
  ig: "credo", hmu: "scrivimi", lmk: "fammi sapere", ttyl: "ci sentiamo dopo", ttys: "a presto",
  ttfn: "ciao per ora", otw: "in arrivo", brt: "arrivo subito", etc: "e così via",
  vs: "contro", approx: "circa", afk: "lontano dalla tastiera", vc: "canale vocale",
  ggwp: "bella partita ben giocata", ggez: "bella partita facile", nt: "bel tentativo",
  ns: "bel colpo", glhf: "buona fortuna divertiti", rip: "riposa in pace", oof: "oof",
  yolo: "si vive una volta sola", fomo: "paura di perdersi qualcosa", bae: "tesoro",
  bestie: "migliore amica", bff: "migliori amici per sempre", goat: "il migliore di tutti",
  mvp: "giocatore più prezioso", pog: "fantastico", poggers: "fantastico", kek: "lol",
  rekt: "distrutto", noob: "principiante", pro: "professionista", op: "troppo forte",
  nerf: "indebolire", buff: "potenziare", dlc: "contenuto scaricabile", f2p: "free to play",
  p2w: "pay to win", grind: "grindare", loot: "bottino", rng: "caso", dps: "danno al secondo",
  main: "main", alt: "alternativo", smurf: "smurf", carry: "portare", tilt: "tilt",
  toxic: "tossico", ff: "forfeit", inv: "invita", dc: "disconnesso", mod: "moderatore",
  ratio: "ratio", copium: "copium", periodt: "punto", slay: "stai stupenda", tea: "pettegolezzo",
};
const TTS_ABBREVIATIONS_EN = {
  tbh: "to be honest", btw: "by the way", imo: "in my opinion", idk: "I don't know",
  ik: "I know", omw: "on my way", np: "no problem", nvm: "never mind", ty: "thank you",
  thx: "thanks", pls: "please", ur: "your", bc: "because", ppl: "people",
  gg: "good game", wp: "well played", brb: "be right back", gtg: "got to go",
  g2g: "got to go", atm: "at the moment", rn: "right now", irl: "in real life",
  idc: "I don't care", smh: "shaking my head", imho: "in my humble opinion",
  tbf: "to be fair", afaik: "as far as I know", fyi: "for your information",
  lol: "laugh out loud", lmao: "laughing my ass off", omg: "oh my god", ez: "easy",
  gl: "good luck", hf: "have fun", bbl: "be back later", bbs: "be back soon",
  cya: "see you", gn: "good night", gm: "good morning", tc: "take care",
  bday: "birthday", msg: "message", pic: "picture", vid: "video", aka: "also known as",
  asap: "as soon as possible", fr: "for real",
  rofl: "rolling on the floor laughing", roflmao: "rolling on the floor laughing my ass off",
  lmfao: "laughing my freaking ass off", wtf: "what the heck", wth: "what the hell",
  omfg: "oh my god", ngl: "not gonna lie", lowkey: "kind of", highkey: "really",
  bet: "bet", "no-cap": "no cap", cap: "lie", slay: "slay", bussin: "really good",
  yeet: "yeet", vibe: "vibe", vibes: "vibes", sus: "suspicious", based: "based",
  cringe: "cringe", stan: "stalker fan", simp: "simp", drip: "style", flex: "flex",
  salty: "salty", tilted: "tilted", af: "as heck", asf: "as heck", istg: "I swear to god",
  tmi: "too much information", jk: "just kidding", jks: "just kidding", sry: "sorry",
  soz: "sorry", mb: "my bad", fwiw: "for what it's worth", tldr: "too long didn't read",
  imao: "in my arrogant opinion", iirc: "if I remember correctly", amirite: "am I right",
  tfw: "that feeling when", mfw: "my face when", mrw: "my reaction when",
  op: "original poster", oc: "original content", obv: "obviously", obvs: "obviously",
  prob: "probably", probs: "probably", def: "definitely", legit: "legitimately",
  totes: "totally", srsly: "seriously", rly: "really", kinda: "kind of", sorta: "sort of",
  coulda: "could have", woulda: "would have", shoulda: "should have", gotta: "got to",
  wanna: "want to", gonna: "going to", dunno: "don't know", lemme: "let me", gimme: "give me",
  outta: "out of", lotta: "lot of", lotsa: "lots of", whatcha: "what are you", gotcha: "got you",
  betcha: "bet you", sup: "what's up", wyd: "what you doing", wbu: "what about you",
  hbu: "how about you", nbd: "no big deal", tgif: "thank god it's friday", diy: "do it yourself",
  faq: "frequently asked questions", ama: "ask me anything", eli5: "explain like I'm five",
  til: "today I learned", nah: "no", ikr: "I know right", eta: "estimated time of arrival",
  psa: "public service announcement", tba: "to be announced", tbd: "to be determined",
  nsfw: "not safe for work", sfw: "safe for work", iykyk: "if you know you know",
  icymi: "in case you missed it", ftr: "for the record", jic: "just in case",
  wdym: "what do you mean", wym: "what you mean", idgaf: "I don't give a heck",
  stfu: "be quiet", ig: "I guess", hmu: "hit me up", lmk: "let me know", ttyl: "talk to you later",
  ttys: "talk to you soon", ttfn: "ta ta for now", bfn: "bye for now", otw: "on the way",
  brt: "be right there", etc: "et cetera", vs: "versus", approx: "approximately",
  afk: "away from keyboard", vc: "voice chat", ggwp: "good game well played",
  ggez: "good game easy", nt: "nice try", ns: "nice shot", glhf: "good luck have fun",
  rip: "rest in peace", oof: "oof", yolo: "you only live once", fomo: "fear of missing out",
  bae: "babe", bestie: "bestie", bff: "best friends forever", goat: "greatest of all time",
  mvp: "most valuable player", pog: "play of the game", poggers: "poggers", kek: "kek",
  rekt: "wrecked", pwnd: "owned", noob: "newbie", newb: "newbie", pro: "professional",
  op: "overpowered", nerf: "nerf", buff: "buff", dlc: "downloadable content",
  f2p: "free to play", p2w: "pay to win", grind: "grind", loot: "loot", rng: "random",
  dps: "damage per second", main: "main", alt: "alt", smurf: "smurf", carry: "carry",
  tilt: "tilt", tilted: "tilted", toxic: "toxic", ff: "forfeit", inv: "invite",
  dc: "disconnect", mod: "moderator", ratio: "ratio", copium: "copium", periodt: "period",
  slay: "slay", tea: "tea", hc: "headcanon", fic: "fanfiction", fanfic: "fanfiction",
  collab: "collaboration", colab: "collaboration", promo: "promotion", hmu: "hit me up",
  o7: "salute", re: "regarding", fwd: "forward", cc: "carbon copy", nm: "never mind",
  qt: "cutie", bby: "baby", bruh: "bruh", fam: "family", homie: "homie", dawg: "dawg",
  peeps: "people", squad: "squad", crew: "crew", lit: "lit", fire: "fire", slaps: "slaps",
  banger: "banger", vibing: "vibing", chill: "chill", chilling: "chilling", deadass: "dead serious",
  ong: "on god", "no-cap": "no cap", capping: "lying", period: "period", facts: "facts",
  iconic: "iconic", legend: "legend", legendary: "legendary", king: "king", queen: "queen",
  ship: "ship", shipping: "shipping", otp: "one true pairing", au: "alternate universe",
  cosplay: "cosplay", merch: "merchandise", sponsored: "sponsored",
  wfh: "work from home", f2f: "face to face", ping: "ping", fps: "frames per second",
  rpg: "role playing game", mmo: "massively multiplayer online", pvp: "player versus player",
  pve: "player versus environment", npc: "non player character", mob: "mob", boss: "boss",
  tryhard: "tryhard", sweat: "sweat", sweaty: "sweaty", patch: "patch", update: "update",
  ea: "early access", farm: "farm", farming: "farming", drop: "drop", crit: "critical",
  tank: "tank", healer: "healer", support: "support", boost: "boost", fed: "fed",
  report: "report", int: "intentional", surrender: "surrender", remake: "remake",
  queue: "queue", mute: "mute", block: "block", ban: "ban", banned: "banned",
  hack: "hack", hacker: "hacker", bug: "bug", glitch: "glitch", exploit: "exploit",
  meme: "meme", wholesome: "wholesome", cursed: "cursed", savage: "savage", roast: "roast",
  fandom: "fandom", ratioed: "ratioed",
};
function expandAbbreviationsForTts(text, lang) {
  if (!text || typeof text !== "string") return text;
  const langBase = String(lang || "it").split("-")[0].toLowerCase();
  const primary = langBase === "en" ? TTS_ABBREVIATIONS_EN : TTS_ABBREVIATIONS_IT;
  const secondary = langBase === "en" ? TTS_ABBREVIATIONS_IT : TTS_ABBREVIATIONS_EN;
  const map = { ...secondary, ...primary };
  let out = text;
  for (const [abbr, expansion] of Object.entries(map)) {
    const re = new RegExp(`\\b${abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, expansion);
  }
  return out;
}

function normalizePausesForTts(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/\s*\.{2,}\s*/g, ", ")
    .replace(/\s*\u2026+\s*/gu, ", ")
    .replace(/\s*,\s*,\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .trim();
}

const NUMBERS_IT_0_19 = "zero uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici diciassette diciotto diciannove".split(" ");
const NUMBERS_IT_TENS = " zero dieci venti trenta quaranta cinquanta sessanta settanta ottanta novanta".split(" ");
function numberToWordsItalian(n) {
  const num = Math.floor(Number(n));
  if (!Number.isFinite(num) || num < 0 || num > 999999) return String(n);
  if (num <= 19) return NUMBERS_IT_0_19[num];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    if (ones === 0) return NUMBERS_IT_TENS[tens];
    if (ones === 1) return NUMBERS_IT_TENS[tens].slice(0, -1) + "uno";
    if (ones === 8) return NUMBERS_IT_TENS[tens].slice(0, -1) + "otto";
    return NUMBERS_IT_TENS[tens].slice(0, -1) + NUMBERS_IT_0_19[ones];
  }
  if (num < 200) return num === 100 ? "cento" : "cento" + numberToWordsItalian(num - 100);
  if (num < 1000) {
    const h = Math.floor(num / 100);
    const rest = num % 100;
    const name = h === 1 ? "cento" : NUMBERS_IT_0_19[h] + "cento";
    return rest === 0 ? name : name + numberToWordsItalian(rest);
  }
  if (num < 2000) return num === 1000 ? "mille" : "mille" + numberToWordsItalian(num - 1000);
  if (num < 1000000) {
    const k = Math.floor(num / 1000);
    const rest = num % 1000;
    const thousands = k === 1 ? "mille" : numberToWordsItalian(k) + "mila";
    return rest === 0 ? thousands : thousands + numberToWordsItalian(rest);
  }
  return String(n);
}

function numbersToWordsForTts(text, lang) {
  if (!text || typeof text !== "string") return text;
  const langBase = String(lang || "it").split("-")[0].toLowerCase();
  if (langBase !== "it") return text;
  return text.replace(/\b(\d{1,6})\b/g, (_, digits) => numberToWordsItalian(parseInt(digits, 10)));
}

function setUserTtsLang(userId, lang) {
  if (!userId) return;
  if (!lang) {
    userLangs.delete(userId);
    return;
  }
  userLangs.set(userId, lang);
}
function getUserTtsLang(userId) {
  return userLangs.get(userId) || null;
}
function getUnicodeEmojiName(emoji) {
  if (emojiNameMap && emojiNameMap[emoji]) {
    return emojiNameMap[emoji].replace(/_/g, " ");
  }
  if (nodeEmoji?.find) {
    const found = nodeEmoji.find(emoji);
    if (found?.key) return found.key.replace(/_/g, " ");
  }
  return null;
}

function buildGoogleTtsUrl(
  text,
  lang,
  baseHost = "https://translate.google.com",
) {
  const q = encodeURIComponent(String(text || "").slice(0, 200));
  const tl = encodeURIComponent(String(lang || "it"));
  return `${baseHost}/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${q}`;
}

const TTS_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8", Referer: "https://translate.google.com/", };

function looksLikeMpegAudio(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") return true;
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

function readTtsErrorPreview(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return "";
  return buffer.subarray(0, 240).toString("utf8").replace(/\s+/g, " ").trim();
}

function isAbortOrTimeoutError(err) {
  if (!err) return false;
  const name = String(err?.name || "").toLowerCase();
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || "").toLowerCase();
  return name === "aborterror" || code === "econnaborted" || msg.includes("abort") || msg.includes("timeout");
}

async function fetchTtsAudio(url, provider = "TTS", attempt = 1) {
  const maxAttempts = 2;
  let res;
  try {
    res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: TTS_HEADERS,
      validateStatus: () => true,
    });
  } catch (err) {
    if (isAbortOrTimeoutError(err) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2000));
      return fetchTtsAudio(url, provider, attempt + 1);
    }
    throw new Error(err?.message && !isAbortOrTimeoutError(err) ? err.message : `${provider}: richiesta annullata o timeout`);
  }
  const status = res?.status ?? 0;
  if (status >= 500 && status < 600 && attempt < maxAttempts) {
    await new Promise((r) => setTimeout(r, 2000));
    return fetchTtsAudio(url, provider, attempt + 1);
  }
  if (status < 200 || status >= 300) {
    throw new Error(`${provider}: HTTP ${status}`);
  }
  const data = Buffer.isBuffer(res?.data) ? res.data : Buffer.from(res?.data || []);
  if (data.length === 0) return null;
  const contentType = String(res?.headers?.["content-type"] || "").toLowerCase();
  const isTextLike = contentType.includes("text/") || contentType.includes("json") || contentType.includes("xml");
  const isAudio = contentType.includes("audio/") || looksLikeMpegAudio(data);
  if (!isAudio || isTextLike) {
    const preview = readTtsErrorPreview(data);
    throw new Error(
      `${provider}: risposta non audio${preview ? ` (${preview.slice(0, 160)})` : ""}`,
    );
  }
  return data;
}

const LANG_TO_VOICERSS = { it: "it-it", en: "en-gb", es: "es-es", fr: "fr-fr", de: "de-de", pt: "pt-pt", ru: "ru-ru", pl: "pl-pl", nl: "nl-nl", tr: "tr-tr", ja: "ja-jp", zh: "zh-cn", };

async function createTtsStream(text, lang) {
  const textStr = String(text || "").slice(0, 300).trim();
  if (!textStr) throw new Error("TTS: testo vuoto");
  const rawLang = String(lang || "it").trim();
  const langLocale = rawLang.replace("_", "-");
  const langBase = langLocale.split("-")[0].toLowerCase();
  const googleLangCandidates = Array.from(new Set([langLocale, langBase].filter(Boolean)),);
  let lastErr = null;

  const hosts = ["https://translate.google.com.vn", "https://translate.google.com",];
  for (const baseHost of hosts) {
    for (const googleLang of googleLangCandidates) {
      try {
        const url = buildGoogleTtsUrl(textStr, googleLang, baseHost);
        const data = await fetchTtsAudio(url, `GoogleTTS:${baseHost}:${googleLang}`,
        );
        if (data) return Readable.from(Buffer.from(data));
      } catch (err) {
        lastErr = err;
      }
    }
  }
  const voicerssKey = typeof process !== "undefined" && process.env && process.env.TTS_VOICERSS_KEY;
  if (voicerssKey && textStr.length <= 1000) {
    try {
      const hl = LANG_TO_VOICERSS[langBase] || "it-it";
      const url = `https://api.voicerss.org/?key=${encodeURIComponent(voicerssKey)}&hl=${hl}&src=${encodeURIComponent(textStr)}&c=MP3`;
      const data = await fetchTtsAudio(url, "VoiceRSS");
      if (data) return Readable.from(Buffer.from(data));
    } catch (err) {
      lastErr = err;
    }
  }
  throw (
    lastErr || new Error("TTS: nessuna sorgente disponibile (Google/VoiceRSS).")
  );
}

async function createTtsBuffer(text, lang) {
  const stream = await createTtsStream(text, lang);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function getState(voiceChannel) {
  const key = voiceChannel.id;
  let state = ttsStates.get(key);
  if (!state) {
    const player = createAudioPlayer();
    state = {
      player,
      queue: [],
      connection: null,
      guildId: voiceChannel.guild.id,
      channelId: voiceChannel.id,
      playing: false,
      currentTtsFile: null,
    };
    player.on(AudioPlayerStatus.Idle, () => {
      if (state.currentTtsFile) {
        try {
          fs.unlinkSync(state.currentTtsFile);
        } catch (err) {
          global.logger?.warn?.("[TTS] unlink temp file:", err?.message || err);
        }
        state.currentTtsFile = null;
      }
      state.playing = false;
      playNext(state);
    });
    player.on("error", (err) => {
      global.logger.error("[TTS PLAYER ERROR]", err);
      state.playing = false;
      playNext(state);
    });
    ttsStates.set(key, state);
  }
  return state;
}
function getLockedChannelId(guildId) {
  if (guildId == null) return null;
  return guildLocks.get(String(guildId)) || null;
}
function setLockedChannel(guildId, channelId) {
  if (guildId != null && channelId != null)
    guildLocks.set(String(guildId), String(channelId));
}
function clearLockedChannel(guildId, channelId) {
  if (guildId == null) return;
  const locked = guildLocks.get(String(guildId));
  if (locked && String(locked) === String(channelId)) {
    guildLocks.delete(String(guildId));
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function destroyGuildVoiceConnection(guildId) {
  const gid = String(guildId || "");
  if (!gid) return;
  const existing = getVoiceConnection(gid);
  if (existing) {
    try {
      existing.destroy();
    } catch (err) {
      global.logger?.warn?.("[TTS] destroy existing voice connection:", err?.message || err);
    }
  }
  await sleep(600);
}
async function ensureConnection(state, voiceChannel) {
  const lockedChannelId = getLockedChannelId(voiceChannel.guild.id);
  if (lockedChannelId && lockedChannelId !== voiceChannel.id) {
    return null;
  }
  if (state.connection?.joinConfig?.channelId === voiceChannel.id) {
    try {
      await entersState(state.connection, VoiceConnectionStatus.Ready, 5_000);
      return state.connection;
    } catch {
      try {
        state.connection.destroy();
      } catch (err) {
        global.logger?.warn?.("[TTS] connection destroy:", err?.message || err);
      }
      state.connection = null;
    }
  }
  if (state.connection) {
    try {
      state.connection.destroy();
    } catch (err) {
      global.logger?.warn?.("[TTS] connection destroy:", err?.message || err);
    }
    state.connection = null;
  }
  await destroyGuildVoiceConnection(voiceChannel.guild.id);
  const isIpDiscoveryError = (err) => {
    const msg = String(err?.message || "").toLowerCase();
    return msg.includes("ip discovery") || msg.includes("socket closed") || msg.includes("aborted") || msg.includes("signalling");
  };
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let connection = null;
    try {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
      });
      state.connection = connection;
      state.guildId = voiceChannel.guild.id;
      state.channelId = voiceChannel.id;
      connection.subscribe(state.player);
      await entersState(connection, VoiceConnectionStatus.Ready, 25_000);
      setLockedChannel(voiceChannel.guild.id, voiceChannel.id);
      await saveVoiceState(voiceChannel.guild.id, voiceChannel.id);
      return connection;
    } catch (err) {
      if (connection) {
        try {
          connection.destroy();
        } catch (e) {
          global.logger?.warn?.("[TTS] connection destroy after error:", e?.message || e);
        }
        state.connection = null;
      }
      await destroyGuildVoiceConnection(voiceChannel.guild.id);
      if (isIpDiscoveryError(err) && attempt < maxAttempts) {
        const waitMs = Math.min(1500 * attempt, 8000);
        global.logger?.warn?.("[TTS] IP discovery / socket closed, retry in " + waitMs + "ms:", err?.message || err);
        await sleep(waitMs);
        continue;
      }
      global.logger?.warn?.("[TTS] voice join failed:", err?.message || err);
      throw err;
    }
  }
  return null;
}
async function playNext(state) {
  if (state.queue.length === 0) {
    state.playing = false;
    return;
  }
  const item = state.queue.shift();
  state.playing = true;
  const tmpPath = path.resolve(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`,
  );
  state.currentTtsFile = tmpPath;
  try {
    const connection = await ensureConnection(state, item.voiceChannel);
    if (!connection) {
      state.playing = false;
      if (state.currentTtsFile)
        try {
          fs.unlinkSync(state.currentTtsFile);
        } catch (err) {
          global.logger?.warn?.("[TTS] unlink temp file:", err?.message || err);
        }
      state.currentTtsFile = null;
      playNext(state);
      return;
    }
    const buffer = await createTtsBuffer(item.text, item.lang);
    if (!buffer || buffer.length === 0) throw new Error("TTS buffer vuoto");
    fs.writeFileSync(tmpPath, buffer);
    const ffmpegArgs = ["-analyzeduration", "0", "-loglevel", "0", "-i", tmpPath, "-f", "s16le", "-ar", "48000", "-ac", "2",];
    const transcoder = new prism.FFmpeg({ args: ffmpegArgs, shell: false, command: ffmpegStatic || "ffmpeg", });
    const resource = createAudioResource(transcoder, { inputType: StreamType.Raw, inlineVolume: false, });
    state.player.play(resource);
  } catch (err) {
    global.logger.error("[TTS PLAY ERROR]", err?.message || err);
    if (state.currentTtsFile)
      try {
        fs.unlinkSync(state.currentTtsFile);
      } catch (err) {
        global.logger?.warn?.("[TTS] unlink temp file:", err?.message || err);
      }
    state.currentTtsFile = null;
    state.playing = false;
    playNext(state);
  }
}
function enqueue(state, item) {
  state.queue.push(item);
  if (!state.playing) {
    playNext(state);
  }
}
async function handleTtsMessage(message, client, prefix) {
  const config = client?.config;
  if (message?.author?.bot) return;
  const guildId = message.guild?.id;
  const botVc = message.guild?.members?.me?.voice?.channel;
  let voiceSession = getVoiceSession(guildId);
  if (voiceSession?.mode === "music" && !botVc) {
    const { destroyQueue } = require("../Music/musicService");
    await destroyQueue(guildId, { manual: true }).catch(() => null);
    voiceSession = getVoiceSession(guildId);
  }
  if (voiceSession?.mode === "music") return;
  const { getQueue } = require("../Music/musicService");
  if (getQueue(guildId) && botVc) return;
  if (!shouldHandleMessage(message, config, prefix)) return;
  if (!message.member && message.guild?.members?.fetch) {
    try {
      message.member =
        (await message.guild.members
          .fetch(message.author?.id)
          .catch(() => null)) || message.member;
    } catch (err) {
      global.logger?.warn?.("[TTS] member fetch:", err?.message || err);
    }
  }
  let voiceChannel = null;
  if (message.channel.isVoiceBased?.() && !message.channel.isThread?.()) {
    voiceChannel = message.channel;
  } else if (
    message.channel.isThread?.() &&
    message.channel.parent?.isVoiceBased?.()
  ) {
    voiceChannel = message.channel.parent;
  } else {
    voiceChannel = message.member?.voice?.channel;
  }
  if (!voiceChannel) {
    const warn = await message.reply("<a:VC_Alert:1448670089670037675> Devi essere in un canale vocale per usare il TTS.",);
    if (warn) scheduleMessageDeletion(warn, EPHEMERAL_TTL_SHORT_MS);
    return;
  }
  const authorVoiceId = message.member?.voice?.channelId ?? null;
  if (!authorVoiceId || String(authorVoiceId) !== String(voiceChannel.id)) {
    const warn = await message.reply("<a:VC_Alert:1448670089670037675> Devi essere nel canale vocale per usare il TTS.",);
    if (warn) scheduleMessageDeletion(warn, EPHEMERAL_TTL_SHORT_MS);
    return;
  }
  if (!voiceChannel.joinable) return;
  const lockedChannelId = getLockedChannelId(voiceChannel.guild.id);
  if (lockedChannelId && lockedChannelId !== voiceChannel.id) {
    return;
  }
  const autojoin = booleanFromConfig(config?.tts?.autojoin, false);
  if (!autojoin && !lockedChannelId) {
    return;
  }
  const state = getState(voiceChannel);
  const connection = await ensureConnection(state, voiceChannel).catch(() => null,);
  if (!connection) return;
  const maxChars = config?.tts?.maxChars || 200;
  const includeUsername = booleanFromConfig(config?.tts?.includeUsername, false,);
  const lang = getUserTtsLang(message.author?.id) || config?.tts?.lang || "it";
  const rawMessageText = message.cleanContent ?? message.content ?? "";
  let baseText = sanitizeText(typeof rawMessageText === "string" ? rawMessageText : String(rawMessageText),);
  if (!baseText || !baseText.trim()) return;
  baseText = expandAbbreviationsForTts(baseText, lang);
  const name = message.member?.displayName || message.member?.user?.username || message.author?.username || "Utente";
  let text = includeUsername ? `${name}: ${baseText}` : baseText;
  text = normalizeCaseForTts(text);
  text = normalizePausesForTts(text);
  text = numbersToWordsForTts(text, lang);
  const clipped = text.slice(0, maxChars);
  enqueue(state, { voiceChannel, text: clipped, lang });
}
async function joinTtsChannel(voiceChannel) {
  if (!voiceChannel) return { ok: false, reason: "no_voice_channel" };
  if (!voiceChannel.joinable) return { ok: false, reason: "not_joinable" };
  const state = getState(voiceChannel);
  const connection = await ensureConnection(state, voiceChannel);
  if (!connection) return { ok: false, reason: "locked" };
  return { ok: true };
}

async function armTtsChannel(voiceChannel) {
  if (!voiceChannel) return { ok: false, reason: "no_voice_channel" };
  if (!voiceChannel.joinable) return { ok: false, reason: "not_joinable" };
  setLockedChannel(voiceChannel.guild.id, voiceChannel.id);
  await saveVoiceState(voiceChannel.guild.id, voiceChannel.id);
  return { ok: true };
}
function findLockedChannelIdByGuild(guildId) {
  if (guildId == null) return null;
  const gid = String(guildId);
  for (const [channelId, state] of ttsStates.entries()) {
    if (state?.guildId && String(state.guildId) === gid && state.connection) {
      return channelId;
    }
  }
  return null;
}

function cleanupAllTtsStateForGuild(guildId) {
  if (guildId == null) return;
  const gid = String(guildId);
  for (const [channelId, state] of [...ttsStates.entries()]) {
    if (!state || String(state.guildId) !== gid) continue;
    state.queue = [];
    state.playing = false;
    if (state.currentTtsFile) {
      try {
        fs.unlinkSync(state.currentTtsFile);
      } catch (err) {
        global.logger?.warn?.("[TTS] unlink temp file:", err?.message || err);
      }
      state.currentTtsFile = null;
    }
    try {
      state.player.stop();
    } catch (err) {
      global.logger?.warn?.("[TTS] player stop:", err?.message || err);
    }
    if (state.connection) {
      try {
        state.connection.destroy();
      } catch (err) {
        global.logger?.warn?.("[TTS] connection destroy:", err?.message || err);
      }
      state.connection = null;
    }
    ttsStates.delete(channelId);
  }
  guildLocks.delete(gid);
}

async function leaveTtsGuild(guildId, client) {
  let lockedChannelId = getLockedChannelId(guildId);
  if (!lockedChannelId) {
    lockedChannelId = findLockedChannelIdByGuild(guildId);
    if (lockedChannelId) setLockedChannel(guildId, lockedChannelId);
  }
  if (!lockedChannelId && client) {
    const guild = client.guilds?.cache?.get(guildId) || (await client.guilds?.fetch(guildId).catch(() => null));
    const me = guild?.members?.me ?? (await guild?.members?.fetch(client.user?.id).catch(() => null));
    if (me?.voice?.channelId) {
      try {
        const existing = getVoiceConnection(String(guildId));
        if (existing) {
          existing.destroy();
        } else {
          cleanupAllTtsStateForGuild(guildId);
        }
      } catch (err) {
        global.logger?.warn?.("[TTS] disconnect cleanup:", err?.message || err);
      }
      cleanupAllTtsStateForGuild(guildId);
    }
    await clearVoiceState(guildId);
    return { ok: true };
  }
  if (!lockedChannelId) return { ok: false, reason: "not_connected" };
  const state = ttsStates.get(lockedChannelId);
  if (state) {
    state.queue = [];
    state.playing = false;
    if (state.currentTtsFile) {
      try {
        fs.unlinkSync(state.currentTtsFile);
      } catch (err) {
        global.logger?.warn?.("[TTS] unlink temp file:", err?.message || err);
      }
      state.currentTtsFile = null;
    }
    try {
      state.player.stop();
    } catch (err) {
      global.logger?.warn?.("[TTS] player stop:", err?.message || err);
    }
    if (state.connection) {
      try {
        state.connection.destroy();
      } catch (err) {
        global.logger?.warn?.("[TTS] connection destroy:", err?.message || err);
      }
      state.connection = null;
    }
    clearLockedChannel(guildId, lockedChannelId);
    ttsStates.delete(lockedChannelId);
  } else {
    clearLockedChannel(guildId, lockedChannelId);
    cleanupAllTtsStateForGuild(guildId);
  }
  await clearVoiceState(guildId);
  return { ok: true };
}

async function saveVoiceState(guildId, channelId) {
  if (!guildId || !channelId) return;
  if (lastSavedChannels.get(guildId) === channelId) return;
  lastSavedChannels.set(guildId, channelId);
  try {
    await VoiceState.findOneAndUpdate(
      { guildId },
      { $set: { guildId, channelId, updatedAt: new Date() } },
      { upsert: true, new: true },
    );
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to save voice state", error);
  }
}

async function clearVoiceState(guildId) {
  if (!guildId) return;
  lastSavedChannels.delete(guildId);
  try {
    await VoiceState.deleteOne({ guildId });
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to clear voice state", error);
  }
}

async function restoreTtsConnections(client) {
  try {
    const autojoinEnabled = booleanFromConfig(client?.config?.tts?.autojoin, false,);
    if (!autojoinEnabled) {
      const guildIds = [...(client?.guilds?.cache?.keys?.() || [])];
      if (guildIds.length)
        await VoiceState.deleteMany({ guildId: { $in: guildIds } }).catch(() => null);
      return;
    }
    await sleep(4500);
    const states = await VoiceState.find({});
    for (const entry of states) {
      const channel = await getClientChannelCached(client, entry.channelId);
      if (!channel || !channel.isVoiceBased?.()) continue;
      await joinTtsChannel(channel).catch((e) =>
        global.logger?.warn?.("[TTS] restore join skipped:", e?.message || e),
      );
      await sleep(1200);
    }
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to restore voice connections", error);
  }
}

function setTtsLockedChannel(guildId, channelId) {
  if (!guildId || !channelId) return;
  setLockedChannel(guildId, channelId);
}
function clearGuildTtsLock(guildId) {
  if (guildId == null) return;
  guildLocks.delete(String(guildId));
}

module.exports = { handleTtsMessage, armTtsChannel, joinTtsChannel, leaveTtsGuild, setTtsLockedChannel, clearGuildTtsLock, setUserTtsLang, getUserTtsLang, restoreTtsConnections };