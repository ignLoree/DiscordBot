const { EmbedBuilder, PermissionsBitField, UserFlagsBitField } = require("discord.js");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const AutoModBadUser = require("../../Schemas/Moderation/autoModBadUserSchema");
const ARROW = "<:VC_right_arrow:1473441155055096081>";

const USER_STATE = new Map();
const ACTION_COOLDOWN = new Map();
const ACTION_CHANNEL_LOG_COOLDOWN = new Map();
const GUILD_PANIC_STATE = new Map();
const BAD_USER_CACHE = new Map();

const DECAY_PER_SEC = 5;
const MAX_HEAT = 100;
const WARN_THRESHOLD = Number.POSITIVE_INFINITY;
const DELETE_THRESHOLD = Number.POSITIVE_INFINITY;
const TIMEOUT_THRESHOLD = 95;
const ACTION_COOLDOWN_MS = 12_000;
const ACTION_CHANNEL_LOG_COOLDOWN_MS = 6_000;
const ACTION_CHANNEL_NOTICE_DELETE_MS = 10_000;
const REGULAR_TIMEOUT_MS = 15 * 60_000;
const HEAT_RESET_ON_PUNISHMENT = true;
const MENTION_LOCKDOWN_TRIGGER = 50;
const MENTION_LOCKDOWN_WINDOW_MS = 3_000;
const PANIC_MODE = {
  enabled: true,
  considerActivityHistory: true,
  useGlobalBadUsersDb: true,
  triggerCount: 3,
  triggerWindowMs: 10 * 60_000,
  durationMs: 10 * 60_000,
};
const MENTION_RULES = {
  enabled: true,
  timeoutMs: 45 * 60_000,
  hourCap: 20,
  userMentions: {
    enabled: true,
    heat: 15,
  },
  roleMentions: {
    enabled: true,
    heat: 20,
  },
  everyoneMentions: {
    enabled: true,
    heat: 100,
  },
};
const ATTACHMENT_RULES = {
  enabled: true,
  timeoutMs: 60_000,
  embeds: { enabled: true, heat: 15 },
  images: { enabled: true, heat: 20 },
  files: { enabled: true, heat: 15 },
  links: { enabled: true, heat: 10 },
  stickers: { enabled: true, heat: 15 },
};

const TEXT_RULES = {
  regularMessage: {
    enabled: false,
    heat: 15,
  },
  similarMessage: {
    enabled: true,
    heat: 22,
    ratio: 0.8,
  },
  emojis: {
    enabled: true,
    heat: 9,
    minCount: 8,
  },
  newLines: {
    enabled: true,
    heat: 5,
    minCount: 6,
  },
  zalgo: {
    enabled: true,
    heat: 1.5,
    minCount: 6,
  },
  characters: {
    enabled: true,
    lowercaseHeat: 0.08,
    uppercaseHeat: 0.12,
    minChars: 40,
  },
  inviteLinks: {
    enabled: true,
    heat: 100,
    timeoutMs: 60 * 60_000,
  },
  maliciousLinks: {
    enabled: true,
    heat: 100,
    timeoutMs: 60 * 60_000,
  },
  nsfwLinks: {
    enabled: true,
    crawlShorteners: false,
    heat: 100,
    timeoutMs: 30 * 60_000,
  },
  wordBlacklist: {
    enabled: true,
    useProfaneList: false,
    useVulgarList: false,
    useRacistList: true,
    heat: 100,
    timeoutMs: 45 * 60_000,
  },
  linkBlacklist: {
    enabled: true,
    heat: 100,
    timeoutMs: 45 * 60_000,
    domains: ["dsc.gg"],
  },
};

const WICK_EQUIV = {
  textClusterMultiplier: 1.1875, // 95/80 for emoji/newlines/zalgo family
  upperCharMultiplier: 9.90575, // 0.12 * 9.90575 ~= 1.18869 heat/char
  lowerCharMultiplier: 14.866, // 0.08 * 14.866 ~= 1.18928 heat/char
};

const INSTANT_LINK_KEYS = new Set([
  "invite",
  "scam_pattern",
  "nsfw_link",
  "word_blacklist",
  "link_blacklist",
  "mention_everyone",
  "mention_hour_cap",
  "mentions_lockdown",
]);

const RACIST_WORD_PATTERNS = [
  /\bn[\W_]*[i1l!|][\W_]*g[\W_]*g[\W_]*([e3][\W_]*)?r\b/iu,
  /\bk[\W_]*i[\W_]*k[\W_]*e\b/iu,
  /\bc[\W_]*h[\W_]*i[\W_]*n[\W_]*k\b/iu,
  /\bw[\W_]*e[\W_]*t[\W_]*b[\W_]*a[\W_]*c[\W_]*k\b/iu,
  /\bp[\W_]*a[\W_]*k[\W_]*i\b/iu,
];

function parseWordArrayFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => String(x || "").trim().toLowerCase())
      .filter((x) => x.length >= 3);
  } catch {
    return [];
  }
}

function loadCustomRacistWords() {
  const singleFile = path.resolve(
    __dirname,
    "../../Utils/Config/automodRacistWords.json",
  );
  const folderPath = path.resolve(
    __dirname,
    "../../Utils/Config/automodRacistWords",
  );

  const all = new Set(parseWordArrayFile(singleFile));
  try {
    if (fs.existsSync(folderPath)) {
      const entries = fs
        .readdirSync(folderPath, { withFileTypes: true })
        .filter(
          (e) =>
            e.isFile() &&
            e.name.toLowerCase().endsWith(".json") &&
            e.name.toLowerCase() !== "sources.json",
        )
        .map((e) => path.join(folderPath, e.name));
      for (const file of entries) {
        for (const word of parseWordArrayFile(file)) all.add(word);
      }
    }
  } catch {
  }
  return [...all];
}

const CUSTOM_RACIST_WORDS = loadCustomRacistWords();

const LEET_MAP = new Map([
  ["0", "o"],
  ["1", "i"],
  ["3", "e"],
  ["4", "a"],
  ["5", "s"],
  ["6", "g"],
  ["7", "t"],
  ["8", "b"],
  ["9", "g"],
  ["@", "a"],
  ["$", "s"],
  ["!", "i"],
  ["|", "i"],
]);

function toLeetNormalized(input) {
  let out = "";
  for (const ch of String(input || "")) {
    out += LEET_MAP.get(ch) || ch;
  }
  return out;
}

