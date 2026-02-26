const { EmbedBuilder, PermissionsBitField, UserFlagsBitField } = require("discord.js");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const axios = require("axios");
const IDs = require("../../Utils/Config/ids");
const {
  isSecurityProfileImmune,
  hasAdminsProfileCapability,
  hasModeratorsProfileCapability,
  getSecurityStaticsSnapshot,
} = require("./securityProfilesService");
const {
  isJoinGateSuspiciousAccount,
} = require("./suspiciousAccountService");
const AutoModBadUser = require("../../Schemas/Moderation/autoModBadUserSchema");
const { isChannelInTicketCategory } = require("../../Utils/Ticket/ticketCategoryUtils");
const { createModCase, getModConfig, logModCase, formatDuration } = require("../../Utils/Moderation/moderation");
const ARROW = "<:VC_right_arrow:1473441155055096081>";

const USER_STATE = new Map();
const ACTION_COOLDOWN = new Map();
const ACTION_CHANNEL_LOG_COOLDOWN = new Map();
const GUILD_PANIC_STATE = new Map();
const BAD_USER_CACHE = new Map();
const GUILD_INSTANT_EVENTS = new Map();
const URL_EXPANSION_CACHE = new Map();
const EXTERNAL_PANIC_SIGNAL_COOLDOWN = new Map();
const AUTO_TIMEOUT_PROFILE = new Map();
const VERIFIED_BOT_USER_CACHE = new Map();

let DECAY_PER_SEC = 2;
let MAX_HEAT = 100;
let WARN_THRESHOLD = 35;
let DELETE_THRESHOLD = 65;
let TIMEOUT_THRESHOLD = 100;
const ACTION_COOLDOWN_MS = 12_000;
const ACTION_CHANNEL_LOG_COOLDOWN_MS = 6_000;
const ACTION_CHANNEL_NOTICE_DELETE_MS = 10_000;
const RUNTIME_CLEANUP_INTERVAL_MS = 30_000;
let AUTO_TIMEOUTS_ENABLED = true;
let AUTO_TIMEOUT_REGULAR_MS = 1 * 60_000;
let AUTO_TIMEOUT_CAP_MS = 11 * 60_000;
let AUTO_TIMEOUT_CAP_STRIKE = 3;
let AUTO_TIMEOUT_MULTIPLIER_ENABLED = true;
let AUTO_TIMEOUT_MULTIPLIER_PERCENT = 200;
let AUTO_TIMEOUT_PROFILE_RESET_MS = 6 * 60 * 60_000;
const DISCORD_TIMEOUT_MAX_MS = 28 * 24 * 60 * 60_000;
let REGULAR_TIMEOUT_MS = AUTO_TIMEOUT_REGULAR_MS;
const EXTERNAL_PANIC_SIGNAL_COOLDOWN_MS = 90_000;
let HEAT_RESET_ON_PUNISHMENT = true;
let MENTION_LOCKDOWN_TRIGGER = 50;
let MENTION_LOCKDOWN_WINDOW_MS = 3_000;
let AUTOMOD_ENABLED = true;
let AUTOMOD_ANTISPAM_ENABLED = true;
let AUTOMOD_MONITOR_UNWHITELISTED_WEBHOOKS = true;
const PANIC_MODE = {
  enabled: true,
  considerActivityHistory: true,
  useGlobalBadUsersDb: true,
  triggerCount: 3,
  triggerWindowMs: 10 * 60_000,
  durationMs: 10 * 60_000,
  raidWindowMs: 120_000,
  raidUserThreshold: 6,
  raidYoungThreshold: 4,
};
const PANIC_TRIGGER_KEYS = new Set([
  "invite",
  "scam_pattern",
  "nsfw_link",
  "word_blacklist",
  "link_blacklist",
  "mention_everyone",
  "mentions_lockdown",
  "mention_hour_cap",
  "unwhitelisted_webhook",
]);
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
  timeoutMs: 0,
  embeds: { enabled: true, heat: 15 },
  images: { enabled: true, heat: 20 },
  files: { enabled: true, heat: 15 },
  links: { enabled: true, heat: 10 },
  stickers: { enabled: true, heat: 15 },
};

const TEXT_RULES = {
  regularMessage: {
    enabled: true,
    heat: 15,
    timeoutMs: 15 * 60_000,
  },
  suspiciousAccount: {
    enabled: true,
    heat: 7,
    timeoutMs: 15 * 60_000,
  },
  similarMessage: {
    enabled: true,
    heat: 22,
    ratio: 0.8,
    timeoutMs: 15 * 60_000,
  },
  emojis: {
    enabled: true,
    heat: 9,
    minCount: 8,
    timeoutMs: 15 * 60_000,
  },
  newLines: {
    enabled: true,
    heat: 5,
    minCount: 6,
    timeoutMs: 15 * 60_000,
  },
  zalgo: {
    enabled: true,
    heat: 1.5,
    minCount: 6,
    timeoutMs: 15 * 60_000,
  },
  characters: {
    enabled: true,
    lowercaseHeat: 0.08,
    uppercaseHeat: 0.12,
    minChars: 40,
    timeoutMs: 15 * 60_000,
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
    crawlShorteners: true,
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

const AUTOMOD_CONFIG_PATH = path.resolve(
  __dirname,
  "../../Utils/Config/automodConfig.json",
);
const AUTOMOD_METRICS_PATH = path.resolve(
  __dirname,
  "../../Utils/Config/automodMetrics.json",
);
const SHORTENER_HOSTS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "cutt.ly",
  "is.gd",
  "rebrand.ly",
  "tiny.cc",
  "shorturl.at",
  "goo.gl",
  "ow.ly",
  "buff.ly",
]);

const DEFAULT_AUTOMOD_RUNTIME = {
  status: {
    enabled: true,
    antiSpamEnabled: true,
    monitorUnwhitelistedWebhooks: true,
  },
  thresholds: {
    warn: 35,
    delete: 65,
    timeout: 100,
  },
  heatSystem: {
    maxHeat: 100,
    decayPerSec: 2,
    resetOnPunishment: true,
  },
  autoTimeouts: {
    enabled: true,
    regularStrikeDurationMs: 60_000,
    capStrikeDurationMs: 11 * 60_000,
    capStrike: 3,
    multiplierEnabled: true,
    multiplierPercent: 200,
    profileResetMs: 6 * 60 * 60_000,
  },
  autoLockdown: {
    enabled: true,
    mentionTrigger: 50,
    mentionWindowMs: 3_000,
    mentionHourCap: 20,
  },
  heatFilters: {
    regularMessage: true,
    suspiciousAccount: true,
    similarMessage: true,
    emojis: true,
    newLines: true,
    zalgo: true,
    characters: true,
    inviteLinks: true,
    maliciousLinks: true,
    nsfwLinks: true,
    wordBlacklist: true,
    linkBlacklist: true,
    mentions: true,
    attachments: true,
    webhookMessages: true,
  },
  heatFactors: {
    regularMessage: 1,
    suspiciousAccount: 1,
    similarMessage: 1,
    emojis: 1,
    newLines: 1,
    zalgo: 1,
    characters: 1,
    inviteLinks: 1,
    maliciousLinks: 1,
    nsfwLinks: 1,
    wordBlacklist: 1,
    linkBlacklist: 1,
    mentions: 1,
    attachments: 1,
  },
  heatCaps: {
    maxPerMessage: 85,
    charactersMax: 40,
    textClusterMax: 35,
    attachmentClusterMax: 28,
    mentionClusterMax: 70,
  },
  panic: {
    enabled: true,
    considerActivityHistory: true,
    useGlobalBadUsersDb: true,
    triggerCount: 3,
    triggerWindowMs: 10 * 60_000,
    durationMs: 10 * 60_000,
    raidWindowMs: 120_000,
    raidUserThreshold: 6,
    raidYoungThreshold: 4,
  },
  shorteners: {
    crawl: true,
    timeoutMs: 2200,
    maxHops: 3,
  },
  profiles: {
    default: {
      exempt: false,
      heatMultiplier: 1,
      mentionsEnabled: true,
      attachmentsEnabled: true,
      inviteLinksEnabled: true,
    },
    media: {
      exempt: false,
      heatMultiplier: 0.85,
      mentionsEnabled: true,
      attachmentsEnabled: false,
      inviteLinksEnabled: true,
    },
    ticket: {
      exempt: true,
      heatMultiplier: 0.6,
      mentionsEnabled: false,
      attachmentsEnabled: false,
      inviteLinksEnabled: false,
    },
    staff: {
      exempt: true,
      heatMultiplier: 0.25,
      mentionsEnabled: false,
      attachmentsEnabled: false,
      inviteLinksEnabled: false,
    },
  },
};