const WHITELISTED_WEBHOOK_IDS = new Set(
  (Array.isArray(IDs.webhooks?.whitelist) ? IDs.webhooks.whitelist : [])
    .filter(Boolean)
    .map(String),
);
const VERIFIED_BOT_IDS = new Set(
  Object.values(IDs?.bots || {})
    .filter(Boolean)
    .map(String),
);
const CORE_EXEMPT_USER_IDS = new Set([
  "1466495522474037463",
  "1329118940110127204",
]);
const TRUSTED_WEBHOOK_AUTHOR_IDS = new Set(
  [
    IDs.bots?.DISBOARD,
    IDs.bots?.Discadia,
    IDs.bots?.VoteManager,
    IDs.bots?.Dyno,
    IDs.bots?.Wick,
    ...CORE_EXEMPT_USER_IDS,
  ]
    .filter(Boolean)
    .map(String),
);

const STAFF_ROLE_IDS = new Set(
  [
    IDs.roles.Founder,
    IDs.roles.CoFounder,
    IDs.roles.Manager,
    IDs.roles.Admin,
    IDs.roles.HighStaff,
  ]
    .filter(Boolean)
    .map(String),
);

const EXEMPT_CHANNEL_IDS = new Set(
  [
    IDs.channels.staffChat,
    IDs.channels.staffCmds,
    IDs.channels.highCmds,
    IDs.channels.modLogs,
    IDs.channels.activityLogs,
    IDs.channels.highChat,
    IDs.channels.midChat,
  ]
    .filter(Boolean)
    .map(String),
);

const EXEMPT_CATEGORY_IDS = new Set(["1442569074310643845"]);
const EXEMPT_INVITE_CHANNEL_IDS = new Set(["1442569193470824448"]);
const EXEMPT_MENTION_CHANNEL_IDS = new Set(["1442569193470824448"]);

function isTicketLikeCategory(category) {
  const name = String(category?.name || "").toLowerCase().trim();
  if (!name) return false;
  return (
    name.includes("ticket") ||
    name.includes("tickets") ||
    name.includes("support tickets")
  );
}

function isTicketLikeChannel(channel) {
  const channelName = String(channel?.name || "").toLowerCase().trim();
  if (channelName.includes("ticket")) return true;
  const parent = channel?.parent || null;
  if (parent && isTicketLikeCategory(parent)) return true;
  return false;
}

function isUnderExemptCategory(channel) {
  if (!channel) return false;
  if (isTicketLikeChannel(channel)) return true;
  if (EXEMPT_CATEGORY_IDS.has(String(channel.id || ""))) return true;
  if (EXEMPT_CATEGORY_IDS.has(String(channel.parentId || ""))) return true;
  const parent = channel.parent;
  if (!parent) return false;
  if (isTicketLikeCategory(parent)) return true;
  if (EXEMPT_CATEGORY_IDS.has(String(parent.id || ""))) return true;
  if (EXEMPT_CATEGORY_IDS.has(String(parent.parentId || ""))) return true;
  return false;
}

function nowMs() {
  return Date.now();
}

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

function getPanicState(guildId) {
  const key = String(guildId || "");
  const existing = GUILD_PANIC_STATE.get(key);
  if (existing) return existing;
  const initial = {
    activeUntil: 0,
    triggerAccounts: new Map(),
  };
  GUILD_PANIC_STATE.set(key, initial);
  return initial;
}

function prunePanicAccounts(state, at = nowMs()) {
  const minTs = at - PANIC_MODE.triggerWindowMs;
  for (const [userId, payload] of state.triggerAccounts.entries()) {
    const ts =
      typeof payload === "number" ? payload : Number(payload?.ts || 0);
    if (ts < minTs) state.triggerAccounts.delete(userId);
  }
}

function isPanicModeActive(guildId, at = nowMs()) {
  if (!PANIC_MODE.enabled) return false;
  const state = getPanicState(guildId);
  return state.activeUntil > at;
}

function registerPanicTrigger(guildId, userId, options = {}, at = nowMs()) {
  if (!PANIC_MODE.enabled) return { activated: false, active: false, count: 0 };
  const activityBoost = Number(options.activityBoost || 0);
  const dbBoost = Number(options.dbBoost || 0);
  const state = getPanicState(guildId);
  prunePanicAccounts(state, at);
  state.triggerAccounts.set(String(userId), {
    ts: at,
    activityBoost,
    dbBoost,
  });
  let count = 0;
  for (const payload of state.triggerAccounts.values()) {
    if (typeof payload === "number") {
      count += 1;
      continue;
    }
    count +=
      1 + Number(payload?.activityBoost || 0) + Number(payload?.dbBoost || 0);
  }
  const alreadyActive = state.activeUntil > at;
  if (count >= PANIC_MODE.triggerCount) {
    state.activeUntil = Math.max(state.activeUntil, at + PANIC_MODE.durationMs);
  }
  const nowActive = state.activeUntil > at;
  return { activated: !alreadyActive && nowActive, active: nowActive, count };
}

function getCachedBadUser(userId, at = nowMs()) {
  const cached = BAD_USER_CACHE.get(String(userId));
  if (!cached) return null;
  if (cached.expiresAt < at) {
    BAD_USER_CACHE.delete(String(userId));
    return null;
  }
  return cached.value;
}

function setCachedBadUser(userId, value, ttlMs = 60_000) {
  BAD_USER_CACHE.set(String(userId), {
    value,
    expiresAt: nowMs() + ttlMs,
  });
}

async function getBadUserProfile(userId) {
  const cached = getCachedBadUser(userId);
  if (cached) return cached;
  if (!isDbReady()) return null;
  try {
    const row = await AutoModBadUser.findOne(
      { userId: String(userId) },
      {
        _id: 0,
        userId: 1,
        totalTriggers: 1,
        warnPoints: 1,
        activeStrikes: 1,
        activeStrikeReasons: 1,
        lastTriggerAt: 1,
        lastActionAt: 1,
        lastAction: 1,
      },
    ).lean();
    if (row) setCachedBadUser(userId, row);
    return row || null;
  } catch {
    return null;
  }
}