function deepMerge(base, override) {
  if (!override || typeof override !== "object") return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === "object" &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key], value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath, value) {
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeAutoModRuntimeConfig(rawCfg) {
  const merged = deepMerge(DEFAULT_AUTOMOD_RUNTIME, rawCfg || {});
  merged.status = merged.status || {};
  merged.status.enabled =
    typeof merged.status.enabled === "boolean"
      ? merged.status.enabled
      : DEFAULT_AUTOMOD_RUNTIME.status.enabled;
  merged.status.antiSpamEnabled =
    typeof merged.status.antiSpamEnabled === "boolean"
      ? merged.status.antiSpamEnabled
      : DEFAULT_AUTOMOD_RUNTIME.status.antiSpamEnabled;
  merged.status.monitorUnwhitelistedWebhooks =
    typeof merged.status.monitorUnwhitelistedWebhooks === "boolean"
      ? merged.status.monitorUnwhitelistedWebhooks
      : DEFAULT_AUTOMOD_RUNTIME.status.monitorUnwhitelistedWebhooks;
  merged.thresholds = merged.thresholds || {};
  merged.thresholds.warn = clampNumber(
    merged.thresholds.warn,
    0,
    200,
    DEFAULT_AUTOMOD_RUNTIME.thresholds.warn,
  );
  merged.thresholds.delete = clampNumber(
    merged.thresholds.delete,
    0,
    200,
    DEFAULT_AUTOMOD_RUNTIME.thresholds.delete,
  );
  merged.thresholds.timeout = clampNumber(
    merged.thresholds.timeout,
    0,
    200,
    DEFAULT_AUTOMOD_RUNTIME.thresholds.timeout,
  );
  if (merged.thresholds.delete < merged.thresholds.warn) {
    merged.thresholds.delete = merged.thresholds.warn;
  }
  if (merged.thresholds.timeout < merged.thresholds.delete) {
    merged.thresholds.timeout = merged.thresholds.delete;
  }
  merged.heatSystem = merged.heatSystem || {};
  merged.heatSystem.maxHeat = clampNumber(
    merged.heatSystem.maxHeat,
    50,
    200,
    DEFAULT_AUTOMOD_RUNTIME.heatSystem.maxHeat,
  );
  merged.heatSystem.decayPerSec = clampNumber(
    merged.heatSystem.decayPerSec,
    0,
    10,
    DEFAULT_AUTOMOD_RUNTIME.heatSystem.decayPerSec,
  );
  merged.heatSystem.resetOnPunishment =
    typeof merged.heatSystem.resetOnPunishment === "boolean"
      ? merged.heatSystem.resetOnPunishment
      : DEFAULT_AUTOMOD_RUNTIME.heatSystem.resetOnPunishment;

  merged.autoTimeouts = merged.autoTimeouts || {};
  merged.autoTimeouts.enabled =
    typeof merged.autoTimeouts.enabled === "boolean"
      ? merged.autoTimeouts.enabled
      : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.enabled;
  merged.autoTimeouts.regularStrikeDurationMs = clampNumber(
    merged.autoTimeouts.regularStrikeDurationMs,
    30_000,
    24 * 60 * 60_000,
    DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.regularStrikeDurationMs,
  );
  merged.autoTimeouts.capStrikeDurationMs = clampNumber(
    merged.autoTimeouts.capStrikeDurationMs,
    merged.autoTimeouts.regularStrikeDurationMs,
    28 * 24 * 60 * 60_000,
    DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.capStrikeDurationMs,
  );
  merged.autoTimeouts.capStrike = clampNumber(
    merged.autoTimeouts.capStrike,
    2,
    20,
    DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.capStrike,
  );
  merged.autoTimeouts.multiplierEnabled =
    typeof merged.autoTimeouts.multiplierEnabled === "boolean"
      ? merged.autoTimeouts.multiplierEnabled
      : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.multiplierEnabled;
  merged.autoTimeouts.multiplierPercent = clampNumber(
    merged.autoTimeouts.multiplierPercent,
    100,
    500,
    DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.multiplierPercent,
  );
  merged.autoTimeouts.profileResetMs = clampNumber(
    merged.autoTimeouts.profileResetMs,
    60_000,
    7 * 24 * 60 * 60_000,
    DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.profileResetMs,
  );

  merged.autoLockdown = merged.autoLockdown || {};
  merged.autoLockdown.enabled =
    typeof merged.autoLockdown.enabled === "boolean"
      ? merged.autoLockdown.enabled
      : DEFAULT_AUTOMOD_RUNTIME.autoLockdown.enabled;
  merged.autoLockdown.mentionTrigger = clampNumber(
    merged.autoLockdown.mentionTrigger,
    5,
    200,
    DEFAULT_AUTOMOD_RUNTIME.autoLockdown.mentionTrigger,
  );
  merged.autoLockdown.mentionWindowMs = clampNumber(
    merged.autoLockdown.mentionWindowMs,
    1_000,
    60_000,
    DEFAULT_AUTOMOD_RUNTIME.autoLockdown.mentionWindowMs,
  );
  merged.autoLockdown.mentionHourCap = clampNumber(
    merged.autoLockdown.mentionHourCap,
    5,
    400,
    DEFAULT_AUTOMOD_RUNTIME.autoLockdown.mentionHourCap,
  );

  merged.heatFilters = merged.heatFilters || {};
  for (const key of Object.keys(DEFAULT_AUTOMOD_RUNTIME.heatFilters)) {
    merged.heatFilters[key] =
      typeof merged.heatFilters[key] === "boolean"
        ? merged.heatFilters[key]
        : DEFAULT_AUTOMOD_RUNTIME.heatFilters[key];
  }

  merged.heatFactors = merged.heatFactors || {};
  for (const [key, fallback] of Object.entries(DEFAULT_AUTOMOD_RUNTIME.heatFactors)) {
    merged.heatFactors[key] = clampNumber(
      merged.heatFactors[key],
      0,
      5,
      fallback,
    );
  }
  merged.heatCaps = merged.heatCaps || {};
  merged.heatCaps.maxPerMessage = clampNumber(
    merged.heatCaps.maxPerMessage,
    20,
    200,
    DEFAULT_AUTOMOD_RUNTIME.heatCaps.maxPerMessage,
  );
  merged.heatCaps.charactersMax = clampNumber(
    merged.heatCaps.charactersMax,
    5,
    150,
    DEFAULT_AUTOMOD_RUNTIME.heatCaps.charactersMax,
  );
  merged.heatCaps.textClusterMax = clampNumber(
    merged.heatCaps.textClusterMax,
    5,
    150,
    DEFAULT_AUTOMOD_RUNTIME.heatCaps.textClusterMax,
  );
  merged.heatCaps.attachmentClusterMax = clampNumber(
    merged.heatCaps.attachmentClusterMax,
    5,
    150,
    DEFAULT_AUTOMOD_RUNTIME.heatCaps.attachmentClusterMax,
  );
  merged.heatCaps.mentionClusterMax = clampNumber(
    merged.heatCaps.mentionClusterMax,
    5,
    200,
    DEFAULT_AUTOMOD_RUNTIME.heatCaps.mentionClusterMax,
  );

  merged.panic = merged.panic || {};
  merged.panic.triggerCount = clampNumber(
    merged.panic.triggerCount,
    1,
    30,
    DEFAULT_AUTOMOD_RUNTIME.panic.triggerCount,
  );
  merged.panic.triggerWindowMs = clampNumber(
    merged.panic.triggerWindowMs,
    10_000,
    24 * 60 * 60_000,
    DEFAULT_AUTOMOD_RUNTIME.panic.triggerWindowMs,
  );
  merged.panic.durationMs = clampNumber(
    merged.panic.durationMs,
    30_000,
    24 * 60 * 60_000,
    DEFAULT_AUTOMOD_RUNTIME.panic.durationMs,
  );
  merged.panic.raidWindowMs = clampNumber(
    merged.panic.raidWindowMs,
    10_000,
    60 * 60_000,
    DEFAULT_AUTOMOD_RUNTIME.panic.raidWindowMs,
  );
  merged.panic.raidUserThreshold = clampNumber(
    merged.panic.raidUserThreshold,
    1,
    100,
    DEFAULT_AUTOMOD_RUNTIME.panic.raidUserThreshold,
  );
  merged.panic.raidYoungThreshold = clampNumber(
    merged.panic.raidYoungThreshold,
    1,
    100,
    DEFAULT_AUTOMOD_RUNTIME.panic.raidYoungThreshold,
  );
  return merged;
}

const rawAutomodRuntimeConfig = readJsonSafe(AUTOMOD_CONFIG_PATH, {});
let automodRuntimeConfig = sanitizeAutoModRuntimeConfig(rawAutomodRuntimeConfig);
if (
  JSON.stringify(rawAutomodRuntimeConfig || {}) !==
  JSON.stringify(automodRuntimeConfig || {})
) {
  writeJsonSafe(AUTOMOD_CONFIG_PATH, automodRuntimeConfig);
}
const automodMetrics = readJsonSafe(AUTOMOD_METRICS_PATH, { guilds: {} });
let metricsSaveTimer = null;
let lastRuntimeCleanupAt = 0;

function scheduleMetricsSave() {
  if (metricsSaveTimer) clearTimeout(metricsSaveTimer);
  metricsSaveTimer = setTimeout(() => {
    metricsSaveTimer = null;
    writeJsonSafe(AUTOMOD_METRICS_PATH, automodMetrics);
  }, 1200);
  if (typeof metricsSaveTimer?.unref === "function") metricsSaveTimer.unref();
}

function applyAutomodRuntime() {
  const status = automodRuntimeConfig?.status || {};
  AUTOMOD_ENABLED =
    typeof status.enabled === "boolean"
      ? status.enabled
      : DEFAULT_AUTOMOD_RUNTIME.status.enabled;
  AUTOMOD_ANTISPAM_ENABLED =
    typeof status.antiSpamEnabled === "boolean"
      ? status.antiSpamEnabled
      : DEFAULT_AUTOMOD_RUNTIME.status.antiSpamEnabled;
  AUTOMOD_MONITOR_UNWHITELISTED_WEBHOOKS =
    typeof status.monitorUnwhitelistedWebhooks === "boolean"
      ? status.monitorUnwhitelistedWebhooks
      : DEFAULT_AUTOMOD_RUNTIME.status.monitorUnwhitelistedWebhooks;
  const t = automodRuntimeConfig?.thresholds || {};
  WARN_THRESHOLD = Number.isFinite(Number(t.warn))
    ? Number(t.warn)
    : DEFAULT_AUTOMOD_RUNTIME.thresholds.warn;
  DELETE_THRESHOLD = Number.isFinite(Number(t.delete))
    ? Number(t.delete)
    : DEFAULT_AUTOMOD_RUNTIME.thresholds.delete;
  TIMEOUT_THRESHOLD = Number.isFinite(Number(t.timeout))
    ? Number(t.timeout)
    : DEFAULT_AUTOMOD_RUNTIME.thresholds.timeout;
  const hs = automodRuntimeConfig?.heatSystem || {};
  MAX_HEAT = Number.isFinite(Number(hs.maxHeat))
    ? Number(hs.maxHeat)
    : DEFAULT_AUTOMOD_RUNTIME.heatSystem.maxHeat;
  DECAY_PER_SEC = Number.isFinite(Number(hs.decayPerSec))
    ? Number(hs.decayPerSec)
    : DEFAULT_AUTOMOD_RUNTIME.heatSystem.decayPerSec;
  HEAT_RESET_ON_PUNISHMENT =
    typeof hs.resetOnPunishment === "boolean"
      ? hs.resetOnPunishment
      : DEFAULT_AUTOMOD_RUNTIME.heatSystem.resetOnPunishment;

  const at = automodRuntimeConfig?.autoTimeouts || {};
  AUTO_TIMEOUTS_ENABLED =
    typeof at.enabled === "boolean"
      ? at.enabled
      : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.enabled;
  AUTO_TIMEOUT_REGULAR_MS = Number.isFinite(Number(at.regularStrikeDurationMs))
    ? Number(at.regularStrikeDurationMs)
    : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.regularStrikeDurationMs;
  AUTO_TIMEOUT_CAP_MS = Number.isFinite(Number(at.capStrikeDurationMs))
    ? Number(at.capStrikeDurationMs)
    : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.capStrikeDurationMs;
  AUTO_TIMEOUT_CAP_STRIKE = Number.isFinite(Number(at.capStrike))
    ? Number(at.capStrike)
    : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.capStrike;
  AUTO_TIMEOUT_MULTIPLIER_ENABLED =
    typeof at.multiplierEnabled === "boolean"
      ? at.multiplierEnabled
      : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.multiplierEnabled;
  AUTO_TIMEOUT_MULTIPLIER_PERCENT = Number.isFinite(Number(at.multiplierPercent))
    ? Number(at.multiplierPercent)
    : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.multiplierPercent;
  AUTO_TIMEOUT_PROFILE_RESET_MS = Number.isFinite(Number(at.profileResetMs))
    ? Number(at.profileResetMs)
    : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.profileResetMs;
  REGULAR_TIMEOUT_MS = AUTO_TIMEOUT_REGULAR_MS;

  const al = automodRuntimeConfig?.autoLockdown || {};
  MENTION_LOCKDOWN_TRIGGER = Number.isFinite(Number(al.mentionTrigger))
    ? Number(al.mentionTrigger)
    : DEFAULT_AUTOMOD_RUNTIME.autoLockdown.mentionTrigger;
  MENTION_LOCKDOWN_WINDOW_MS = Number.isFinite(Number(al.mentionWindowMs))
    ? Number(al.mentionWindowMs)
    : DEFAULT_AUTOMOD_RUNTIME.autoLockdown.mentionWindowMs;
  MENTION_RULES.hourCap = Number.isFinite(Number(al.mentionHourCap))
    ? Number(al.mentionHourCap)
    : DEFAULT_AUTOMOD_RUNTIME.autoLockdown.mentionHourCap;

  const hf = automodRuntimeConfig?.heatFilters || {};
  MENTION_RULES.enabled =
    hf.mentions !== undefined
      ? Boolean(hf.mentions)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.mentions;
  ATTACHMENT_RULES.enabled =
    hf.attachments !== undefined
      ? Boolean(hf.attachments)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.attachments;
  TEXT_RULES.regularMessage.enabled =
    hf.regularMessage !== undefined
      ? Boolean(hf.regularMessage)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.regularMessage;
  TEXT_RULES.suspiciousAccount.enabled =
    hf.suspiciousAccount !== undefined
      ? Boolean(hf.suspiciousAccount)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.suspiciousAccount;
  TEXT_RULES.similarMessage.enabled =
    hf.similarMessage !== undefined
      ? Boolean(hf.similarMessage)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.similarMessage;
  TEXT_RULES.emojis.enabled =
    hf.emojis !== undefined
      ? Boolean(hf.emojis)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.emojis;
  TEXT_RULES.newLines.enabled =
    hf.newLines !== undefined
      ? Boolean(hf.newLines)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.newLines;
  TEXT_RULES.zalgo.enabled =
    hf.zalgo !== undefined
      ? Boolean(hf.zalgo)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.zalgo;
  TEXT_RULES.characters.enabled =
    hf.characters !== undefined
      ? Boolean(hf.characters)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.characters;
  TEXT_RULES.inviteLinks.enabled =
    hf.inviteLinks !== undefined
      ? Boolean(hf.inviteLinks)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.inviteLinks;
  TEXT_RULES.maliciousLinks.enabled =
    hf.maliciousLinks !== undefined
      ? Boolean(hf.maliciousLinks)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.maliciousLinks;
  TEXT_RULES.nsfwLinks.enabled =
    hf.nsfwLinks !== undefined
      ? Boolean(hf.nsfwLinks)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.nsfwLinks;
  TEXT_RULES.wordBlacklist.enabled =
    hf.wordBlacklist !== undefined
      ? Boolean(hf.wordBlacklist)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.wordBlacklist;
  TEXT_RULES.linkBlacklist.enabled =
    hf.linkBlacklist !== undefined
      ? Boolean(hf.linkBlacklist)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.linkBlacklist;

  const p = automodRuntimeConfig?.panic || {};
  Object.assign(PANIC_MODE, p);
}
applyAutomodRuntime();

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
const SPAM_WHITELIST_CATEGORY_IDS = new Set(
  [
    IDs?.categories?.categoryGames,
    "1442569074310643845",
  ]
    .filter(Boolean)
    .map(String),
);
const INVITE_WHITELIST_CHANNEL_IDS = new Set(
  [
    IDs?.channels?.partnerships,
    "1442569193470824448",
  ]
    .filter(Boolean)
    .map(String),
);
const MENTION_WHITELIST_CHANNEL_IDS = new Set(
  [
    IDs?.channels?.partnerships,
    "1442569193470824448",
  ]
    .filter(Boolean)
    .map(String),
);
const EVERYONE_WHITELIST_CHANNEL_IDS = new Set(
  [
    IDs?.channels?.partnerships,
    "1442569193470824448",
  ]
    .filter(Boolean)
    .map(String),
);

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
  if (!channel) return false;
  if (isChannelInTicketCategory(channel)) return true;
  const channelName = String(channel?.name || "").toLowerCase().trim();
  if (channelName.includes("ticket")) return true;
  const parent =
    channel?.parent ||
    channel?.parentChannel ||
    channel?.parentThread ||
    null;
  if (parent && isTicketLikeCategory(parent)) return true;
  const grandParent = parent?.parent || parent?.parentChannel || null;
  if (grandParent && isTicketLikeCategory(grandParent)) return true;
  return false;
}

function isUnderExemptCategory(channel) {
  if (!channel) return false;
  if (EXEMPT_CATEGORY_IDS.has(String(channel.id || ""))) return true;
  if (EXEMPT_CATEGORY_IDS.has(String(channel.parentId || ""))) return true;
  const parent = channel.parent;
  if (!parent) return false;
  if (EXEMPT_CATEGORY_IDS.has(String(parent.id || ""))) return true;
  if (EXEMPT_CATEGORY_IDS.has(String(parent.parentId || ""))) return true;
  return false;
}

function isWhitelistedByCategory(channel, setRef) {
  if (!channel) return false;
  const set = setRef instanceof Set ? setRef : new Set();
  if (!set.size) return false;
  if (set.has(String(channel.id || ""))) return true;
  if (set.has(String(channel.parentId || ""))) return true;
  const parent = channel.parent;
  if (!parent) return false;
  if (set.has(String(parent.id || ""))) return true;
  if (set.has(String(parent.parentId || ""))) return true;
  return false;
}

function isWhitelistedByChannel(channelId, parentChannelId, setRef) {
  const set = setRef instanceof Set ? setRef : new Set();
  if (!set.size) return false;
  return set.has(String(channelId || "")) || set.has(String(parentChannelId || ""));
}

function resolveProfileKey(message) {
  const channelId = String(message?.channelId || "");
  const parentId = String(message?.channel?.parentId || "");
  const mediaChannelId = String(IDs?.channels?.media || "");
  if (isTicketLikeChannel(message?.channel)) return "ticket";
  if (channelId && (channelId === mediaChannelId || parentId === mediaChannelId))
    return "media";
  if (
    EXEMPT_CHANNEL_IDS.has(channelId) ||
    EXEMPT_CHANNEL_IDS.has(parentId) ||
    isUnderExemptCategory(message?.channel)
  ) {
    return "staff";
  }
  return "default";
}

function getProfileConfig(message) {
  const key = resolveProfileKey(message);
  const defaults = DEFAULT_AUTOMOD_RUNTIME.profiles.default;
  const configured =
    automodRuntimeConfig?.profiles?.[key] ||
    automodRuntimeConfig?.profiles?.default ||
    {};
  return { key, ...defaults, ...configured };
}

/** Converte una percentuale (da config UI) in heat effettivo: percent = 7 → 7% di MAX_HEAT. */
function percentToHeat(percent) {
  return (Number(percent) / 100) * MAX_HEAT;
}

function applyProfileHeat(heat, profile) {
  const multiplier = Number(profile?.heatMultiplier || 1);
  const scaled = Number(heat || 0) * (Number.isFinite(multiplier) ? multiplier : 1);
  return Number(Math.max(0, scaled).toFixed(2));
}

function applyHeatFactor(key, heat) {
  const factors = automodRuntimeConfig?.heatFactors || {};
  const base = Number(heat || 0);
  const factor = Number(factors?.[key]);
  const safeFactor = Number.isFinite(factor) ? factor : 1;
  return Number(Math.max(0, base * safeFactor).toFixed(2));
}

function getHeatCaps() {
  const c = automodRuntimeConfig?.heatCaps || {};
  const d = DEFAULT_AUTOMOD_RUNTIME.heatCaps;
  return {
    maxPerMessage: Number.isFinite(Number(c.maxPerMessage))
      ? Number(c.maxPerMessage)
      : d.maxPerMessage,
    charactersMax: Number.isFinite(Number(c.charactersMax))
      ? Number(c.charactersMax)
      : d.charactersMax,
    textClusterMax: Number.isFinite(Number(c.textClusterMax))
      ? Number(c.textClusterMax)
      : d.textClusterMax,
    attachmentClusterMax: Number.isFinite(Number(c.attachmentClusterMax))
      ? Number(c.attachmentClusterMax)
      : d.attachmentClusterMax,
    mentionClusterMax: Number.isFinite(Number(c.mentionClusterMax))
      ? Number(c.mentionClusterMax)
      : d.mentionClusterMax,
  };
}

function normalizeViolationsForHeat(violations = [], options = {}) {
  const caps = getHeatCaps();
  const legitConversation = Boolean(options?.legitConversation);
  const mergedByKey = new Map();
  for (const entry of Array.isArray(violations) ? violations : []) {
    const key = String(entry?.key || "").trim();
    if (!key) continue;
    const prev = mergedByKey.get(key);
    const heat = Math.max(0, Number(entry?.heat || 0));
    if (!prev || heat > Number(prev.heat || 0)) {
      mergedByKey.set(key, { ...entry, heat });
    }
  }
  const items = Array.from(mergedByKey.values());
  const hasInstant = items.some((v) => INSTANT_LINK_KEYS.has(String(v?.key || "")));
  const textClusterKeys = new Set([
    "regular_message",
    "similar_message",
    "emoji_spam",
    "new_lines",
    "zalgo",
  ]);
  const attachmentKeys = new Set([
    "attachment_embed",
    "attachment_image",
    "attachment_file",
    "attachment_link",
    "attachment_sticker",
  ]);
  const mentionKeys = new Set([
    "mention_user",
    "mention_role",
    "mention_everyone",
    "mention_hour_cap",
    "mentions_lockdown",
  ]);

  let textClusterHeat = 0;
  let attachmentClusterHeat = 0;
  let mentionClusterHeat = 0;
  let totalHeat = 0;

  for (const v of items) {
    const key = String(v?.key || "");
    let heat = Math.max(0, Number(v?.heat || 0));
    if (hasInstant && (textClusterKeys.has(key) || key === "characters")) {
      heat = Math.min(heat, 8);
    }
    if (legitConversation && (key === "regular_message" || key === "similar_message")) {
      heat = heat * 0.65;
    }
    if (key === "characters") {
      heat = Math.min(heat, caps.charactersMax);
    } else if (textClusterKeys.has(key)) {
      const room = Math.max(0, caps.textClusterMax - textClusterHeat);
      heat = Math.min(heat, room);
      textClusterHeat += heat;
    } else if (attachmentKeys.has(key)) {
      const room = Math.max(0, caps.attachmentClusterMax - attachmentClusterHeat);
      heat = Math.min(heat, room);
      attachmentClusterHeat += heat;
    } else if (mentionKeys.has(key)) {
      const room = Math.max(0, caps.mentionClusterMax - mentionClusterHeat);
      heat = Math.min(heat, room);
      mentionClusterHeat += heat;
    }
    const globalRoom = Math.max(0, caps.maxPerMessage - totalHeat);
    heat = Math.min(heat, globalRoom);
    v.heat = Number(Math.max(0, heat).toFixed(2));
    totalHeat += v.heat;
  }
  return items.filter((v) => Number(v?.heat || 0) > 0);
}

function getThresholdsForProfile(profile) {
  const fromProfile = profile?.thresholds || {};
  return {
    warn: Number.isFinite(Number(fromProfile.warn))
      ? Number(fromProfile.warn)
      : WARN_THRESHOLD,
    delete: Number.isFinite(Number(fromProfile.delete))
      ? Number(fromProfile.delete)
      : DELETE_THRESHOLD,
    timeout: Number.isFinite(Number(fromProfile.timeout))
      ? Number(fromProfile.timeout)
      : TIMEOUT_THRESHOLD,
  };
}