async function markBadUserTrigger(message, violations, heatValue) {
  if (!isDbReady()) return;
  const userId = String(message.author?.id || "");
  if (!userId) return;
  const reasons = [...new Set((violations || []).map((v) => String(v?.key || "").trim()).filter(Boolean))].slice(0, 10);
  try {
    await AutoModBadUser.updateOne(
      { userId },
      {
        $set: {
          lastTriggerAt: new Date(),
          lastGuildId: String(message.guildId || ""),
          lastHeat: Number(heatValue || 0),
          reasons,
        },
        $inc: { totalTriggers: 1 },
      },
      { upsert: true },
    );
    const updated = await AutoModBadUser.findOne(
      { userId },
      {
        _id: 0,
        userId: 1,
        totalTriggers: 1,
        warnPoints: 1,
        activeStrikes: 1,
        activeStrikeReasons: 1,
        lastTriggerAt: 1,
        lastActionAt: 1,
        lastAction: 1,
      },
    ).lean();
    if (updated) setCachedBadUser(userId, updated);
  } catch {
    // Do not break automod flow on DB issues.
  }
}

async function markBadUserAction(message, action, violations = []) {
  if (!isDbReady()) return;
  const userId = String(message?.author?.id || "");
  if (!userId) return;
  const normalizedAction = String(action || "").trim().toLowerCase();
  const inc = { activeStrikes: 0, warnPoints: 0 };
  if (normalizedAction === "warn") inc.warnPoints = 1;
  if (
    normalizedAction === "timeout" ||
    normalizedAction === "delete" ||
    normalizedAction === "delete_webhook"
  ) {
    inc.activeStrikes = 1;
  }
  const strikeReasons = (Array.isArray(violations) ? violations : [])
    .map((v) => firstViolationLabel([v]))
    .filter(Boolean)
    .slice(0, 5);
  const update = {
    $set: {
      lastActionAt: new Date(),
      lastAction: normalizedAction || null,
    },
    $inc: inc,
  };
  if (strikeReasons.length) {
    update.$push = { activeStrikeReasons: { $each: strikeReasons, $slice: -40 } };
  }
  try {
    await AutoModBadUser.updateOne(
      { userId },
      update,
      { upsert: true },
    );
    const updated = await AutoModBadUser.findOne(
      { userId },
      {
        _id: 0,
        userId: 1,
        totalTriggers: 1,
        warnPoints: 1,
        activeStrikes: 1,
        activeStrikeReasons: 1,
        lastTriggerAt: 1,
        lastActionAt: 1,
        lastAction: 1,
      },
    ).lean();
    if (updated) setCachedBadUser(userId, updated);
  } catch {
    // Do not break automod flow on DB issues.
  }
}

function getUserKey(message) {
  return `${message.guildId}:${message.author.id}`;
}

function getState(message) {
  const key = getUserKey(message);
  const existing = USER_STATE.get(key);
  if (existing) return existing;
  const initial = {
    heat: 0,
    lastAt: nowMs(),
    msgTimes: [],
    normHistory: [],
    mentionTimes: [],
    mentionHourTimes: [],
    automodHits: [],
  };
  USER_STATE.set(key, initial);
  return initial;
}

function decayHeat(state, at = nowMs()) {
  const elapsedSec = Math.max(0, (at - state.lastAt) / 1000);
  state.heat = Math.max(0, state.heat - elapsedSec * DECAY_PER_SEC);
  state.lastAt = at;
}

function addHeat(state, amount) {
  state.heat = Math.min(MAX_HEAT, state.heat + amount);
}

function trimWindow(list, windowMs, at = nowMs()) {
  const min = at - windowMs;
  while (list.length && list[0] < min) list.shift();
}

function trimNormHistory(history, windowMs, at = nowMs()) {
  const min = at - windowMs;
  while (history.length && history[0].t < min) history.shift();
}

function normalizeContent(content) {
  return String(content || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " url ")
    .replace(/<a?:\w+:\d+>/g, " emoji ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectInvite(content) {
  const text = String(content || "");
  const match = text.match(
    /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9-]{2,})/i,
  );
  return match ? String(match[1] || "").toLowerCase() : null;
}

function getAllowedInviteCodes(message) {
  const codes = new Set();
  const ownInvite = String(IDs?.links?.invite || "").trim();
  const ownCode = ownInvite.match(/discord\.gg\/([a-zA-Z0-9-]{2,})/i)?.[1];
  if (ownCode) codes.add(ownCode.toLowerCase());
  const vanity = String(message.guild?.vanityURLCode || "").trim();
  if (vanity) codes.add(vanity.toLowerCase());
  return codes;
}

function detectScam(content) {
  const text = String(content || "").toLowerCase();
  if (!text) return false;
  const patterns = [
    /(discord|steam|epic)[a-z0-9-]*\.(gift|nitro|airdrop|drop|claim|free)/,
    /(free|claim).{0,18}(nitro|steam|gift)/,
    /free\s*nitro/,
    /steam\s*gift/,
    /airdrop/,
    /@everyone.{0,40}(nitro|gift|claim)/,
    /(verify|login).{0,20}(discord|steam|epic).{0,20}(gift|nitro|reward)/,
  ];
  return patterns.some((re) => re.test(text));
}