function dayKeyFromMs(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getGuildMetricsBucket(guildId, dayKey) {
  const gid = String(guildId || "noguild");
  if (!automodMetrics.guilds || typeof automodMetrics.guilds !== "object") {
    automodMetrics.guilds = {};
  }
  if (!automodMetrics.guilds[gid]) automodMetrics.guilds[gid] = { days: {} };
  if (!automodMetrics.guilds[gid].days[dayKey]) {
    automodMetrics.guilds[gid].days[dayKey] = {
      actions: {},
      rules: {},
      channels: {},
      users: {},
      panicEnabled: 0,
    };
  }
  return automodMetrics.guilds[gid].days[dayKey];
}

function recordAutomodMetric(message, action, violations = []) {
  const guildId = String(message?.guildId || "");
  if (!guildId) return;
  const bucket = getGuildMetricsBucket(guildId, dayKeyFromMs());
  const actionKey = String(action || "unknown");
  bucket.actions[actionKey] = Number(bucket.actions[actionKey] || 0) + 1;
  const channelId = String(message?.channelId || "");
  if (channelId) {
    bucket.channels[channelId] = Number(bucket.channels[channelId] || 0) + 1;
  }
  const userId = String(message?.author?.id || "");
  if (userId) {
    bucket.users[userId] = Number(bucket.users[userId] || 0) + 1;
  }
  for (const v of Array.isArray(violations) ? violations : []) {
    const key = String(v?.key || "").trim();
    if (!key) continue;
    bucket.rules[key] = Number(bucket.rules[key] || 0) + 1;
  }
  scheduleMetricsSave();
}

function recordPanicEnabledMetric(guildId) {
  const gid = String(guildId || "");
  if (!gid) return;
  const bucket = getGuildMetricsBucket(gid, dayKeyFromMs());
  bucket.panicEnabled = Number(bucket.panicEnabled || 0) + 1;
  scheduleMetricsSave();
}

function isShortenerHost(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return false;
  return [...SHORTENER_HOSTS].some((token) => h === token || h.endsWith(`.${token}`));
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

/** Come Wick: durante il panic solo i “raider” (account che hanno contribuito al trigger) ricevono timeout istantaneo; i normali utenti seguono i filtri heat. */
function isRaiderInPanic(guildId, userId, at = nowMs()) {
  if (!PANIC_MODE.enabled || !guildId || !userId) return false;
  const state = getPanicState(guildId);
  if (state.activeUntil <= at) return false;
  return state.triggerAccounts?.has?.(String(userId)) === true;
}

function getAutoModPanicSnapshot(guildId, at = nowMs()) {
  const state = getPanicState(guildId);
  const activeUntil = Number(state?.activeUntil || 0);
  return {
    enabled: Boolean(PANIC_MODE.enabled),
    active: Boolean(PANIC_MODE.enabled && activeUntil > at),
    activeUntil,
    remainingMs: Math.max(0, activeUntil - at),
    trackedAccounts: Number(state?.triggerAccounts?.size || 0),
  };
}

function triggerAutoModPanicExternal(guildId, sourceUserId = "external", options = {}, at = nowMs()) {
  if (!PANIC_MODE.enabled) return { activated: false, active: false, count: 0 };
  if (!guildId) return { activated: false, active: false, count: 0 };
  const signalKey = `${String(guildId)}:${String(sourceUserId || "external")}`;
  const lastTs = Number(EXTERNAL_PANIC_SIGNAL_COOLDOWN.get(signalKey) || 0);
  if (at - lastTs < EXTERNAL_PANIC_SIGNAL_COOLDOWN_MS) {
    return {
      activated: false,
      active: isPanicModeActive(guildId, at),
      count: Number(getPanicState(guildId)?.triggerAccounts?.size || 0),
    };
  }
  EXTERNAL_PANIC_SIGNAL_COOLDOWN.set(signalKey, at);
  return registerPanicTrigger(String(guildId), String(sourceUserId || "external"), options, at);
}

function registerPanicTrigger(guildId, userId, options = {}, at = nowMs()) {
  if (!PANIC_MODE.enabled) return { activated: false, active: false, count: 0 };
  const activityBoost = Math.max(
    0,
    Math.min(1, Math.floor(Number(options.activityBoost || 0))),
  );
  const dbBoost = Math.max(
    0,
    Math.min(1, Math.floor(Number(options.dbBoost || 0))),
  );
  const raidBoost = Math.max(
    0,
    Math.min(1, Math.floor(Number(options.raidBoost || 0))),
  );
  const state = getPanicState(guildId);
  prunePanicAccounts(state, at);
  state.triggerAccounts.set(String(userId), {
    ts: at,
    activityBoost,
    dbBoost,
    raidBoost,
  });
  // Panic trigger must be based on distinct accounts, not weighted boosts.
  // Boost fields are kept for diagnostics/future use but do not alter threshold count.
  const count = Number(state.triggerAccounts.size || 0);
  const alreadyActive = state.activeUntil > at;
  if (count >= PANIC_MODE.triggerCount) {
    state.activeUntil = Math.max(state.activeUntil, at + PANIC_MODE.durationMs);
  }
  const nowActive = state.activeUntil > at;
  return { activated: !alreadyActive && nowActive, active: nowActive, count };
}

function registerGuildInstantSignal(message, at = nowMs()) {
  const guildId = String(message?.guildId || "");
  if (!guildId) return { uniqueUsers: 0, youngUsers: 0 };
  const existing = GUILD_INSTANT_EVENTS.get(guildId) || [];
  const minTs = at - Number(PANIC_MODE.raidWindowMs || 120_000);
  const events = existing.filter((item) => Number(item?.ts || 0) >= minTs);
  const accountAgeMs = at - Number(new Date(message?.author?.createdAt || 0).getTime() || 0);
  const isYoung = accountAgeMs > 0 && accountAgeMs < 7 * 24 * 60 * 60_000;
  events.push({
    ts: at,
    userId: String(message?.author?.id || ""),
    young: isYoung,
  });
  GUILD_INSTANT_EVENTS.set(guildId, events);
  const uniqueUsers = new Set(events.map((e) => String(e.userId || ""))).size;
  const youngUsers = new Set(
    events.filter((e) => e.young).map((e) => String(e.userId || "")),
  ).size;
  return { uniqueUsers, youngUsers };
}

function getAutoTimeoutProfileKey(message) {
  return `${String(message?.guildId || "")}:${String(message?.author?.id || "")}`;
}

function computeNextAutoTimeoutDuration(message, at = nowMs()) {
  const key = getAutoTimeoutProfileKey(message);
  if (!key || key.startsWith(":")) {
    return { durationMs: AUTO_TIMEOUT_REGULAR_MS, strike: 1, capReached: false };
  }
  const existing = AUTO_TIMEOUT_PROFILE.get(key) || {
    strikes: 0,
    currentDurationMs: AUTO_TIMEOUT_REGULAR_MS,
    lastAt: 0,
    capReached: false,
  };
  if (at - Number(existing.lastAt || 0) > AUTO_TIMEOUT_PROFILE_RESET_MS) {
    existing.strikes = 0;
    existing.currentDurationMs = AUTO_TIMEOUT_REGULAR_MS;
    existing.capReached = false;
  }

  const nextStrike = Number(existing.strikes || 0) + 1;
  let durationMs = AUTO_TIMEOUT_REGULAR_MS;
  if (nextStrike < AUTO_TIMEOUT_CAP_STRIKE) {
    durationMs = AUTO_TIMEOUT_REGULAR_MS;
  } else if (nextStrike === AUTO_TIMEOUT_CAP_STRIKE) {
    durationMs = AUTO_TIMEOUT_CAP_MS;
    existing.capReached = true;
  } else if (AUTO_TIMEOUT_MULTIPLIER_ENABLED) {
    const base = Math.max(
      AUTO_TIMEOUT_CAP_MS,
      Number(existing.currentDurationMs || AUTO_TIMEOUT_CAP_MS),
    );
    durationMs = Math.round(base * (AUTO_TIMEOUT_MULTIPLIER_PERCENT / 100));
    existing.capReached = true;
  } else {
    durationMs = AUTO_TIMEOUT_CAP_MS;
    existing.capReached = true;
  }

  durationMs = Math.max(60_000, Math.min(DISCORD_TIMEOUT_MAX_MS, durationMs));
  existing.strikes = nextStrike;
  existing.currentDurationMs = durationMs;
  existing.lastAt = at;
  AUTO_TIMEOUT_PROFILE.set(key, existing);
  return { durationMs, strike: nextStrike, capReached: Boolean(existing.capReached) };
}

function getCachedBadUser(userId, at = nowMs()) {
  const cached = BAD_USER_CACHE.get(String(userId));
  if (!cached) return undefined;
  if (cached.expiresAt < at) {
    BAD_USER_CACHE.delete(String(userId));
    return undefined;
  }
  return cached.value;
}

function setCachedBadUser(userId, value, ttlMs = 60_000) {
  BAD_USER_CACHE.set(String(userId), {
    value,
    expiresAt: nowMs() + ttlMs,
  });
}

function isBadUserProfileStale(profile, at = nowMs()) {
  const lastActionAt = profile?.lastActionAt
    ? new Date(profile.lastActionAt).getTime()
    : 0;
  if (!Number.isFinite(lastActionAt) || lastActionAt <= 0) return false;
  return at - lastActionAt > AUTO_TIMEOUT_PROFILE_RESET_MS;
}

function isBadUserSuspicious(profile, at = nowMs()) {
  if (!profile) return false;
  if (isBadUserProfileStale(profile, at)) return false;
  const activeStrikes = Math.max(0, Number(profile?.activeStrikes || 0));
  return activeStrikes >= 3;
}

async function getBadUserProfile(userId, guildId = "") {
  const cached = getCachedBadUser(userId);
  if (cached !== undefined) {
    const joinGateSuspicious = guildId
      ? await isJoinGateSuspiciousAccount(guildId, userId)
      : false;
    if (!cached) {
      return joinGateSuspicious
        ? {
            suspicious: true,
            warnPoints: 0,
            activeStrikes: 0,
            activeStrikeReasons: [],
            timeoutActions: 0,
            totalTriggers: 0,
          }
        : null;
    }
    return {
      ...cached,
      suspicious: Boolean(joinGateSuspicious),
    };
  }
  if (!isDbReady()) {
    const joinGateSuspicious = guildId
      ? await isJoinGateSuspiciousAccount(guildId, userId)
      : false;
    return joinGateSuspicious
      ? {
          suspicious: true,
          warnPoints: 0,
          activeStrikes: 0,
          activeStrikeReasons: [],
          timeoutActions: 0,
          totalTriggers: 0,
        }
      : null;
  }
  try {
    const row = await AutoModBadUser.findOne(
      { userId: String(userId) },
      {
        _id: 0,
        userId: 1,
        totalTriggers: 1,
        warnPoints: 1,
        activeStrikes: 1,
        timeoutActions: 1,
        activeStrikeReasons: 1,
        lastTriggerAt: 1,
        lastActionAt: 1,
        lastAction: 1,
      },
    ).lean();
    if (!row) {
      setCachedBadUser(userId, null, 15_000);
      const joinGateSuspicious = guildId
        ? await isJoinGateSuspiciousAccount(guildId, userId)
        : false;
      return joinGateSuspicious
        ? {
            suspicious: true,
            warnPoints: 0,
            activeStrikes: 0,
            activeStrikeReasons: [],
            timeoutActions: 0,
            totalTriggers: 0,
          }
        : null;
    }

    const at = nowMs();
    const stale = isBadUserProfileStale(row, at);
    const normalized = {
      ...row,
      warnPoints: stale ? 0 : Math.max(0, Number(row.warnPoints || 0)),
      activeStrikes: stale ? 0 : Math.max(0, Number(row.activeStrikes || 0)),
      activeStrikeReasons: stale ? [] : (Array.isArray(row.activeStrikeReasons) ? row.activeStrikeReasons : []),
    };

    if (stale && (Number(row.warnPoints || 0) > 0 || Number(row.activeStrikes || 0) > 0)) {
      AutoModBadUser.updateOne(
        { userId: String(userId) },
        {
          $set: {
            warnPoints: 0,
            activeStrikes: 0,
            activeStrikeReasons: [],
          },
        },
      ).catch(() => {});
    }

    setCachedBadUser(userId, normalized, 60_000);
    const joinGateSuspicious = guildId
      ? await isJoinGateSuspiciousAccount(guildId, userId)
      : false;
    return {
      ...normalized,
      suspicious: Boolean(joinGateSuspicious),
    };
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
      },
      { upsert: true },
    );
    BAD_USER_CACHE.delete(userId);
  } catch {
    // Do not break automod flow on DB issues.
  }
}

async function markBadUserAction(message, action, violations = []) {
  if (!isDbReady()) return;
  const userId = String(message?.author?.id || "");
  if (!userId) return;
  const normalizedAction = String(action || "").trim().toLowerCase();
  const inc = { totalTriggers: 1, activeStrikes: 0, warnPoints: 0 };
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
    BAD_USER_CACHE.delete(userId);
  } catch {
    // Do not break automod flow on DB issues.
  }
}

async function registerAutoModTimeoutStrike(message) {
  if (!isDbReady()) return { ok: false, timeoutActions: 0, escalate1h: false };
  const userId = String(message?.author?.id || "");
  if (!userId) return { ok: false, timeoutActions: 0, escalate1h: false };
  try {
    const updated = await AutoModBadUser.findOneAndUpdate(
      { userId },
      {
        $inc: { timeoutActions: 1 },
        $set: {
          lastActionAt: new Date(),
          lastAction: "timeout",
          lastGuildId: String(message?.guildId || ""),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        projection: { _id: 0, timeoutActions: 1 },
      },
    ).lean();
    BAD_USER_CACHE.delete(userId);
    const timeoutActions = Math.max(0, Number(updated?.timeoutActions || 0));
    return {
      ok: true,
      timeoutActions,
      escalate1h: timeoutActions > 0 && timeoutActions % 5 === 0,
    };
  } catch {
    return { ok: false, timeoutActions: 0, escalate1h: false };
  }
}

async function shouldEscalateNextAutoTimeout(message) {
  if (!isDbReady()) return false;
  const userId = String(message?.author?.id || "");
  if (!userId) return false;
  try {
    const row = await AutoModBadUser.findOne(
      { userId },
      { _id: 0, timeoutActions: 1 },
    ).lean();
    const current = Math.max(0, Number(row?.timeoutActions || 0));
    const next = current + 1;
    return next > 0 && next % 5 === 0;
  } catch {
    return false;
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

function cleanupRuntimeMaps(at = nowMs()) {
  const staleActionCutoff = at - ACTION_COOLDOWN_MS * 4;
  for (const [key, ts] of ACTION_COOLDOWN.entries()) {
    if (Number(ts || 0) < staleActionCutoff) ACTION_COOLDOWN.delete(key);
  }

  const staleNoticeCutoff = at - ACTION_CHANNEL_LOG_COOLDOWN_MS * 4;
  for (const [key, ts] of ACTION_CHANNEL_LOG_COOLDOWN.entries()) {
    if (Number(ts || 0) < staleNoticeCutoff) {
      ACTION_CHANNEL_LOG_COOLDOWN.delete(key);
    }
  }

  for (const [key, state] of USER_STATE.entries()) {
    if (!state || typeof state !== "object") {
      USER_STATE.delete(key);
      continue;
    }
    const idleFor = at - Number(state.lastAt || 0);
    const stale =
      idleFor > 2 * 60 * 60_000 &&
      Number(state.heat || 0) <= 0 &&
      (!Array.isArray(state.msgTimes) || state.msgTimes.length === 0) &&
      (!Array.isArray(state.normHistory) || state.normHistory.length === 0) &&
      (!Array.isArray(state.mentionTimes) || state.mentionTimes.length === 0) &&
      (!Array.isArray(state.mentionHourTimes) || state.mentionHourTimes.length === 0) &&
      (!Array.isArray(state.automodHits) || state.automodHits.length === 0);
    if (stale) USER_STATE.delete(key);
  }

  for (const [guildId, events] of GUILD_INSTANT_EVENTS.entries()) {
    const minTs = at - Number(PANIC_MODE.raidWindowMs || 120_000);
    const next = (Array.isArray(events) ? events : []).filter(
      (item) => Number(item?.ts || 0) >= minTs,
    );
    if (!next.length) GUILD_INSTANT_EVENTS.delete(guildId);
    else GUILD_INSTANT_EVENTS.set(guildId, next);
  }

  for (const [guildId, state] of GUILD_PANIC_STATE.entries()) {
    if (!state || typeof state !== "object") {
      GUILD_PANIC_STATE.delete(guildId);
      continue;
    }
    prunePanicAccounts(state, at);
    const active = Number(state.activeUntil || 0) > at;
    if (!active && (!state.triggerAccounts || state.triggerAccounts.size === 0)) {
      GUILD_PANIC_STATE.delete(guildId);
    }
  }

  for (const [url, payload] of URL_EXPANSION_CACHE.entries()) {
    if (Number(payload?.expiresAt || 0) <= at) URL_EXPANSION_CACHE.delete(url);
  }

  for (const [key, ts] of EXTERNAL_PANIC_SIGNAL_COOLDOWN.entries()) {
    if (at - Number(ts || 0) > EXTERNAL_PANIC_SIGNAL_COOLDOWN_MS * 2) {
      EXTERNAL_PANIC_SIGNAL_COOLDOWN.delete(key);
    }
  }

  for (const [key, payload] of AUTO_TIMEOUT_PROFILE.entries()) {
    if (at - Number(payload?.lastAt || 0) > AUTO_TIMEOUT_PROFILE_RESET_MS * 2) {
      AUTO_TIMEOUT_PROFILE.delete(key);
    }
  }
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
  if (!Array.isArray(list) || !list.length) return;
  const min = at - windowMs;
  let idx = 0;
  while (idx < list.length && Number(list[idx] || 0) < min) idx += 1;
  if (idx > 0) list.splice(0, idx);
}

function trimNormHistory(history, windowMs, at = nowMs()) {
  if (!Array.isArray(history) || !history.length) return;
  const min = at - windowMs;
  let idx = 0;
  while (idx < history.length && Number(history[idx]?.t || 0) < min) idx += 1;
  if (idx > 0) history.splice(0, idx);
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

function countDistinctWords(content) {
  const text = String(content || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!text) return 0;
  const words = text
    .split(/[^\p{L}\p{N}]+/gu)
    .map((x) => String(x || "").trim())
    .filter((x) => x.length >= 2);
  return new Set(words).size;
}

function looksLikeLegitConversation(content) {
  const text = String(content || "").trim();
  if (!text) return false;
  const distinctWords = countDistinctWords(text);
  const hasSentencePunctuation = /[.!?;,]/.test(text);
  const hasSpaces = /\s/.test(text);
  const hasTooManyLinks = (text.match(/https?:\/\/\S+/gi) || []).length >= 2;
  return (
    text.length >= 120 &&
    distinctWords >= 10 &&
    hasSpaces &&
    hasSentencePunctuation &&
    !hasTooManyLinks
  );
}

function stripQuotedAndCodeText(content) {
  const text = String(content || "");
  if (!text) return "";
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .split("\n")
    .filter((line) => !String(line || "").trim().startsWith(">"))
    .join("\n")
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

function toAbsoluteUrl(location, base) {
  try {
    return new URL(String(location || ""), base).toString();
  } catch {
    return null;
  }
}

async function expandShortUrl(url, config) {
  const key = String(url || "").trim();
  if (!key) return null;
  const cached = URL_EXPANSION_CACHE.get(key);
  if (cached && cached.expiresAt > nowMs()) return cached.value;

  const timeoutMs = Math.max(400, Number(config?.timeoutMs || 2200));
  const maxHops = Math.max(1, Number(config?.maxHops || 3));
  let current = key;
  let finalHost = "";

  for (let i = 0; i < maxHops; i += 1) {
    try {
      const response = await axios.get(current, {
        maxRedirects: 0,
        timeout: timeoutMs,
        validateStatus: (s) => s >= 200 && s < 400,
        headers: {
          "User-Agent": "Mozilla/5.0 (AutoMod URL Guard)",
        },
      });
      const nextLocation =
        response?.headers?.location || response?.headers?.Location || null;
      const parsed = new URL(current);
      finalHost = String(parsed.hostname || "").toLowerCase();
      if (!nextLocation) break;
      const next = toAbsoluteUrl(nextLocation, current);
      if (!next) break;
      current = next;
    } catch {
      break;
    }
  }

  URL_EXPANSION_CACHE.set(key, {
    value: finalHost || null,
    expiresAt: nowMs() + 10 * 60_000,
  });
  return finalHost || null;
}

function isImageAttachment(att) {
  if (!att) return false;
  const contentType = String(att.contentType || "").toLowerCase();
  if (contentType.startsWith("image/")) return true;
  const name = String(att.name || att.filename || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|tiff?|avif|heic|heif|svg)$/.test(name);
}

async function isNsfwUrl(content, preExtractedUrls = null) {
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
  const shortenerConfig = automodRuntimeConfig?.shorteners || {};
  const urls = Array.isArray(preExtractedUrls)
    ? preExtractedUrls
    : extractUrls(content);
  for (const url of urls) {
    let host = String(url.hostname || "").toLowerCase();
    const path = String(url.pathname || "").toLowerCase();
    if (!host) continue;
    if (isShortenerHost(host)) {
      if (!TEXT_RULES.nsfwLinks.crawlShorteners || !shortenerConfig.crawl) {
        continue;
      }
      const expandedHost = await expandShortUrl(url.toString(), shortenerConfig);
      if (expandedHost) host = expandedHost;
    }
    const haystack = `${host}${path}`;
    if (nsfwTokens.some((t) => haystack.includes(t))) return true;
  }
  return false;
}

async function hasBlacklistedDomain(content, preExtractedUrls = null) {
  if (!TEXT_RULES.linkBlacklist.enabled) return false;
  const urls = Array.isArray(preExtractedUrls)
    ? preExtractedUrls
    : extractUrls(content);
  if (!urls.length) return false;
  const blockedDomains = (TEXT_RULES.linkBlacklist.domains || [])
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);
  if (!blockedDomains.length) return false;
  const shortenerConfig = automodRuntimeConfig?.shorteners || {};
  for (const url of urls) {
    let host = String(url.hostname || "").toLowerCase();
    if (isShortenerHost(host) && shortenerConfig.crawl) {
      const expandedHost = await expandShortUrl(url.toString(), shortenerConfig);
      if (expandedHost) host = expandedHost;
    }
    if (blockedDomains.some((d) => host === d || host.endsWith(`.${d}`))) {
      return true;
    }
  }
  return false;
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
  if (!message.guild) return true;
  if (!message.member) return false;
  if (
    CORE_EXEMPT_USER_IDS.has(String(message.author?.id || "")) ||
    String(message.guild.ownerId || "") === String(message.author?.id || "") ||
    isSecurityProfileImmune(
      String(message.guild?.id || ""),
      String(message.author?.id || ""),
    ) ||
    hasAdminsProfileCapability(message.member, "fullImmunity") ||
    hasAdminsProfileCapability(message.member, "automodImmunity") ||
    hasAdminsProfileCapability(message.member, "profanityWhitelist") ||
    hasModeratorsProfileCapability(message.member, "automodImmunity") ||
    hasModeratorsProfileCapability(message.member, "profanityWhitelist")
  ) {
    return true;
  }
  if (EXEMPT_CHANNEL_IDS.has(String(message.channelId))) return true;
  if (isUnderExemptCategory(message.channel)) return true;
  const profile = getProfileConfig(message);
  return Boolean(profile?.exempt);
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

async function isVerifiedBotUserId(client, userId) {
  const id = String(userId || "").trim();
  if (!id) return false;
  if (VERIFIED_BOT_IDS.has(id)) return true;
  if (VERIFIED_BOT_USER_CACHE.has(id)) {
    return VERIFIED_BOT_USER_CACHE.get(id);
  }
  let verified = false;
  try {
    const user =
      client?.users?.cache?.get?.(id) ||
      (await client?.users?.fetch?.(id).catch(() => null));
    if (user?.bot) {
      const flags =
        user.flags ||
        (typeof user.fetchFlags === "function"
          ? await user.fetchFlags().catch(() => null)
          : null);
      verified = Boolean(flags?.has?.(UserFlagsBitField.Flags.VerifiedBot));
    }
  } catch {
    verified = false;
  }
  VERIFIED_BOT_USER_CACHE.set(id, verified);
  return verified;
}

function isAutoModRoleExemptMember(guild, member) {
  if (!guild || !member) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  if (isSecurityProfileImmune(String(guild?.id || ""), String(member.id || ""))) {
    return true;
  }
  if (hasAdminsProfileCapability(member, "fullImmunity")) return true;
  if (hasAdminsProfileCapability(member, "automodImmunity")) return true;
  if (hasModeratorsProfileCapability(member, "automodImmunity")) return true;
  if (CORE_EXEMPT_USER_IDS.has(String(member.id || ""))) return true;
  return false;
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
    const profile = await getBadUserProfile(userId, guild.id);
    suspicious = Boolean(profile?.suspicious);
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

async function detectViolations(message, state, profile) {
  const at = nowMs();
  const content = String(message.content || "");
  const moderationContent = stripQuotedAndCodeText(content);
  const normalized = normalizeContent(content);
  const extractedUrls = extractUrls(moderationContent);
  const violations = [];
  const channelId = String(message.channelId || "");
  const parentChannelId = String(message.channel?.parentId || "");
  const statics = getSecurityStaticsSnapshot(String(message?.guild?.id || ""));
  const dynamicPartneringChannels = Array.isArray(statics?.partneringChannelIds)
    ? statics.partneringChannelIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const inviteWhitelistSet = new Set([
    ...INVITE_WHITELIST_CHANNEL_IDS,
    ...dynamicPartneringChannels,
  ]);
  const mentionWhitelistSet = new Set([
    ...MENTION_WHITELIST_CHANNEL_IDS,
    ...dynamicPartneringChannels,
  ]);
  const everyoneWhitelistSet = new Set([
    ...EVERYONE_WHITELIST_CHANNEL_IDS,
    ...dynamicPartneringChannels,
  ]);
  const spamWhitelisted =
    isWhitelistedByCategory(message.channel, SPAM_WHITELIST_CATEGORY_IDS);
  const inviteWhitelisted = isWhitelistedByChannel(
    channelId,
    parentChannelId,
    inviteWhitelistSet,
  );
  const mentionWhitelisted = isWhitelistedByChannel(
    channelId,
    parentChannelId,
    mentionWhitelistSet,
  );
  const everyoneWhitelisted = isWhitelistedByChannel(
    channelId,
    parentChannelId,
    everyoneWhitelistSet,
  );
  const mentionsEnabled = profile?.mentionsEnabled !== false;
  const attachmentsEnabled = profile?.attachmentsEnabled !== false;
  const inviteLinksEnabled = profile?.inviteLinksEnabled !== false;
  const autoLockdownEnabled = automodRuntimeConfig?.autoLockdown?.enabled !== false;
  const hasMeaningfulTextPayload = String(moderationContent || "").trim().length >= 8;
  const profileHeat = (value, factorKey = "regularMessage") =>
    applyProfileHeat(applyHeatFactor(factorKey, value), profile);
  const legitConversation = looksLikeLegitConversation(moderationContent || content);
  let suspiciousMessageAuthor = false;
  try {
    const badProfile = await getBadUserProfile(message.author?.id, message.guildId);
    suspiciousMessageAuthor = Boolean(badProfile?.suspicious);
  } catch {
    suspiciousMessageAuthor = false;
  }

  if (
    !spamWhitelisted &&
    TEXT_RULES.suspiciousAccount.enabled &&
    suspiciousMessageAuthor &&
    hasMeaningfulTextPayload
  ) {
    violations.push({
      key: "suspicious_account",
      heat: profileHeat(
        percentToHeat(TEXT_RULES.suspiciousAccount.heat),
        "suspiciousAccount",
      ),
      info: "suspicious member profile",
    });
  }

  if (
    !spamWhitelisted &&
    AUTOMOD_ANTISPAM_ENABLED &&
    TEXT_RULES.regularMessage.enabled
  ) {
    state.msgTimes.push(at);
    trimWindow(state.msgTimes, 8_000, at);
    if (state.msgTimes.length >= 6) {
      violations.push({
        key: "regular_message",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.regularMessage.heat),
          "regularMessage",
        ),
        info: `${state.msgTimes.length}/8s`,
      });
    }
  }

  if (
    !spamWhitelisted &&
    AUTOMOD_ANTISPAM_ENABLED &&
    TEXT_RULES.similarMessage.enabled &&
    normalized.length >= 8
  ) {
    state.normHistory.push({ t: at, c: normalized });
    trimNormHistory(state.normHistory, 18_000, at);
    const ratio = TEXT_RULES.similarMessage.ratio;
    const similarThreshold = legitConversation ? 2 : 1;
    let similarCount = 0;
    for (const x of state.normHistory) {
      if (!x?.c || x.t === at) continue;
      if (similarityRatio(x.c, normalized) >= ratio) {
        similarCount += 1;
        if (similarCount >= similarThreshold) break;
      }
    }
    if (similarCount >= similarThreshold) {
      violations.push({
        key: "similar_message",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.similarMessage.heat),
          "similarMessage",
        ),
        info: `ratio>=${ratio.toFixed(2)} count:${similarCount}`,
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
  const effectiveMentionCount =
    (mentionWhitelisted ? 0 : userMentionCount + roleMentionCount) +
    (everyoneWhitelisted ? 0 : everyoneMentionCount);
  if (MENTION_RULES.enabled && mentionsEnabled) {
    if (effectiveMentionCount > 0) {
      const shortCap = Math.max(MENTION_LOCKDOWN_TRIGGER * 2, 100);
      const hourCap = Math.max(MENTION_RULES.hourCap * 2, 100);
      const roomShort = Math.max(0, shortCap - state.mentionTimes.length);
      const roomHour = Math.max(0, hourCap - state.mentionHourTimes.length);
      const toPush = Math.min(effectiveMentionCount, roomShort, roomHour);
      for (let i = 0; i < toPush; i += 1) {
        state.mentionTimes.push(at);
        state.mentionHourTimes.push(at);
      }
      trimWindow(state.mentionTimes, MENTION_LOCKDOWN_WINDOW_MS, at);
      trimWindow(state.mentionHourTimes, 60 * 60_000, at);
    }

    if (
      !mentionWhitelisted &&
      MENTION_RULES.userMentions.enabled &&
      userMentionCount > 0
    ) {
      violations.push({
        key: "mention_user",
        heat: profileHeat(
          userMentionCount * percentToHeat(MENTION_RULES.userMentions.heat),
          "mentions",
        ),
        info: `${userMentionCount} @user`,
      });
    }

    if (
      !mentionWhitelisted &&
      MENTION_RULES.roleMentions.enabled &&
      roleMentionCount > 0
    ) {
      violations.push({
        key: "mention_role",
        heat: profileHeat(
          roleMentionCount * percentToHeat(MENTION_RULES.roleMentions.heat),
          "mentions",
        ),
        info: `${roleMentionCount} @role`,
      });
    }

    if (
      !everyoneWhitelisted &&
      MENTION_RULES.everyoneMentions.enabled &&
      everyoneMentionCount > 0
    ) {
      violations.push({
        key: "mention_everyone",
        heat: profileHeat(
          everyoneMentionCount *
            percentToHeat(MENTION_RULES.everyoneMentions.heat),
          "mentions",
        ),
        info: "@everyone/@here",
      });
    }

    if (autoLockdownEnabled && state.mentionHourTimes.length >= MENTION_RULES.hourCap) {
      violations.push({
        key: "mention_hour_cap",
        heat: profileHeat(percentToHeat(100), "mentions"),
        info: `${state.mentionHourTimes.length}/${MENTION_RULES.hourCap} pings/1h`,
      });
    }

    if (autoLockdownEnabled && state.mentionTimes.length >= MENTION_LOCKDOWN_TRIGGER) {
      violations.push({
        key: "mentions_lockdown",
        heat: profileHeat(percentToHeat(100), "mentions"),
        info: `${state.mentionTimes.length}/${Math.floor(MENTION_LOCKDOWN_WINDOW_MS / 1000)}s`,
      });
    }
  }

  const inviteCode = detectInvite(moderationContent);
  if (inviteCode && !inviteWhitelisted) {
    const allowedCodes = getAllowedInviteCodes(message);
    if (
      inviteLinksEnabled &&
      TEXT_RULES.inviteLinks.enabled &&
      !allowedCodes.has(inviteCode)
    ) {
      violations.push({
        key: "invite",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.inviteLinks.heat),
          "inviteLinks",
        ),
        info: `discord.gg/${inviteCode}`,
      });
    }
  }

  if (TEXT_RULES.maliciousLinks.enabled && detectScam(moderationContent)) {
    violations.push({
      key: "scam_pattern",
      heat: profileHeat(
        percentToHeat(TEXT_RULES.maliciousLinks.heat),
        "maliciousLinks",
      ),
      info: "pattern scam/malicious link",
    });
  }

  if (await isNsfwUrl(moderationContent, extractedUrls)) {
    violations.push({
      key: "nsfw_link",
      heat: profileHeat(
        percentToHeat(TEXT_RULES.nsfwLinks.heat),
        "nsfwLinks",
      ),
      info: "nsfw domain/url",
    });
  }

  const wordBlacklistMatch = findBlacklistedWordMatch(moderationContent);
  if (wordBlacklistMatch) {
    violations.push({
      key: "word_blacklist",
      heat: profileHeat(
        percentToHeat(TEXT_RULES.wordBlacklist.heat),
        "wordBlacklist",
      ),
      info:
        wordBlacklistMatch.term && wordBlacklistMatch.source
          ? `racist list (${wordBlacklistMatch.source}: ${wordBlacklistMatch.term})`
          : "racist list",
    });
  }

  if (await hasBlacklistedDomain(moderationContent, extractedUrls)) {
    violations.push({
      key: "link_blacklist",
      heat: profileHeat(
        percentToHeat(TEXT_RULES.linkBlacklist.heat),
        "linkBlacklist",
      ),
      info: "blacklisted domain",
    });
  }

  if (!spamWhitelisted && TEXT_RULES.emojis.enabled) {
    const emojiCount = countEmojiApprox(content);
    if (emojiCount >= TEXT_RULES.emojis.minCount) {
      violations.push({
        key: "emoji_spam",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.emojis.heat),
          "emojis",
        ),
        info: `${emojiCount} emoji`,
      });
    }
  }

  if (!spamWhitelisted && TEXT_RULES.newLines.enabled) {
    const lineBreaks = (content.match(/\n/g) || []).length;
    if (lineBreaks >= TEXT_RULES.newLines.minCount) {
      violations.push({
        key: "new_lines",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.newLines.heat),
          "newLines",
        ),
        info: `${lineBreaks} new lines`,
      });
    }
  }

  if (!spamWhitelisted && TEXT_RULES.zalgo.enabled) {
    const zalgoCount = countZalgo(content);
    if (zalgoCount >= TEXT_RULES.zalgo.minCount) {
      violations.push({
        key: "zalgo",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.zalgo.heat),
          "zalgo",
        ),
        info: `${zalgoCount} combining chars`,
      });
    }
  }

  if (!spamWhitelisted && TEXT_RULES.characters.enabled) {
    const { lower, upper, total } = countCaseCharacters(content);
    if (total >= TEXT_RULES.characters.minChars) {
      const upperRatio = total > 0 ? upper / total : 0;
      const repeatedCharBurst = /(.)\1{10,}/.test(content);
      const noisyShape = upperRatio >= 0.45 || repeatedCharBurst;
      if (legitConversation && !noisyShape) {
        // Skip character-based punishment for long, normal conversation messages.
      } else {
      // lowercaseHeat/uppercaseHeat sono percentuali (es. 0.08 = 0.08%): ogni carattere
      // aggiunge quella % del max heat, così l’UI (“Heat Added 0.08%”) è rispettata.
      const lowerHeat =
        lower * (Number(TEXT_RULES.characters.lowercaseHeat) / 100) * MAX_HEAT;
      const upperHeat =
        upper * (Number(TEXT_RULES.characters.uppercaseHeat) / 100) * MAX_HEAT;
      const heat = Number((lowerHeat + upperHeat).toFixed(2));
      if (heat > 0) {
        violations.push({
          key: "characters",
          heat: profileHeat(heat, "characters"),
          info: `lower:${lower} upper:${upper} ratio:${upperRatio.toFixed(2)}`,
        });
      }
      }
    }
  }

  if (!spamWhitelisted && ATTACHMENT_RULES.enabled && attachmentsEnabled) {
    const embedCount = Array.isArray(message.embeds) ? message.embeds.length : 0;
    const stickerCount = message.stickers?.size || 0;
    const attachmentList = [...(message.attachments?.values?.() || [])];
    const imageCount = attachmentList.filter((att) => isImageAttachment(att)).length;
    const fileCount = Math.max(0, attachmentList.length - imageCount);
    const linkCount = extractedUrls.length;
    const isLightMediaOnlyMessage =
      hasMeaningfulTextPayload === false &&
      embedCount === 0 &&
      stickerCount === 0 &&
      fileCount === 0 &&
      linkCount === 0 &&
      imageCount > 0 &&
      imageCount <= 2;
    const imageHeatMultiplier = isLightMediaOnlyMessage ? 0.6 : 1;

    if (ATTACHMENT_RULES.embeds.enabled && embedCount > 0) {
      violations.push({
        key: "attachment_embed",
        heat: profileHeat(
          embedCount * percentToHeat(ATTACHMENT_RULES.embeds.heat),
          "attachments",
        ),
        info: `${embedCount} embed`,
      });
    }
    if (ATTACHMENT_RULES.images.enabled && imageCount > 0) {
      violations.push({
        key: "attachment_image",
        heat: profileHeat(
          imageCount *
            percentToHeat(ATTACHMENT_RULES.images.heat) *
            imageHeatMultiplier,
          "attachments",
        ),
        info: `${imageCount} image`,
      });
    }
    if (ATTACHMENT_RULES.files.enabled && fileCount > 0) {
      violations.push({
        key: "attachment_file",
        heat: profileHeat(
          fileCount * percentToHeat(ATTACHMENT_RULES.files.heat),
          "attachments",
        ),
        info: `${fileCount} file`,
      });
    }
    if (ATTACHMENT_RULES.links.enabled && linkCount > 0) {
      violations.push({
        key: "attachment_link",
        heat: profileHeat(
          linkCount * percentToHeat(ATTACHMENT_RULES.links.heat),
          "attachments",
        ),
        info: `${linkCount} link`,
      });
    }
    if (ATTACHMENT_RULES.stickers.enabled && stickerCount > 0) {
      violations.push({
        key: "attachment_sticker",
        heat: profileHeat(
          stickerCount * percentToHeat(ATTACHMENT_RULES.stickers.heat),
          "attachments",
        ),
        info: `${stickerCount} sticker`,
      });
    }
  }

  return violations;
}