function extractUrls(content) {
  const text = String(content || "");
  const matches = text.match(/(?:https?:\/\/)?(?:www\.)?[^\s/$.?#].[^\s]*/gi) || [];
  return matches
    .filter((raw) => /\./.test(raw))
    .map((raw) => {
      const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      try {
        return new URL(value);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function isImageAttachment(att) {
  if (!att) return false;
  const contentType = String(att.contentType || "").toLowerCase();
  if (contentType.startsWith("image/")) return true;
  const name = String(att.name || att.filename || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|tiff?|avif|heic|heif|svg)$/.test(name);
}

function isNsfwUrl(content) {
  if (!TEXT_RULES.nsfwLinks.enabled) return false;
  const nsfwTokens = [
    "porn",
    "xvideos",
    "xnxx",
    "xhamster",
    "hentai",
    "nsfw",
    "rule34",
    "redtube",
    "youporn",
    "onlyfans",
  ];
  const shorteners = [
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "cutt.ly",
    "is.gd",
    "rebrand.ly",
    "tiny.cc",
  ];
  const urls = extractUrls(content);
  for (const url of urls) {
    const host = String(url.hostname || "").toLowerCase();
    const path = String(url.pathname || "").toLowerCase();
    if (!host) continue;
    if (!TEXT_RULES.nsfwLinks.crawlShorteners && shorteners.some((s) => host === s || host.endsWith(`.${s}`))) {
      continue;
    }
    const haystack = `${host}${path}`;
    if (nsfwTokens.some((t) => haystack.includes(t))) return true;
  }
  return false;
}

function hasBlacklistedDomain(content) {
  if (!TEXT_RULES.linkBlacklist.enabled) return false;
  const urls = extractUrls(content);
  if (!urls.length) return false;
  const blockedDomains = (TEXT_RULES.linkBlacklist.domains || [])
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);
  if (!blockedDomains.length) return false;
  return urls.some((url) => {
    const host = String(url.hostname || "").toLowerCase();
    return blockedDomains.some((d) => host === d || host.endsWith(`.${d}`));
  });
}

function findBlacklistedWordMatch(content) {
  if (!TEXT_RULES.wordBlacklist.enabled) return null;
  const text = String(content || "");
  if (!text) return null;
  const normalizedBase = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const normalized = toLeetNormalized(normalizedBase);
  const normalizedTokens = normalized
    .split(/[^\p{L}\p{N}]+/gu)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const tokenSet = new Set(normalizedTokens);

  if (TEXT_RULES.wordBlacklist.useRacistList) {
    for (let i = 0; i < RACIST_WORD_PATTERNS.length; i += 1) {
      const re = RACIST_WORD_PATTERNS[i];
      if (re.test(text) || re.test(normalized)) {
        return {
          source: "regex",
          term: `pattern#${i + 1}`,
        };
      }
    }
    for (const term of CUSTOM_RACIST_WORDS) {
      const normalizedTerm = toLeetNormalized(
        String(term || "")
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim(),
      );
      if (!normalizedTerm) continue;

      if (/\s/.test(normalizedTerm)) {
        const padded = ` ${normalized} `;
        const needle = ` ${normalizedTerm} `;
        if (padded.includes(needle)) {
          return {
            source: "custom_phrase",
            term,
          };
        }
      } else if (tokenSet.has(normalizedTerm)) {
        return {
          source: "custom_token",
          term,
        };
      }
    }
  }

  return null;
}

function levenshteinDistance(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const cols = t.length + 1;
  const prev = new Array(cols);
  const curr = new Array(cols);
  for (let j = 0; j < cols; j += 1) prev[j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s.charCodeAt(i - 1) === t.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j += 1) prev[j] = curr[j];
  }
  return prev[t.length];
}

function similarityRatio(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  const maxLen = Math.max(s.length, t.length);
  if (!maxLen) return 1;
  const distance = levenshteinDistance(s, t);
  return 1 - distance / maxLen;
}

function countEmojiApprox(content) {
  const text = String(content || "");
  const custom = (text.match(/<a?:\w+:\d+>/g) || []).length;
  const unicode =
    (text.match(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
    ) || []).length;
  return custom + unicode;
}

function countZalgo(content) {
  return (String(content || "").match(/[\u0300-\u036f]/g) || []).length;
}

function countCaseCharacters(content) {
  const text = String(content || "");
  const lower = (text.match(/\p{Ll}/gu) || []).length;
  const upper = (text.match(/\p{Lu}/gu) || []).length;
  return { lower, upper, total: lower + upper };
}

function isExempt(message) {
  if (!message.guild || !message.member) return true;
  if (
    CORE_EXEMPT_USER_IDS.has(String(message.author?.id || "")) ||
    String(message.guild.ownerId || "") === String(message.author?.id || "")
  ) {
    return true;
  }
  if (EXEMPT_CHANNEL_IDS.has(String(message.channelId))) return true;
  if (isUnderExemptCategory(message.channel)) return true;
  if (
    message.member.permissions?.has(PermissionsBitField.Flags.Administrator)
  ) {
    return true;
  }
  return [...STAFF_ROLE_IDS].some((id) => message.member.roles.cache.has(id));
}

async function isVerifiedBotMessage(message) {
  if (!message) return false;
  const authorId = String(message.author?.id || "");
  const applicationId = String(message.applicationId || "");
  if (authorId && VERIFIED_BOT_IDS.has(authorId)) return true;
  if (applicationId && VERIFIED_BOT_IDS.has(applicationId)) return true;
  if (message.author?.bot) {
    try {
      const flags =
        message.author.flags ||
        (typeof message.author.fetchFlags === "function"
          ? await message.author.fetchFlags().catch(() => null)
          : null);
      if (flags?.has?.(UserFlagsBitField.Flags.VerifiedBot)) return true;
    } catch {}
  }
  return false;
}

function isAutoModRoleExemptMember(guild, member) {
  if (!guild || !member) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  if (CORE_EXEMPT_USER_IDS.has(String(member.id || ""))) return true;
  if (
    member.permissions?.has?.(PermissionsBitField.Flags.Administrator) ||
    member.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)
  ) {
    return true;
  }
  return [...STAFF_ROLE_IDS].some((id) => member.roles?.cache?.has?.(id));
}

async function getAutoModMemberSnapshot(member) {
  if (!member?.guild || !member?.user) {
    return {
      heat: 0,
      suspicious: false,
      warnPoints: 0,
      activeStrikes: 0,
      strikeReasons: [],
      whitelist: {
        spam: false,
        ping: false,
        advertising: false,
      },
    };
  }

  const guild = member.guild;
  const userId = String(member.id);
  const key = `${String(guild.id)}:${userId}`;
  const state = USER_STATE.get(key);
  const heat = Number(state?.heat || 0);

  const roleExempt = isAutoModRoleExemptMember(guild, member);
  let suspicious = false;
  let warnPoints = 0;
  let activeStrikes = 0;
  let strikeReasons = [];
  try {
    const profile = await getBadUserProfile(userId);
    const total = Number(profile?.totalTriggers || 0);
    suspicious = total >= 5;
    warnPoints = Math.max(0, Number(profile?.warnPoints || 0));
    activeStrikes = Math.max(0, Number(profile?.activeStrikes || 0));
    strikeReasons = Array.isArray(profile?.activeStrikeReasons)
      ? profile.activeStrikeReasons
          .map((x) => String(x || "").trim())
          .filter(Boolean)
      : [];
  } catch {}

  return {
    heat,
    suspicious,
    warnPoints,
    activeStrikes,
    strikeReasons,
    whitelist: {
      spam: roleExempt,
      ping: roleExempt,
      advertising: roleExempt,
    },
  };
}

function detectViolations(message, state) {
  const at = nowMs();
  const content = String(message.content || "");
  const normalized = normalizeContent(content);
  const violations = [];
  const channelId = String(message.channelId || "");
  const parentChannelId = String(message.channel?.parentId || "");

  if (TEXT_RULES.regularMessage.enabled) {
    state.msgTimes.push(at);
    trimWindow(state.msgTimes, 8_000, at);
    if (state.msgTimes.length >= 6) {
      violations.push({
        key: "regular_message",
        heat: TEXT_RULES.regularMessage.heat,
        info: `${state.msgTimes.length}/8s`,
      });
    }
  }

  if (TEXT_RULES.similarMessage.enabled && normalized.length >= 8) {
    state.normHistory.push({ t: at, c: normalized });
    trimNormHistory(state.normHistory, 18_000, at);
    const ratio = TEXT_RULES.similarMessage.ratio;
    const similarCount = state.normHistory.filter((x) => {
      if (!x?.c || x.t === at) return false;
      return similarityRatio(x.c, normalized) >= ratio;
    }).length;
    if (similarCount >= 1) {
      violations.push({
        key: "similar_message",
        heat: TEXT_RULES.similarMessage.heat,
        info: `ratio>=${ratio.toFixed(2)}`,
      });
    }
  }

  const rawUserMentionCount = message.mentions?.users?.size || 0;
  const repliedUserId = message.mentions?.repliedUser?.id
    ? String(message.mentions.repliedUser.id)
    : null;
  const replyMentionAdjustment =
    repliedUserId && message.mentions?.users?.has?.(repliedUserId) ? 1 : 0;
  const userMentionCount = Math.max(
    0,
    rawUserMentionCount - replyMentionAdjustment,
  );
  const roleMentionCount = message.mentions?.roles?.size || 0;
  const everyoneMentionCount = message.mentions?.everyone ? 1 : 0;
  const mentionCount = userMentionCount + roleMentionCount + everyoneMentionCount;
  if (
    !EXEMPT_MENTION_CHANNEL_IDS.has(channelId) &&
    !EXEMPT_MENTION_CHANNEL_IDS.has(parentChannelId) &&
    MENTION_RULES.enabled
  ) {
    if (mentionCount > 0) {
      for (let i = 0; i < mentionCount; i += 1) {
        state.mentionTimes.push(at);
        state.mentionHourTimes.push(at);
      }
      trimWindow(state.mentionTimes, MENTION_LOCKDOWN_WINDOW_MS, at);
      trimWindow(state.mentionHourTimes, 60 * 60_000, at);
    }

    if (MENTION_RULES.userMentions.enabled && userMentionCount > 0) {
      violations.push({
        key: "mention_user",
        heat: userMentionCount * MENTION_RULES.userMentions.heat,
        info: `${userMentionCount} @user`,
      });
    }

    if (MENTION_RULES.roleMentions.enabled && roleMentionCount > 0) {
      violations.push({
        key: "mention_role",
        heat: roleMentionCount * MENTION_RULES.roleMentions.heat,
        info: `${roleMentionCount} @role`,
      });
    }

    if (MENTION_RULES.everyoneMentions.enabled && everyoneMentionCount > 0) {
      violations.push({
        key: "mention_everyone",
        heat: everyoneMentionCount * MENTION_RULES.everyoneMentions.heat,
        info: "@everyone/@here",
      });
    }

    if (state.mentionHourTimes.length >= MENTION_RULES.hourCap) {
      violations.push({
        key: "mention_hour_cap",
        heat: 100,
        info: `${state.mentionHourTimes.length}/${MENTION_RULES.hourCap} pings/1h`,
      });
    }

    if (state.mentionTimes.length >= MENTION_LOCKDOWN_TRIGGER) {
      violations.push({
        key: "mentions_lockdown",
        heat: 100,
        info: `${state.mentionTimes.length}/${Math.floor(MENTION_LOCKDOWN_WINDOW_MS / 1000)}s`,
      });
    }
  }

  const inviteCode = detectInvite(content);
  if (
    inviteCode &&
    !EXEMPT_INVITE_CHANNEL_IDS.has(channelId) &&
    !EXEMPT_INVITE_CHANNEL_IDS.has(parentChannelId)
  ) {
    const allowedCodes = getAllowedInviteCodes(message);
    if (TEXT_RULES.inviteLinks.enabled && !allowedCodes.has(inviteCode)) {
      violations.push({
        key: "invite",
        heat: TEXT_RULES.inviteLinks.heat,
        info: `discord.gg/${inviteCode}`,
      });
    }
  }

  if (TEXT_RULES.maliciousLinks.enabled && detectScam(content)) {
    violations.push({
      key: "scam_pattern",
      heat: TEXT_RULES.maliciousLinks.heat,
      info: "pattern scam/malicious link",
    });
  }

  if (isNsfwUrl(content)) {
    violations.push({
      key: "nsfw_link",
      heat: TEXT_RULES.nsfwLinks.heat,
      info: "nsfw domain/url",
    });
  }

  const wordBlacklistMatch = findBlacklistedWordMatch(content);
  if (wordBlacklistMatch) {
    violations.push({
      key: "word_blacklist",
      heat: TEXT_RULES.wordBlacklist.heat,
      info:
        wordBlacklistMatch.term && wordBlacklistMatch.source
          ? `racist list (${wordBlacklistMatch.source}: ${wordBlacklistMatch.term})`
          : "racist list",
    });
  }

  if (hasBlacklistedDomain(content)) {
    violations.push({
      key: "link_blacklist",
      heat: TEXT_RULES.linkBlacklist.heat,
      info: "blacklisted domain",
    });
  }

  if (TEXT_RULES.emojis.enabled) {
    const emojiCount = countEmojiApprox(content);
    if (emojiCount >= TEXT_RULES.emojis.minCount) {
      violations.push({
        key: "emoji_spam",
        heat: Number((TEXT_RULES.emojis.heat * WICK_EQUIV.textClusterMultiplier).toFixed(2)),
        info: `${emojiCount} emoji`,
      });
    }
  }

  if (TEXT_RULES.newLines.enabled) {
    const lineBreaks = (content.match(/\n/g) || []).length;
    if (lineBreaks >= TEXT_RULES.newLines.minCount) {
      violations.push({
        key: "new_lines",
        heat: Number((TEXT_RULES.newLines.heat * WICK_EQUIV.textClusterMultiplier).toFixed(2)),
        info: `${lineBreaks} new lines`,
      });
    }
  }

  if (TEXT_RULES.zalgo.enabled) {
    const zalgoCount = countZalgo(content);
    if (zalgoCount >= TEXT_RULES.zalgo.minCount) {
      violations.push({
        key: "zalgo",
        heat: Number((TEXT_RULES.zalgo.heat * WICK_EQUIV.textClusterMultiplier).toFixed(2)),
        info: `${zalgoCount} combining chars`,
      });
    }
  }

  if (TEXT_RULES.characters.enabled) {
    const { lower, upper, total } = countCaseCharacters(content);
    if (total >= TEXT_RULES.characters.minChars) {
      const lowerHeat =
        lower *
        TEXT_RULES.characters.lowercaseHeat *
        WICK_EQUIV.lowerCharMultiplier;
      const upperHeat =
        upper *
        TEXT_RULES.characters.uppercaseHeat *
        WICK_EQUIV.upperCharMultiplier;
      const heat = Number((lowerHeat + upperHeat).toFixed(2));
      if (heat > 0) {
        violations.push({
          key: "characters",
          heat,
          info: `lower:${lower} upper:${upper}`,
        });
      }
    }
  }

  if (ATTACHMENT_RULES.enabled) {
    const embedCount = Array.isArray(message.embeds) ? message.embeds.length : 0;
    const stickerCount = message.stickers?.size || 0;
    const attachmentList = [...(message.attachments?.values?.() || [])];
    const imageCount = attachmentList.filter((att) => isImageAttachment(att)).length;
    const fileCount = Math.max(0, attachmentList.length - imageCount);
    const linkCount = extractUrls(content).length;

    if (ATTACHMENT_RULES.embeds.enabled && embedCount > 0) {
      violations.push({
        key: "attachment_embed",
        heat: embedCount * ATTACHMENT_RULES.embeds.heat,
        info: `${embedCount} embed`,
      });
    }
    if (ATTACHMENT_RULES.images.enabled && imageCount > 0) {
      violations.push({
        key: "attachment_image",
        heat: imageCount * ATTACHMENT_RULES.images.heat,
        info: `${imageCount} image`,
      });
    }
    if (ATTACHMENT_RULES.files.enabled && fileCount > 0) {
      violations.push({
        key: "attachment_file",
        heat: fileCount * ATTACHMENT_RULES.files.heat,
        info: `${fileCount} file`,
      });
    }
    if (ATTACHMENT_RULES.links.enabled && linkCount > 0) {
      violations.push({
        key: "attachment_link",
        heat: linkCount * ATTACHMENT_RULES.links.heat,
        info: `${linkCount} link`,
      });
    }
    if (ATTACHMENT_RULES.stickers.enabled && stickerCount > 0) {
      violations.push({
        key: "attachment_sticker",
        heat: stickerCount * ATTACHMENT_RULES.stickers.heat,
        info: `${stickerCount} sticker`,
      });
    }
  }

  return violations;
}

function getCooldownKey(message) {
  return `${message.guildId}:${message.author.id}`;
}

function canActNow(message) {
  const key = getCooldownKey(message);
  const last = ACTION_COOLDOWN.get(key) || 0;
  if (nowMs() - last < ACTION_COOLDOWN_MS) return false;
  ACTION_COOLDOWN.set(key, nowMs());
  return true;
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.modLogs || IDs.channels.activityLogs;
  if (!channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

function truncateText(input, max = 700) {
  const text = String(input || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function firstViolationLabel(violations = []) {
  const key = String(violations?.[0]?.key || "unknown");
  const labels = {
    regular_message: "Sending too many messages",
    similar_message: "Sending similar messages",
    emoji_spam: "Using too many emojis",
    new_lines: "Using too many newlines",
    zalgo: "Using zalgo characters",
    characters: "Using too many characters",
    invite: "Posting Discord Server Invites",
    scam_pattern: "Posting malicious/scam links",
    nsfw_link: "Posting NSFW links",
    word_blacklist: "Using blacklisted words",
    link_blacklist: "Posting blacklisted links",
    mention_user: "Mention spam (@user)",
    mention_role: "Mention spam (@role)",
    mention_everyone: "Mention spam (@everyone/@here)",
    mention_hour_cap: "Too many mentions in 1h",
    mentions_lockdown: "Mentions lockdown trigger",
    attachment_embed: "Embed spam",
    attachment_image: "Image spam",
    attachment_file: "File spam",
    attachment_link: "Link spam",
    attachment_sticker: "Sticker spam",
    unwhitelisted_webhook: "Unwhitelisted webhook message",
    panic_mode: "Panic mode active",
  };
  return labels[key] || key.replace(/_/g, " ");
}

function formatDurationShort(ms) {
  const totalMinutes = Math.max(1, Math.round(Number(ms || 0) / 60_000));
  if (totalMinutes % 60 === 0) return `${totalMinutes / 60}h`;
  return `${totalMinutes}m`;
}

async function sendAutomodActionInChannel(
  message,
  action,
  violations,
  context = {},
) {
  if (!message?.channel?.isTextBased?.()) return;
  const reason = firstViolationLabel(violations);
  const cooldownKey = [
    String(message.guildId || "noguild"),
    String(message.channelId || "nochannel"),
    String(message.author?.id || "nouser"),
    String(action || "action"),
    reason,
  ].join(":");
  const lastSentAt = ACTION_CHANNEL_LOG_COOLDOWN.get(cooldownKey) || 0;
  if (nowMs() - lastSentAt < ACTION_CHANNEL_LOG_COOLDOWN_MS) return;
  ACTION_CHANNEL_LOG_COOLDOWN.set(cooldownKey, nowMs());
  const durationLabel = context.timeoutMs
    ? ` for ${formatDurationShort(context.timeoutMs)}`
    : "";
  const title =
    action === "timeout"
      ? `${message.author.username} has been timed out${durationLabel}`
      : action === "delete" || action === "delete_webhook"
        ? `${message.author.username}'s message has been removed`
        : `${message.author.username} has been warned`;

  const embed = new EmbedBuilder()
    .setColor(
      action === "timeout"
        ? "#f4d35e"
        : action === "delete" || action === "delete_webhook"
          ? "#f59e0b"
          : "#5865f2",
    )
    .setTitle(title)
    .setDescription(
      [
        `${ARROW} **Reason:** ${reason}`,
      ].join("\n"),
    )
    .setFooter({ text: `${message.author.username} | ${message.author.id}`})

  const sent = await message.channel.send({ embeds: [embed] }).catch(() => null);
  if (sent) {
    setTimeout(() => {
      sent.delete().catch(() => {});
    }, ACTION_CHANNEL_NOTICE_DELETE_MS);
  }
  return sent;
}

async function sendAutomodLog(
  message,
  action,
  violations,
  heatValue,
  context = {},
) {
  const channel = await resolveLogChannel(message.guild);
  if (!channel?.isTextBased?.()) return;
  const primaryFilter = firstViolationLabel(violations);
  const preview = truncateText(message.content, 160);
  const fullMessage = truncateText(message.content, 800);
  const shouldShowFullMessage =
    Boolean(fullMessage) &&
    String(fullMessage) !== String(preview) &&
    String(message.content || "").trim().length > 160;
  const timeoutLabel = context.timeoutMs
    ? ` for ${formatDurationShort(context.timeoutMs)}`
    : "";
  const actionHeadline =
    action === "timeout"
      ? `${message.author.username} has been timed out${timeoutLabel}!`
      : action === "delete" || action === "delete_webhook"
        ? `${message.author.username}'s message has been removed!`
        : `${message.author.username} triggered AutoMod!`;

  const embed = new EmbedBuilder()
    .setColor(
      action === "timeout"
        ? "#ED4245"
        : action === "delete" || action === "delete_webhook"
          ? "#F59E0B"
          : "#5865F2",
    )
    .setTitle(actionHeadline)
    .setDescription(
      [
        `<:VC_right_arrow:1473441155055096081> **Automod Filter:** ${primaryFilter}`,
        `<:VC_right_arrow:1473441155055096081> **Channel:** ${message.channel} [\`${message.channelId}\`]`,
        preview
          ? `<:VC_right_arrow:1473441155055096081> **Message:** ${preview}`
          : null,
        "",
        shouldShowFullMessage ? `*${fullMessage}*` : null,
        "",
        `<:VC_right_arrow:1473441155055096081> **Member:** ${message.author} [\`${message.author.id}\`]`,
        `<:VC_right_arrow:1473441155055096081> **Heat:** ${Number(heatValue || 0).toFixed(1)}`,
        context.timeoutMs
          ? `<:VC_right_arrow:1473441155055096081> **Timeout:** ${formatDurationShort(
              context.timeoutMs,
            )}`
          : null,
        violations?.length
          ? `<:VC_right_arrow:1473441155055096081> **Rules:** ${violations
              .map((v) => `\`${v.key}\`${v.info ? ` (${v.info})` : ""}`)
              .join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function sendPanicModeLog(message, event, count, activeUntil) {
  const channel = await resolveLogChannel(message.guild);
  if (!channel?.isTextBased?.()) return;
  const when = Math.floor(activeUntil / 1000);
  const embed = new EmbedBuilder()
    .setColor(event === "panic_enabled" ? "#ED4245" : "#5865F2")
    .setTitle(
      event === "panic_enabled"
        ? "AutoMod Panic Mode enabled!"
        : "AutoMod Panic Mode update",
    )
    .setDescription(
      [
        `<:VC_right_arrow:1473441155055096081> **Automod Filter:** Panic Mode`,
        `<:VC_right_arrow:1473441155055096081> **Channel:** ${message.channel} [\`${message.channelId}\`]`,
        `<:VC_right_arrow:1473441155055096081> **Member:** ${message.author} [\`${message.author.id}\`]`,
        `<:VC_right_arrow:1473441155055096081> **Event:** ${event}`,
        `<:VC_right_arrow:1473441155055096081> **Trigger Accounts:** ${count}/${PANIC_MODE.triggerCount}`,
        `<:VC_right_arrow:1473441155055096081> **Duration:** ${Math.round(PANIC_MODE.durationMs / 60_000)} minutes`,
        `<:VC_right_arrow:1473441155055096081> **Active Until:** <t:${when}:F>`,
      ].join("\n"),
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function warnUser(message, state, violations) {
  if (!canActNow(message)) return false;
  await message.delete().catch(() => {});
  await markBadUserAction(message, "warn", violations);
  await sendAutomodActionInChannel(message, "warn", violations);
  await sendAutomodLog(message, "warn", violations, state.heat);
  return true;
}

async function deleteMessage(message, state, violations) {
  await message.delete().catch(() => {});
  if (canActNow(message)) {
    await markBadUserAction(message, "delete", violations);
    await sendAutomodActionInChannel(message, "delete", violations);
    await sendAutomodLog(message, "delete", violations, state.heat);
  }
  return true;
}

async function timeoutMember(message, state, violations) {
  const canPunishNow = canActNow(message);
  const member = message.member;
  if (!member) return false;
  const timeoutDurations = [REGULAR_TIMEOUT_MS];
  if (violations.some((v) => v.key === "invite")) {
    timeoutDurations.push(TEXT_RULES.inviteLinks.timeoutMs);
  }
  if (violations.some((v) => v.key === "scam_pattern")) {
    timeoutDurations.push(TEXT_RULES.maliciousLinks.timeoutMs);
  }
  if (violations.some((v) => v.key === "nsfw_link")) {
    timeoutDurations.push(TEXT_RULES.nsfwLinks.timeoutMs);
  }
  if (violations.some((v) => v.key === "word_blacklist")) {
    timeoutDurations.push(TEXT_RULES.wordBlacklist.timeoutMs);
  }
  if (violations.some((v) => v.key === "link_blacklist")) {
    timeoutDurations.push(TEXT_RULES.linkBlacklist.timeoutMs);
  }
  if (
    violations.some((v) =>
      [
        "mention_user",
        "mention_role",
        "mention_everyone",
        "mention_hour_cap",
        "mentions_lockdown",
      ].includes(v.key),
    )
  ) {
    timeoutDurations.push(MENTION_RULES.timeoutMs);
  }
  if (
    violations.some((v) =>
      [
        "attachment_embed",
        "attachment_image",
        "attachment_file",
        "attachment_link",
        "attachment_sticker",
      ].includes(v.key),
    )
  ) {
    timeoutDurations.push(ATTACHMENT_RULES.timeoutMs);
  }
  const durationMs = Math.max(...timeoutDurations);
  await message.delete().catch(() => {});
  if (!canPunishNow) return true;
  if (!member?.moderatable) return false;
  const me = message.guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
    return false;
  }
  const timedOut = await member
    .timeout(durationMs, `AutoMod heat ${state.heat.toFixed(1)}`)
    .then(() => true)
    .catch(() => false);
  if (!timedOut) return false;
  await markBadUserAction(message, "timeout", violations);
  state.heat = HEAT_RESET_ON_PUNISHMENT ? 0 : Math.max(35, state.heat * 0.45);
  await sendAutomodActionInChannel(message, "timeout", violations, {
    timeoutMs: durationMs,
  });
  await sendAutomodLog(message, "timeout", violations, state.heat, {
    timeoutMs: durationMs,
  });
  return true;
}

async function runAutoModMessage(message) {
  if (!message?.guild) return { blocked: false };
  if (await isVerifiedBotMessage(message)) return { blocked: false };
  if (message.webhookId) {
    const webhookId = String(message.webhookId);
    const authorId = String(message.author?.id || "");
    const applicationId = String(message.applicationId || "");
    const clientAppId = String(message.client?.user?.id || "");

    if (CORE_EXEMPT_USER_IDS.has(authorId)) return { blocked: false };
    if (TRUSTED_WEBHOOK_AUTHOR_IDS.has(authorId)) return { blocked: false };
    if (applicationId && TRUSTED_WEBHOOK_AUTHOR_IDS.has(applicationId)) {
      return { blocked: false };
    }
    if (
      applicationId &&
      (applicationId === clientAppId || CORE_EXEMPT_USER_IDS.has(applicationId))
    ) {
      return { blocked: false };
    }
    if (WHITELISTED_WEBHOOK_IDS.has(webhookId)) return { blocked: false };
    await message.delete().catch(() => {});
    await markBadUserAction(message, "delete_webhook", [
      { key: "unwhitelisted_webhook" },
    ]);
    await sendAutomodActionInChannel(
      message,
      "delete_webhook",
      [{ key: "unwhitelisted_webhook", heat: 0, info: webhookId }],
    );
    await sendAutomodLog(
      message,
      "delete_webhook",
      [{ key: "unwhitelisted_webhook", heat: 0, info: webhookId }],
      0,
    );
    return { blocked: true, action: "delete_webhook", heat: 0 };
  }
  if (!message?.member) return { blocked: false };
  if (message.author?.bot || message.system) {
    return { blocked: false };
  }
  if (isExempt(message)) return { blocked: false };

  const state = getState(message);
  decayHeat(state);
  const violations = detectViolations(message, state);
  if (!violations.length) return { blocked: false };

  const at = nowMs();
  const shouldCountForPanic = violations.some((v) => INSTANT_LINK_KEYS.has(v.key));
  if (shouldCountForPanic) {
    state.automodHits.push(at);
    trimWindow(state.automodHits, PANIC_MODE.triggerWindowMs, at);

    let activityBoost = 0;
    if (PANIC_MODE.considerActivityHistory) {
      const priorRecentHits = Math.max(0, state.automodHits.length - 1);
      if (priorRecentHits >= 2) activityBoost = 1;
    }

    let dbBoost = 0;
    if (PANIC_MODE.useGlobalBadUsersDb) {
      const profile = await getBadUserProfile(message.author.id);
      const total = Number(profile?.totalTriggers || 0);
      const lastTs = profile?.lastTriggerAt ? new Date(profile.lastTriggerAt).getTime() : 0;
      const recentEnough = lastTs > 0 && at - lastTs <= 30 * 24 * 60 * 60_000;
      if (total >= 5 && recentEnough) dbBoost = 1;
    }

    const panic = registerPanicTrigger(
      message.guildId,
      message.author.id,
      { activityBoost, dbBoost },
      at,
    );

    if (panic.activated) {
      const activeUntil = getPanicState(message.guildId).activeUntil;
      await sendPanicModeLog(
        message,
        "panic_enabled",
        panic.count,
        activeUntil,
      );
    }
  }

  const panicActive = isPanicModeActive(message.guildId);
  if (panicActive) {
    state.heat = MAX_HEAT;
    await markBadUserTrigger(message, violations, state.heat);
    const done = await timeoutMember(message, state, [
      ...violations,
      { key: "panic_mode", heat: 0, info: "elevated mode active" },
    ]);
    if (done) return { blocked: true, action: "timeout", heat: state.heat };
    const deleted = await deleteMessage(message, state, [
      ...violations,
      { key: "panic_mode", heat: 0, info: "timeout fallback -> delete" },
    ]);
    return {
      blocked: Boolean(deleted),
      action: deleted ? "delete" : "cooldown_skip",
      heat: state.heat,
    };
  }

  const hasInstantLinkViolation = violations.some((v) =>
    INSTANT_LINK_KEYS.has(v.key),
  );
  if (hasInstantLinkViolation) {
    state.heat = MAX_HEAT;
    await markBadUserTrigger(message, violations, state.heat);
    const done = await timeoutMember(message, state, violations);
    if (done) return { blocked: true, action: "timeout", heat: state.heat };
    const deleted = await deleteMessage(message, state, [
      ...violations,
      { key: "link_blacklist", heat: 0, info: "timeout fallback -> delete" },
    ]);
    return {
      blocked: Boolean(deleted),
      action: deleted ? "delete" : "cooldown_skip",
      heat: state.heat,
    };
  }

  for (const v of violations) addHeat(state, v.heat);
  await markBadUserTrigger(message, violations, state.heat);

  if (state.heat >= TIMEOUT_THRESHOLD) {
    const done = await timeoutMember(message, state, violations);
    if (done) return { blocked: true, action: "timeout", heat: state.heat };
    const deleted = await deleteMessage(message, state, [
      ...violations,
      { key: "regular_message", heat: 0, info: "timeout fallback -> delete" },
    ]);
    return {
      blocked: Boolean(deleted),
      action: deleted ? "delete" : "cooldown_skip",
      heat: state.heat,
    };
  }

  if (state.heat >= DELETE_THRESHOLD) {
    const deleted = await deleteMessage(message, state, violations);
    return {
      blocked: Boolean(deleted),
      action: deleted ? "delete" : "cooldown_skip",
      heat: state.heat,
    };
  }

  if (state.heat >= WARN_THRESHOLD) {
    const warned = await warnUser(message, state, violations);
    return {
      blocked: Boolean(warned),
      action: warned ? "warn" : "cooldown_skip",
      heat: state.heat,
    };
  }

  return { blocked: false, action: "heat", heat: state.heat };
}

module.exports = {
  runAutoModMessage,
  getAutoModMemberSnapshot,
  isAutoModRoleExemptMember,
};