function getCooldownKey(message) {
  return `${message.guildId}:${message.author.id}`;
}

function isLikelyCommandMessage(message) {
  const content = String(message?.content || "").trim();
  if (!content) return false;
  const dynamicPrefixes = [];
  const cfgPrefix = message?.client?.config?.prefix;
  if (Array.isArray(cfgPrefix)) {
    for (const entry of cfgPrefix) {
      const value = String(entry || "").trim();
      if (value) dynamicPrefixes.push(value);
    }
  } else if (typeof cfgPrefix === "string" && cfgPrefix.trim()) {
    dynamicPrefixes.push(cfgPrefix.trim());
  }
  if (!dynamicPrefixes.length) {
    dynamicPrefixes.push("+");
  }
  return dynamicPrefixes.some((prefix) => {
    if (!content.startsWith(prefix)) return false;
    return content.length > prefix.length;
  });
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
    suspicious_account: "Suspicious account message",
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

function buildAutoModDecisionExplain(action, heatValue, violations = [], context = {}) {
  const normalizedAction = String(action || "").toLowerCase();
  const heat = Number(heatValue || 0);
  const topRules = (Array.isArray(violations) ? violations : [])
    .map((v) => ({
      key: String(v?.key || "unknown"),
      heat: Number(v?.heat || 0),
    }))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 3)
    .map((v) =>
      Number.isFinite(v.heat) && v.heat > 0
        ? `${v.key}:${v.heat.toFixed(1)}`
        : v.key,
    );
  const topRulesText = topRules.length ? topRules.join(" | ") : "n/a";
  const thresholds = getThresholdsForProfile(context?.profile || null);
  const reason =
    normalizedAction === "timeout"
      ? `heat >= timeout (${heat.toFixed(1)} >= ${Number(thresholds.timeout || 0).toFixed(1)})`
      : normalizedAction === "delete" || normalizedAction === "delete_webhook"
        ? `heat >= delete (${heat.toFixed(1)} >= ${Number(thresholds.delete || 0).toFixed(1)})`
        : normalizedAction === "warn"
          ? `heat >= warn (${heat.toFixed(1)} >= ${Number(thresholds.warn || 0).toFixed(1)})`
          : `action=${normalizedAction || "unknown"} heat=${heat.toFixed(1)}`;
  return `${reason}; top_rules=${topRulesText}`;
}

function buildAutoModCaseReason(action, violations = [], context = {}) {
  const keys = Array.isArray(violations)
    ? violations
        .map((v) => String(v?.key || "").trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const rules = keys.length ? keys.join(", ") : "unknown";
  const timeoutText = context?.timeoutMs
    ? ` | timeout ${formatDuration(context.timeoutMs)}`
    : "";
  const snippetRaw = String(context?.content || "").trim();
  const snippet = snippetRaw ? ` | msg: ${truncateText(snippetRaw, 120)}` : "";
  return `[AUTOMOD] ${String(action || "action").toUpperCase()} | rules: ${rules}${timeoutText}${snippet}`;
}

async function registerAutoModCase(message, action, violations = [], context = {}) {
  try {
    const guild = message?.guild;
    const userId = String(message?.author?.id || "");
    const modId = String(message?.client?.user?.id || "");
    if (!guild?.id || !userId || !modId) return null;
    const normalizedAction = String(action || "").trim().toLowerCase();
    const mappedAction =
      normalizedAction === "timeout"
        ? "MUTE"
        : normalizedAction === "warn"
          ? "WARN"
          : "DELETE";
    const durationMs =
      mappedAction === "MUTE" && Number(context?.timeoutMs) > 0
        ? Number(context.timeoutMs)
        : null;
    const reason = buildAutoModCaseReason(action, violations, {
      timeoutMs: durationMs,
      content: message?.content || "",
    });
    const config = await getModConfig(guild.id);
    const { doc, created } = await createModCase({
      guildId: guild.id,
      action: mappedAction,
      userId,
      modId,
      reason,
      durationMs,
      context: {
        channelId: String(message?.channelId || message?.channel?.id || ""),
        messageId: String(message?.id || ""),
      },
      dedupe: {
        enabled: true,
        byMessageId: true,
        windowMs: 90_000,
        matchReason: true,
      },
    });
    if (created) {
      await logModCase({
        client: message.client,
        guild,
        modCase: doc,
        config,
      });
    }
    return doc;
  } catch {
    return null;
  }
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
        `<:VC_right_arrow:1473441155055096081> **Decision:** ${buildAutoModDecisionExplain(
          action,
          heatValue,
          violations,
          context,
        )}`,
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
  const state = getPanicState(message.guildId);
  const triggerAccountIds = Array.from(state?.triggerAccounts?.keys?.() || [])
    .filter(Boolean)
    .slice(-10);
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
        triggerAccountIds.length
          ? `<:VC_right_arrow:1473441155055096081> **Trigger IDs:** ${triggerAccountIds.map((id) => `\`${id}\``).join(", ")}`
          : null,
        `<:VC_right_arrow:1473441155055096081> **Duration:** ${Math.round(PANIC_MODE.durationMs / 60_000)} minutes`,
        `<:VC_right_arrow:1473441155055096081> **Active Until:** <t:${when}:F>`,
      ].join("\n"),
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
  if (event === "panic_enabled") {
    recordPanicEnabledMetric(message.guildId);
  }
}

async function warnUser(message, state, violations) {
  const deleted = await message.delete().then(() => true).catch(() => false);
  if (!canActNow(message)) return deleted;
  await markBadUserAction(message, "warn", violations);
  await sendAutomodActionInChannel(message, "warn", violations);
  await sendAutomodLog(message, "warn", violations, state.heat);
  recordAutomodMetric(message, "warn", violations);
  return deleted;
}

async function deleteMessage(message, state, violations) {
  const deleted = await message.delete().then(() => true).catch(() => false);
  if (deleted && canActNow(message)) {
    await markBadUserAction(message, "delete", violations);
    await registerAutoModCase(message, "delete", violations);
    await sendAutomodActionInChannel(message, "delete", violations);
    await sendAutomodLog(message, "delete", violations, state.heat);
    recordAutomodMetric(message, "delete", violations);
  }
  return deleted;
}

async function timeoutMember(message, state, violations, options = {}) {
  if (!AUTO_TIMEOUTS_ENABLED) return false;
  const canLogNow = options?.ignoreCooldown ? true : canActNow(message);
  const member = message.member;
  if (!member) return false;
  const timeoutProfile = computeNextAutoTimeoutDuration(message, nowMs());
  let durationMs = Number(timeoutProfile.durationMs || REGULAR_TIMEOUT_MS);
  const forcedDuration = Number(options?.forceDurationMs || 0);
  if (Number.isFinite(forcedDuration) && forcedDuration > 0) {
    durationMs = forcedDuration;
  }
  const escalate1h = await shouldEscalateNextAutoTimeout(message);
  if (escalate1h) {
    durationMs = Math.max(durationMs, 60 * 60_000);
  }
  durationMs = Math.max(60_000, Math.min(DISCORD_TIMEOUT_MAX_MS, durationMs));
  const deleted = await message.delete().then(() => true).catch(() => false);
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
  const heatBeforeReset = Number(state.heat || 0);
  await registerAutoModTimeoutStrike(message);
  if (canLogNow) {
    await markBadUserAction(message, "timeout", violations);
    await registerAutoModCase(message, "timeout", violations, {
      timeoutMs: durationMs,
    });
  }
  if (HEAT_RESET_ON_PUNISHMENT) {
    state.heat = 0;
  }
  state.msgTimes = [];
  state.normHistory = [];
  state.mentionTimes = [];
  state.mentionHourTimes = [];
  if (canLogNow) {
    await sendAutomodActionInChannel(message, "timeout", violations, {
      timeoutMs: durationMs,
    });
    await sendAutomodLog(message, "timeout", violations, heatBeforeReset, {
      timeoutMs: durationMs,
    });
    recordAutomodMetric(message, "timeout", violations);
  }
  return true;
}

function resolveInstantTimeoutOverrideMs(violations = []) {
  let maxMs = 0;
  for (const violation of Array.isArray(violations) ? violations : []) {
    const key = String(violation?.key || "");
    if (key === "regular_message") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.regularMessage.timeoutMs || 0));
    } else if (key === "suspicious_account") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.suspiciousAccount.timeoutMs || 0));
    } else if (key === "similar_message") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.similarMessage.timeoutMs || 0));
    } else if (
      key === "mention_user" ||
      key === "mention_role" ||
      key === "mention_everyone" ||
      key === "mention_hour_cap" ||
      key === "mentions_lockdown"
    ) {
      maxMs = Math.max(maxMs, Number(MENTION_RULES.timeoutMs || 0));
    } else if (key === "invite") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.inviteLinks.timeoutMs || 0));
    } else if (key === "scam_pattern") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.maliciousLinks.timeoutMs || 0));
    } else if (key === "nsfw_link") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.nsfwLinks.timeoutMs || 0));
    } else if (key === "word_blacklist") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.wordBlacklist.timeoutMs || 0));
    } else if (key === "link_blacklist") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.linkBlacklist.timeoutMs || 0));
    } else if (key === "emoji_spam") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.emojis.timeoutMs || 0));
    } else if (key === "new_lines") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.newLines.timeoutMs || 0));
    } else if (key === "zalgo") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.zalgo.timeoutMs || 0));
    } else if (key === "characters") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.characters.timeoutMs || 0));
    } else if (
      key === "attachment_embed" ||
      key === "attachment_image" ||
      key === "attachment_file" ||
      key === "attachment_link" ||
      key === "attachment_sticker"
    ) {
      maxMs = Math.max(maxMs, Number(ATTACHMENT_RULES.timeoutMs || 0));
    }
  }
  return Number.isFinite(maxMs) && maxMs > 0 ? maxMs : 0;
}

async function runAutoModMessage(message) {
  const now = nowMs();
  if (now - Number(lastRuntimeCleanupAt || 0) >= RUNTIME_CLEANUP_INTERVAL_MS) {
    cleanupRuntimeMaps(now);
    lastRuntimeCleanupAt = now;
  }
  if (!message?.guild) return { blocked: false };
  if (!AUTOMOD_ENABLED) return { blocked: false, action: "automod_disabled" };
  if (await isVerifiedBotMessage(message)) return { blocked: false };
  if (message.webhookId) {
    if (
      !AUTOMOD_MONITOR_UNWHITELISTED_WEBHOOKS ||
      automodRuntimeConfig?.heatFilters?.webhookMessages === false
    ) {
      return { blocked: false, action: "webhook_filter_disabled" };
    }
    const webhookId = String(message.webhookId);
    const authorId = String(message.author?.id || "");
    const applicationId = String(message.applicationId || "");
    const clientAppId = String(message.client?.user?.id || "");

    if (
      CORE_EXEMPT_USER_IDS.has(authorId) ||
      isSecurityProfileImmune(String(message.guildId || ""), authorId)
    ) {
      return { blocked: false };
    }
    if (TRUSTED_WEBHOOK_AUTHOR_IDS.has(authorId)) return { blocked: false };
    if (applicationId && TRUSTED_WEBHOOK_AUTHOR_IDS.has(applicationId)) {
      return { blocked: false };
    }
    if (
      applicationId &&
      (applicationId === clientAppId ||
        CORE_EXEMPT_USER_IDS.has(applicationId) ||
        isSecurityProfileImmune(String(message.guildId || ""), applicationId))
    ) {
      return { blocked: false };
    }
    if (applicationId && (await isVerifiedBotUserId(message.client, applicationId))) {
      return { blocked: false, action: "verified_bot_webhook_exempt" };
    }
    if (WHITELISTED_WEBHOOK_IDS.has(webhookId)) return { blocked: false };
    await message.delete().catch(() => {});
    await markBadUserAction(message, "delete_webhook", [
      { key: "unwhitelisted_webhook" },
    ]);
    await registerAutoModCase(
      message,
      "delete_webhook",
      [{ key: "unwhitelisted_webhook" }],
    );
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
    recordAutomodMetric(message, "delete_webhook", [
      { key: "unwhitelisted_webhook" },
    ]);
    return { blocked: true, action: "delete_webhook", heat: 0 };
  }
  if (!message?.member && message?.guild?.members?.fetch) {
    const fetchedMember = await message.guild.members
      .fetch(message.author.id)
      .catch(() => null);
    if (fetchedMember) {
      try {
        message.member = fetchedMember;
      } catch {}
    }
  }
  if (!message?.member) return { blocked: false };
  if (message.author?.bot || message.system) {
    return { blocked: false };
  }
  if (isLikelyCommandMessage(message)) {
    return { blocked: false, action: "command_exempt" };
  }
  if (isExempt(message)) return { blocked: false };

  const profile = getProfileConfig(message);
  const thresholds = getThresholdsForProfile(profile);
  const state = getState(message);
  decayHeat(state);
  const rawViolations = await detectViolations(message, state, profile);
  const legitConversation = looksLikeLegitConversation(
    stripQuotedAndCodeText(String(message.content || "")) || String(message.content || ""),
  );
  const violations = normalizeViolationsForHeat(rawViolations, { legitConversation });
  if (!violations.length) return { blocked: false };

  const at = nowMs();
  const shouldCountForPanic = violations.some((v) =>
    PANIC_TRIGGER_KEYS.has(String(v?.key || "")),
  );
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
      const profile = await getBadUserProfile(message.author.id, message.guildId);
      const lastActionTs = profile?.lastActionAt ? new Date(profile.lastActionAt).getTime() : 0;
      const recentEnough = lastActionTs > 0 && at - lastActionTs <= AUTO_TIMEOUT_PROFILE_RESET_MS;
      const activeStrikes = Number(profile?.activeStrikes || 0);
      if (recentEnough && activeStrikes >= 2) dbBoost = 1;
    }
    const signal = registerGuildInstantSignal(message, at);
    let raidBoost = 0;
    if (signal.uniqueUsers >= Number(PANIC_MODE.raidUserThreshold || 3)) {
      raidBoost += 1;
    }
    if (signal.youngUsers >= Number(PANIC_MODE.raidYoungThreshold || 2)) {
      raidBoost += 1;
    }

    const panic = registerPanicTrigger(
      message.guildId,
      message.author.id,
      { activityBoost, dbBoost, raidBoost },
      at,
    );

    if (panic.activated) {
      const activeUntil = getPanicState(message.guildId).activeUntil;
      // Intentionally isolated: AutoMod panic must not escalate AntiNuke/JoinRaid.
      await sendPanicModeLog(
        message,
        "panic_enabled",
        panic.count,
        activeUntil,
      );
    }
  }

  // Come Wick: in panic solo i raider (account che hanno contribuito al trigger) ricevono timeout istantaneo; i membri normali seguono i filtri heat.
  const panicActive = isPanicModeActive(message.guildId);
  const isRaider = isRaiderInPanic(message.guildId, message.author?.id, at);
  if (panicActive && isRaider) {
    state.heat = MAX_HEAT;
    await markBadUserTrigger(message, violations, state.heat);
    const instantOverrideMs = resolveInstantTimeoutOverrideMs(violations);
    const done = await timeoutMember(message, state, [
      ...violations,
      { key: "panic_mode", heat: 0, info: "raider during panic" },
    ], { ignoreCooldown: true, forceDurationMs: instantOverrideMs });
    if (done) return { blocked: true, action: "timeout", heat: state.heat };
    const deleted = await deleteMessage(message, state, [
      ...violations,
      { key: "panic_mode", heat: 0, info: "timeout fallback -> delete" },
    ]);
    return {
      blocked: Boolean(deleted),
      action: deleted ? "delete" : "enforcement_failed",
      heat: state.heat,
    };
  }

  const hasInstantLinkViolation = violations.some((v) =>
    INSTANT_LINK_KEYS.has(v.key),
  );
  if (hasInstantLinkViolation) {
    state.heat = MAX_HEAT;
    await markBadUserTrigger(message, violations, state.heat);
    const instantOverrideMs = resolveInstantTimeoutOverrideMs(violations);
    const done = await timeoutMember(message, state, violations, {
      ignoreCooldown: true,
      forceDurationMs: instantOverrideMs,
    });
    if (done) return { blocked: true, action: "timeout", heat: state.heat };
    const deleted = await deleteMessage(message, state, [
      ...violations,
      { key: "link_blacklist", heat: 0, info: "timeout fallback -> delete" },
    ]);
    return {
      blocked: Boolean(deleted),
      action: deleted ? "delete" : "enforcement_failed",
      heat: state.heat,
    };
  }

  // Le regole si sommano tra loro: si aggiunge l'heat di ogni violazione.
  for (const v of violations) addHeat(state, v.heat);
  await markBadUserTrigger(message, violations, state.heat);

  if (state.heat >= thresholds.timeout) {
    const timeoutOverrideMs = resolveInstantTimeoutOverrideMs(violations);
    const done = await timeoutMember(message, state, violations, {
      forceDurationMs: timeoutOverrideMs,
    });
    if (done) return { blocked: true, action: "timeout", heat: state.heat };
    const deleted = await deleteMessage(message, state, [
      ...violations,
      { key: "regular_message", heat: 0, info: "timeout fallback -> delete" },
    ]);
    return {
      blocked: Boolean(deleted),
      action: deleted ? "delete" : "enforcement_failed",
      heat: state.heat,
    };
  }

  if (state.heat >= thresholds.delete) {
    const deleted = await deleteMessage(message, state, violations);
    return {
      blocked: Boolean(deleted),
      action: deleted ? "delete" : "enforcement_failed",
      heat: state.heat,
    };
  }

  if (state.heat >= thresholds.warn) {
    const warned = await warnUser(message, state, violations);
    return {
      blocked: Boolean(warned),
      action: warned ? "warn" : "enforcement_failed",
      heat: state.heat,
    };
  }

  return { blocked: false, action: "heat", heat: state.heat };
}

function summarizeMapEntries(source, limit = 10) {
  const entries = Object.entries(source || {}).map(([key, value]) => [
    key,
    Number(value || 0),
  ]);
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, Math.max(1, Number(limit || 10)));
}

function getAutoModDashboardData(guildId, options = {}) {
  const gid = String(guildId || "");
  const days = Math.max(1, Math.min(30, Number(options.days || 1)));
  const limit = Math.max(1, Math.min(20, Number(options.limit || 10)));
  const now = Date.now();
  const guildData = automodMetrics?.guilds?.[gid]?.days || {};
  const aggregate = {
    actions: {},
    rules: {},
    channels: {},
    users: {},
    panicEnabled: 0,
  };
  for (let i = 0; i < days; i += 1) {
    const dayKey = dayKeyFromMs(now - i * 24 * 60 * 60_000);
    const row = guildData[dayKey];
    if (!row) continue;
    for (const [k, v] of Object.entries(row.actions || {})) {
      aggregate.actions[k] = Number(aggregate.actions[k] || 0) + Number(v || 0);
    }
    for (const [k, v] of Object.entries(row.rules || {})) {
      aggregate.rules[k] = Number(aggregate.rules[k] || 0) + Number(v || 0);
    }
    for (const [k, v] of Object.entries(row.channels || {})) {
      aggregate.channels[k] = Number(aggregate.channels[k] || 0) + Number(v || 0);
    }
    for (const [k, v] of Object.entries(row.users || {})) {
      aggregate.users[k] = Number(aggregate.users[k] || 0) + Number(v || 0);
    }
    aggregate.panicEnabled += Number(row.panicEnabled || 0);
  }
  return {
    days,
    panicEnabled: aggregate.panicEnabled,
    actions: aggregate.actions,
    topRules: summarizeMapEntries(aggregate.rules, limit),
    topChannels: summarizeMapEntries(aggregate.channels, limit),
    topUsers: summarizeMapEntries(aggregate.users, limit),
  };
}

function getAutoModConfigSnapshot() {
  return JSON.parse(JSON.stringify(automodRuntimeConfig || DEFAULT_AUTOMOD_RUNTIME));
}

function getAutoModRulesSnapshot() {
  return JSON.parse(
    JSON.stringify({
      status: {
        enabled: Boolean(AUTOMOD_ENABLED),
        antiSpamEnabled: Boolean(AUTOMOD_ANTISPAM_ENABLED),
        monitorUnwhitelistedWebhooks: Boolean(AUTOMOD_MONITOR_UNWHITELISTED_WEBHOOKS),
      },
      textRules: TEXT_RULES,
      mentionRules: MENTION_RULES,
      attachmentRules: ATTACHMENT_RULES,
    }),
  );
}

function setByPath(target, pathExpr, value) {
  const path = String(pathExpr || "")
    .split(".")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!path.length) return false;
  if (path.some((key) => ["__proto__", "prototype", "constructor"].includes(key))) {
    return false;
  }
  let ref = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (["__proto__", "prototype", "constructor"].includes(key)) return false;
    if (!ref[key] || typeof ref[key] !== "object") ref[key] = {};
    ref = ref[key];
  }
  if (["__proto__", "prototype", "constructor"].includes(path[path.length - 1])) {
    return false;
  }
  ref[path[path.length - 1]] = value;
  return true;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function validateAutoModRuntimeConfig(cfg) {
  const status = cfg?.status || {};
  const t = cfg?.thresholds || {};
  const hs = cfg?.heatSystem || {};
  const at = cfg?.autoTimeouts || {};
  const al = cfg?.autoLockdown || {};
  const hf = cfg?.heatFactors || {};
  const hc = cfg?.heatCaps || {};
  const p = cfg?.panic || {};
  if (!isFiniteNumber(t.warn) || Number(t.warn) < 0 || Number(t.warn) > 200) {
    return { ok: false, reason: "invalid_threshold_warn" };
  }
  if (!isFiniteNumber(t.delete) || Number(t.delete) < 0 || Number(t.delete) > 200) {
    return { ok: false, reason: "invalid_threshold_delete" };
  }
  if (!isFiniteNumber(t.timeout) || Number(t.timeout) < 0 || Number(t.timeout) > 200) {
    return { ok: false, reason: "invalid_threshold_timeout" };
  }
  if (!(Number(t.warn) <= Number(t.delete) && Number(t.delete) <= Number(t.timeout))) {
    return { ok: false, reason: "invalid_threshold_order" };
  }
  if (
    typeof status.enabled !== "boolean" ||
    typeof status.antiSpamEnabled !== "boolean" ||
    typeof status.monitorUnwhitelistedWebhooks !== "boolean"
  ) {
    return { ok: false, reason: "invalid_status_toggles" };
  }
  const heatChecks = [
    ["maxHeat", hs.maxHeat, 50, 200],
    ["decayPerSec", hs.decayPerSec, 0, 10],
  ];
  for (const [key, value, min, max] of heatChecks) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      return { ok: false, reason: `invalid_heat_${key}` };
    }
  }
  const autoTimeoutChecks = [
    ["regularStrikeDurationMs", at.regularStrikeDurationMs, 30_000, 24 * 60 * 60_000],
    ["capStrikeDurationMs", at.capStrikeDurationMs, 30_000, 28 * 24 * 60 * 60_000],
    ["capStrike", at.capStrike, 2, 20],
    ["multiplierPercent", at.multiplierPercent, 100, 500],
    ["profileResetMs", at.profileResetMs, 60_000, 7 * 24 * 60 * 60_000],
  ];
  for (const [key, value, min, max] of autoTimeoutChecks) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      return { ok: false, reason: `invalid_autotimeout_${key}` };
    }
  }
  if (Number(at.capStrikeDurationMs) < Number(at.regularStrikeDurationMs)) {
    return { ok: false, reason: "invalid_autotimeout_cap_duration" };
  }
  const autoLockdownChecks = [
    ["mentionTrigger", al.mentionTrigger, 5, 200],
    ["mentionWindowMs", al.mentionWindowMs, 1_000, 60_000],
    ["mentionHourCap", al.mentionHourCap, 5, 400],
  ];
  for (const [key, value, min, max] of autoLockdownChecks) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      return { ok: false, reason: `invalid_autolockdown_${key}` };
    }
  }
  for (const [key, value] of Object.entries(hf || {})) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 5) {
      return { ok: false, reason: `invalid_heatfactor_${key}` };
    }
  }
  const heatCapChecks = [
    ["maxPerMessage", hc.maxPerMessage, 20, 200],
    ["charactersMax", hc.charactersMax, 5, 150],
    ["textClusterMax", hc.textClusterMax, 5, 150],
    ["attachmentClusterMax", hc.attachmentClusterMax, 5, 150],
    ["mentionClusterMax", hc.mentionClusterMax, 5, 200],
  ];
  for (const [key, value, min, max] of heatCapChecks) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      return { ok: false, reason: `invalid_heatcap_${key}` };
    }
  }

  const panicChecks = [
    ["triggerCount", 1, 30],
    ["triggerWindowMs", 10_000, 24 * 60 * 60_000],
    ["durationMs", 30_000, 24 * 60 * 60_000],
    ["raidWindowMs", 10_000, 60 * 60_000],
    ["raidUserThreshold", 1, 100],
    ["raidYoungThreshold", 1, 100],
  ];
  for (const [key, min, max] of panicChecks) {
    const value = Number(p[key]);
    if (!Number.isFinite(value) || value < min || value > max) {
      return { ok: false, reason: `invalid_panic_${key}` };
    }
  }
  return { ok: true };
}

function updateAutoModConfig(pathExpr, value) {
  const next = getAutoModConfigSnapshot();
  if (!setByPath(next, pathExpr, value)) {
    return { ok: false, reason: "invalid_path" };
  }
  const merged = sanitizeAutoModRuntimeConfig(next);
  const validation = validateAutoModRuntimeConfig(merged);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }
  const saved = writeJsonSafe(AUTOMOD_CONFIG_PATH, merged);
  if (!saved) return { ok: false, reason: "save_failed" };
  automodRuntimeConfig = merged;
  applyAutomodRuntime();
  return { ok: true, config: getAutoModConfigSnapshot() };
}

module.exports = {
  runAutoModMessage,
  getAutoModMemberSnapshot,
  isAutoModRoleExemptMember,
  getAutoModDashboardData,
  getAutoModConfigSnapshot,
  getAutoModRulesSnapshot,
  updateAutoModConfig,
  isPanicModeActiveForGuild: isPanicModeActive,
  getAutoModPanicSnapshot,
  triggerAutoModPanicExternal,
  __test: {
    isLikelyCommandMessage,
    buildAutoModDecisionExplain,
  },
};