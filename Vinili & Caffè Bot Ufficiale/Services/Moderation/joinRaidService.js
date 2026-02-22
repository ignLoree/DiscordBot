const { EmbedBuilder, PermissionsBitField, UserFlagsBitField, } = require("discord.js");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const JoinRaidState = require("../../Schemas/Moderation/joinRaidStateSchema");
const { triggerAntiNukePanicExternal } = require("./antiNukeService");
const { triggerAutoModPanicExternal } = require("./automodService");
const {
  isSecurityProfileImmune,
  hasAdminsProfileCapability,
} = require("./securityProfilesService");

const ARROW = "<:VC_right_arrow:1473441155055096081>";
const HIGH_STAFF_ROLE_ID = String(IDs.roles?.HighStaff || "");
const HIGH_STAFF_MENTION = HIGH_STAFF_ROLE_ID
  ? `<@&${HIGH_STAFF_ROLE_ID}>`
  : null;
const CORE_EXEMPT_USER_IDS = new Set([
  "1466495522474037463",
  "1329118940110127204",
]);
const VERIFIED_BOT_IDS = new Set(
  Object.values(IDs?.bots || {})
    .filter(Boolean)
    .map(String),
);

const JOIN_RAID_CONFIG = {
  enabled: true,
  triggerAction: "kick", // ban | kick | timeout | log
  triggerType: "unique", // unique | events
  accountType: "any", // any | young | no_pfp | young_or_no_pfp | id_flag
  punishOnActiveRaid: true,
  triggerCount: 10,
  triggerWindowMs: 3 * 60 * 60_000,
  raidDurationMs: 30 * 60_000,
  warnedRoleIds: [
    IDs.roles.Founder,
    IDs.roles.CoFounder,
    IDs.roles.Manager,
    IDs.roles.Admin,
    IDs.roles.Supervisor,
    IDs.roles.Coordinator,
    IDs.roles.Mod,
    IDs.roles.Helper,
    IDs.roles.HighStaff,
  ]
    .filter(Boolean)
    .map(String),
  idFlag: {
    enabled: true,
    categorization: "adaptive",
    minimumMatches: 4,
    compareWindowMs: 3 * 60 * 60_000,
    createdAtDeltaMs: 20 * 60_000,
  },
  noPfpFlag: {
    enabled: true,
  },
  ageFlag: {
    enabled: true,
    minimumAgeMs: 3 * 24 * 60 * 60_000,
  },
};

const JOIN_RAID_PRESETS = {
  safe: {
    triggerAction: "kick",
    triggerType: "unique",
    accountType: "young_or_no_pfp",
    punishOnActiveRaid: true,
    triggerCount: 12,
    triggerWindowMs: 3 * 60 * 60_000,
    raidDurationMs: 20 * 60_000,
    idFlag: {
      minimumMatches: 5,
      compareWindowMs: 3 * 60 * 60_000,
      createdAtDeltaMs: 20 * 60_000,
    },
    ageFlag: { minimumAgeMs: 2 * 24 * 60 * 60_000 },
  },
  balanced: {
    triggerAction: "kick",
    triggerType: "unique",
    accountType: "any",
    punishOnActiveRaid: true,
    triggerCount: 10,
    triggerWindowMs: 3 * 60 * 60_000,
    raidDurationMs: 30 * 60_000,
    idFlag: {
      minimumMatches: 4,
      compareWindowMs: 3 * 60 * 60_000,
      createdAtDeltaMs: 20 * 60_000,
    },
    ageFlag: { minimumAgeMs: 3 * 24 * 60 * 60_000 },
  },
  strict: {
    triggerAction: "ban",
    triggerType: "events",
    accountType: "any",
    punishOnActiveRaid: true,
    triggerCount: 8,
    triggerWindowMs: 2 * 60 * 60_000,
    raidDurationMs: 45 * 60_000,
    idFlag: {
      minimumMatches: 3,
      compareWindowMs: 2 * 60 * 60_000,
      createdAtDeltaMs: 25 * 60_000,
    },
    ageFlag: { minimumAgeMs: 5 * 24 * 60 * 60_000 },
  },
};

const GUILD_STATE = new Map();
const TEMP_BAN_TIMERS = new Map();
const RAID_REPORT_TIMERS = new Map();
const SAVE_TIMERS = new Map();
const LOADED_GUILDS = new Set();
const LOAD_SUCCEEDED_GUILDS = new Set();
const LOAD_GUILD_PROMISES = new Map();
const GUILD_LOCKS = new Map();
const CLEARED_GUILDS = new Set();
const LAST_RESTORE_AT = new Map();
const VERIFIED_BOT_CACHE = new Map();
const LOW_RISK_FLAG_LOG_COOLDOWN = new Map();
const RESTORE_COOLDOWN_MS = 45_000;
const LOW_RISK_FLAG_LOG_COOLDOWN_MS = 20_000;
const JOIN_RAID_CONFIG_PATH = path.resolve(
  __dirname,
  "../../Utils/Config/joinRaidConfig.json",
);

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

function applyPersistentJoinRaidConfig(raw) {
  if (!raw || typeof raw !== "object") return;
  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  if (typeof raw.enabled === "boolean") {
    JOIN_RAID_CONFIG.enabled = raw.enabled;
  }
  if (typeof raw.triggerAction === "string") {
    const action = String(raw.triggerAction || "").toLowerCase();
    if (["ban", "kick", "timeout", "log"].includes(action)) {
      JOIN_RAID_CONFIG.triggerAction = action;
    }
  }
  if (typeof raw.triggerType === "string") {
    const triggerType = String(raw.triggerType || "").toLowerCase();
    if (["unique", "events"].includes(triggerType)) {
      JOIN_RAID_CONFIG.triggerType = triggerType;
    }
  }
  if (typeof raw.accountType === "string") {
    const accountType = String(raw.accountType || "").toLowerCase();
    if (
      [
        "any",
        "young",
        "no_pfp",
        "young_or_no_pfp",
        "id_flag",
      ].includes(accountType)
    ) {
      JOIN_RAID_CONFIG.accountType = accountType;
    }
  }
  if (typeof raw.punishOnActiveRaid === "boolean") {
    JOIN_RAID_CONFIG.punishOnActiveRaid = raw.punishOnActiveRaid;
  }
  JOIN_RAID_CONFIG.triggerCount = clamp(raw.triggerCount, 1, 500, JOIN_RAID_CONFIG.triggerCount);
  JOIN_RAID_CONFIG.triggerWindowMs = clamp(
    raw.triggerWindowMs,
    10_000,
    24 * 60 * 60_000,
    JOIN_RAID_CONFIG.triggerWindowMs,
  );
  JOIN_RAID_CONFIG.raidDurationMs = clamp(
    raw.raidDurationMs,
    60_000,
    24 * 60 * 60_000,
    JOIN_RAID_CONFIG.raidDurationMs,
  );
  if (Array.isArray(raw.warnedRoleIds)) {
    const ids = raw.warnedRoleIds
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 20);
    JOIN_RAID_CONFIG.warnedRoleIds = ids.length
      ? ids
      : [HIGH_STAFF_ROLE_ID].filter(Boolean);
  }
  Object.assign(JOIN_RAID_CONFIG.idFlag, raw.idFlag || {});
  Object.assign(JOIN_RAID_CONFIG.noPfpFlag, raw.noPfpFlag || {});
  Object.assign(JOIN_RAID_CONFIG.ageFlag, raw.ageFlag || {});
  JOIN_RAID_CONFIG.idFlag.enabled =
    typeof JOIN_RAID_CONFIG.idFlag.enabled === "boolean"
      ? JOIN_RAID_CONFIG.idFlag.enabled
      : true;
  JOIN_RAID_CONFIG.idFlag.categorization =
    typeof JOIN_RAID_CONFIG.idFlag.categorization === "string"
      ? String(JOIN_RAID_CONFIG.idFlag.categorization || "").toLowerCase()
      : "adaptive";
  if (
    !["static", "algorithm", "adaptive"].includes(
      JOIN_RAID_CONFIG.idFlag.categorization,
    )
  ) {
    JOIN_RAID_CONFIG.idFlag.categorization = "adaptive";
  }
  JOIN_RAID_CONFIG.idFlag.minimumMatches = clamp(
    JOIN_RAID_CONFIG.idFlag.minimumMatches,
    1,
    100,
    4,
  );
  JOIN_RAID_CONFIG.idFlag.compareWindowMs = clamp(
    JOIN_RAID_CONFIG.idFlag.compareWindowMs,
    60_000,
    24 * 60 * 60_000,
    3 * 60 * 60_000,
  );
  JOIN_RAID_CONFIG.idFlag.createdAtDeltaMs = clamp(
    JOIN_RAID_CONFIG.idFlag.createdAtDeltaMs,
    60_000,
    24 * 60 * 60_000,
    20 * 60_000,
  );
  JOIN_RAID_CONFIG.noPfpFlag.enabled =
    typeof JOIN_RAID_CONFIG.noPfpFlag.enabled === "boolean"
      ? JOIN_RAID_CONFIG.noPfpFlag.enabled
      : true;
  JOIN_RAID_CONFIG.ageFlag.enabled =
    typeof JOIN_RAID_CONFIG.ageFlag.enabled === "boolean"
      ? JOIN_RAID_CONFIG.ageFlag.enabled
      : true;
  JOIN_RAID_CONFIG.ageFlag.minimumAgeMs = clamp(
    JOIN_RAID_CONFIG.ageFlag.minimumAgeMs,
    60_000,
    365 * 24 * 60 * 60_000,
    3 * 24 * 60 * 60_000,
  );
}

function saveJoinRaidPersistentConfig() {
  return writeJsonSafe(JOIN_RAID_CONFIG_PATH, {
    enabled: Boolean(JOIN_RAID_CONFIG.enabled),
    triggerAction: String(JOIN_RAID_CONFIG.triggerAction || "log"),
    triggerType: String(JOIN_RAID_CONFIG.triggerType || "unique"),
    accountType: String(JOIN_RAID_CONFIG.accountType || "any"),
    punishOnActiveRaid: Boolean(JOIN_RAID_CONFIG.punishOnActiveRaid),
    triggerCount: Number(JOIN_RAID_CONFIG.triggerCount || 0),
    triggerWindowMs: Number(JOIN_RAID_CONFIG.triggerWindowMs || 0),
    raidDurationMs: Number(JOIN_RAID_CONFIG.raidDurationMs || 0),
    warnedRoleIds: [...new Set((JOIN_RAID_CONFIG.warnedRoleIds || []).map(String).filter(Boolean))],
    idFlag: { ...JOIN_RAID_CONFIG.idFlag },
    noPfpFlag: { ...JOIN_RAID_CONFIG.noPfpFlag },
    ageFlag: { ...JOIN_RAID_CONFIG.ageFlag },
  });
}

function getJoinRaidConfigSnapshot() {
  return JSON.parse(
    JSON.stringify({
      enabled: Boolean(JOIN_RAID_CONFIG.enabled),
      triggerAction: String(JOIN_RAID_CONFIG.triggerAction || "log"),
      triggerType: String(JOIN_RAID_CONFIG.triggerType || "unique"),
      accountType: String(JOIN_RAID_CONFIG.accountType || "any"),
      punishOnActiveRaid: Boolean(JOIN_RAID_CONFIG.punishOnActiveRaid),
      triggerCount: Number(JOIN_RAID_CONFIG.triggerCount || 0),
      triggerWindowMs: Number(JOIN_RAID_CONFIG.triggerWindowMs || 0),
      raidDurationMs: Number(JOIN_RAID_CONFIG.raidDurationMs || 0),
      warnedRoleIds: [...new Set((JOIN_RAID_CONFIG.warnedRoleIds || []).map(String).filter(Boolean))],
      idFlag: { ...JOIN_RAID_CONFIG.idFlag },
      noPfpFlag: { ...JOIN_RAID_CONFIG.noPfpFlag },
      ageFlag: { ...JOIN_RAID_CONFIG.ageFlag },
    }),
  );
}

function setJoinRaidConfigSnapshot(rawConfig) {
  try {
    applyPersistentJoinRaidConfig(rawConfig || {});
    const saved = saveJoinRaidPersistentConfig();
    if (!saved) return { ok: false, reason: "save_failed" };
    return { ok: true, config: getJoinRaidConfigSnapshot() };
  } catch {
    return { ok: false, reason: "apply_failed" };
  }
}

applyPersistentJoinRaidConfig(readJsonSafe(JOIN_RAID_CONFIG_PATH, null));

function formatRaidHours(ms) {
  const hours = Number(ms || 0) / 3_600_000;
  if (!Number.isFinite(hours) || hours <= 0) return "0";
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

async function withGuildLock(guildId, task) {
  const key = String(guildId || "");
  const prev = GUILD_LOCKS.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(async () => task());
  const lockPromise = run.finally(() => {
    if (GUILD_LOCKS.get(key) === lockPromise) {
      GUILD_LOCKS.delete(key);
    }
  });
  GUILD_LOCKS.set(key, lockPromise);
  return run;
}

function getGuildState(guildId) {
  const key = String(guildId || "");
  const existing = GUILD_STATE.get(key);
  if (existing) return existing;
  const initial = {
    samples: [],
    flagged: [],
    tempBans: [],
    raidUntil: 0,
    raidCaseCode: "",
    raidStartedAt: 0,
    raidInitialFlaggedUserIds: [],
    raidCaughtUserIds: [],
  };
  GUILD_STATE.set(key, initial);
  return initial;
}

function nowMs() {
  return Date.now();
}

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

async function loadGuildState(guildId) {
  const key = String(guildId || "");
  if (!key || CLEARED_GUILDS.has(key) || LOADED_GUILDS.has(key)) return;
  if (!isDbReady()) return;
  const existingLoad = LOAD_GUILD_PROMISES.get(key);
  if (existingLoad) {
    await existingLoad;
    return;
  }
  const loader = (async () => {
    try {
      if (CLEARED_GUILDS.has(key)) return;
      const row = await JoinRaidState.findOne({ guildId: key }).lean();
      if (CLEARED_GUILDS.has(key)) return;
      if (row) {
        GUILD_STATE.set(key, {
          samples: Array.isArray(row.samples) ? row.samples : [],
          flagged: Array.isArray(row.flagged) ? row.flagged : [],
          tempBans: Array.isArray(row.tempBans) ? row.tempBans : [],
          raidUntil: Number(row.raidUntil || 0),
          raidCaseCode: String(row.raidCaseCode || ""),
          raidStartedAt: Number(row.raidStartedAt || 0),
          raidInitialFlaggedUserIds: Array.isArray(row.raidInitialFlaggedUserIds)
            ? row.raidInitialFlaggedUserIds.map((x) => String(x || "")).filter(Boolean)
            : [],
          raidCaughtUserIds: Array.isArray(row.raidCaughtUserIds)
            ? row.raidCaughtUserIds.map((x) => String(x || "")).filter(Boolean)
            : [],
        });
      }
      if (!CLEARED_GUILDS.has(key)) LOAD_SUCCEEDED_GUILDS.add(key);
    } catch (err) {
      global.logger?.warn?.("[joinRaid] loadGuildState failed:", key, err?.message || err);
    } finally {
      if (!CLEARED_GUILDS.has(key)) LOADED_GUILDS.add(key);
      LOAD_GUILD_PROMISES.delete(key);
    }
  })();
  LOAD_GUILD_PROMISES.set(key, loader);
  await loader;
}

function scheduleStateSave(guildId) {
  const key = String(guildId || "");
  if (!key || !isDbReady() || CLEARED_GUILDS.has(key)) return;
  if (!LOAD_SUCCEEDED_GUILDS.has(key)) return;
  const old = SAVE_TIMERS.get(key);
  if (old) clearTimeout(old);
  const timer = setTimeout(async () => {
    SAVE_TIMERS.delete(key);
    const state = getGuildState(key);
    pruneState(state, nowMs());
    try {
      await JoinRaidState.updateOne(
        { guildId: key },
        {
          $set: {
            raidUntil: Number(state.raidUntil || 0),
            samples: state.samples.slice(-300),
            flagged: state.flagged.slice(-300),
            tempBans: Array.isArray(state.tempBans)
              ? state.tempBans.slice(-300)
              : [],
            raidCaseCode: String(state.raidCaseCode || ""),
            raidStartedAt: Number(state.raidStartedAt || 0),
            raidInitialFlaggedUserIds: Array.isArray(state.raidInitialFlaggedUserIds)
              ? state.raidInitialFlaggedUserIds.slice(-80)
              : [],
            raidCaughtUserIds: Array.isArray(state.raidCaughtUserIds)
              ? state.raidCaughtUserIds.slice(-300)
              : [],
          },
        },
        { upsert: true },
      );
    } catch (err) {
      global.logger?.warn?.("[joinRaid] scheduleStateSave failed:", key, err?.message || err);
    }
  }, 1_500);
  SAVE_TIMERS.set(key, timer);
}

function pruneState(state, at = nowMs()) {
  const minSampleTs = at - JOIN_RAID_CONFIG.idFlag.compareWindowMs;
  const minFlagTs = at - JOIN_RAID_CONFIG.triggerWindowMs;
  if (!Array.isArray(state.samples)) state.samples = [];
  if (!Array.isArray(state.flagged)) state.flagged = [];
  let sampleIdx = 0;
  while (sampleIdx < state.samples.length && Number(state.samples[sampleIdx]?.ts || 0) < minSampleTs) {
    sampleIdx += 1;
  }
  if (sampleIdx > 0) state.samples.splice(0, sampleIdx);
  let flaggedIdx = 0;
  while (flaggedIdx < state.flagged.length && Number(state.flagged[flaggedIdx]?.ts || 0) < minFlagTs) {
    flaggedIdx += 1;
  }
  if (flaggedIdx > 0) state.flagged.splice(0, flaggedIdx);
  if (!Array.isArray(state.tempBans)) state.tempBans = [];
  if (!Array.isArray(state.raidInitialFlaggedUserIds)) {
    state.raidInitialFlaggedUserIds = [];
  }
  if (!Array.isArray(state.raidCaughtUserIds)) state.raidCaughtUserIds = [];
  if (typeof state.raidCaseCode !== "string") state.raidCaseCode = "";
  if (!Number.isFinite(Number(state.raidStartedAt || 0))) state.raidStartedAt = 0;
  state.tempBans = state.tempBans.filter(
    (x) =>
      String(x?.userId || "").length > 0 &&
      Number(x?.unbanAt || 0) > at,
  );
}

function makeJoinRaidCaseCode() {
  const token = Math.random().toString(36).slice(2, 10);
  const stamp = String(Date.now()).slice(-8);
  return `${token}_${stamp}`;
}

function buildInitialFlagRows(guild, state, limit = 8) {
  const ids = Array.isArray(state?.raidInitialFlaggedUserIds)
    ? state.raidInitialFlaggedUserIds
    : [];
  const unique = Array.from(new Set(ids.map((x) => String(x || "")).filter(Boolean)));
  return unique.slice(0, Math.max(1, limit)).map((userId) => {
    const member = guild?.members?.cache?.get?.(userId) || null;
    const tag =
      member?.user?.tag ||
      member?.user?.username ||
      member?.displayName ||
      `user:${userId.slice(-4)}`;
    return `\`${tag}\` | \`${userId}\``;
  });
}

function scheduleJoinRaidReport(guild) {
  if (!guild?.id) return;
  const guildId = String(guild.id);
  const state = getGuildState(guildId);
  const until = Number(state.raidUntil || 0);
  if (until <= Date.now()) return;
  const old = RAID_REPORT_TIMERS.get(guildId);
  if (old) clearTimeout(old);
  const delay = Math.max(1_000, until - Date.now() + 1_000);
  const timer = setTimeout(async () => {
    RAID_REPORT_TIMERS.delete(guildId);
    await finalizeJoinRaidAndReport(guild, "elapsed").catch(() => null);
  }, delay);
  if (typeof timer.unref === "function") timer.unref();
  RAID_REPORT_TIMERS.set(guildId, timer);
}

async function finalizeJoinRaidAndReport(guild, reason = "elapsed") {
  if (!guild?.id) return;
  if (CLEARED_GUILDS.has(String(guild.id))) return;
  await loadGuildState(guild.id);
  await withGuildLock(guild.id, async () => {
    const at = nowMs();
    const state = getGuildState(guild.id);
    pruneState(state, at);
    const isStillActive = Number(state.raidUntil || 0) > at;
    if (reason !== "force" && isStillActive) return;
    const code = String(state.raidCaseCode || "").trim();
    if (!code) return;
    const caughtCount = new Set(
      (Array.isArray(state.raidCaughtUserIds) ? state.raidCaughtUserIds : [])
        .map((x) => String(x || ""))
        .filter(Boolean),
    ).size;

    await sendJoinRaidLog(
      guild,
      "Join Raid Report!",
      [
        `${ARROW} **${caughtCount} users** have been caught by the join raid.`,
        `${ARROW} **Code:** \`${code}\``,
        `${ARROW} **Duration:** ${Math.round(Number(JOIN_RAID_CONFIG.raidDurationMs || 0) / 60_000)} minutes`,
      ],
      "#57F287",
    );

    state.raidUntil = 0;
    state.raidCaseCode = "";
    state.raidStartedAt = 0;
    state.raidInitialFlaggedUserIds = [];
    state.raidCaughtUserIds = [];
    scheduleStateSave(guild.id);
  });
}

function normalizeUsername(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function usernameSkeleton(input) {
  return normalizeUsername(input).replace(/\d+/g, "");
}

function countIdMatches(state, member, at = nowMs()) {
  if (!JOIN_RAID_CONFIG.idFlag.enabled) return 0;
  const createdAt = new Date(member.user.createdAt).getTime();
  const skeleton = usernameSkeleton(
    member.user.globalName || member.displayName || member.user.username,
  );

  let matches = 0;
  for (const sample of state.samples) {
    const delta = Math.abs(createdAt - Number(sample.createdAt || 0));
    const createdNear = delta <= JOIN_RAID_CONFIG.idFlag.createdAtDeltaMs;
    const nameNear =
      skeleton.length >= 4 &&
      sample.skeleton &&
      (sample.skeleton.startsWith(skeleton.slice(0, 4)) ||
        skeleton.startsWith(sample.skeleton.slice(0, 4)));
    if (createdNear || nameNear) matches += 1;
  }
  return matches;
}

function getRequiredIdMatches(state, at = nowMs()) {
  const base = Math.max(1, Number(JOIN_RAID_CONFIG.idFlag.minimumMatches || 4));
  const mode = String(JOIN_RAID_CONFIG.idFlag.categorization || "adaptive").toLowerCase();
  if (mode === "static") return base;
  const recentSamples = (Array.isArray(state?.samples) ? state.samples : []).filter(
    (sample) => at - Number(sample?.ts || 0) <= Number(JOIN_RAID_CONFIG.idFlag.compareWindowMs || 0),
  ).length;
  const algorithmicThreshold = Math.max(2, Math.min(10, Math.round(recentSamples / 6)));
  if (mode === "algorithm") return algorithmicThreshold;
  return Math.max(2, Math.min(base, algorithmicThreshold + 1));
}

function isNoPfp(member) {
  return !member?.user?.avatar;
}

function isTooYoung(member) {
  const ageMs = nowMs() - new Date(member.user.createdAt).getTime();
  return ageMs < JOIN_RAID_CONFIG.ageFlag.minimumAgeMs;
}

async function isVerifiedBotUser(user) {
  if (!user?.bot) return false;
  const key = String(user.id || "");
  if (!key) return false;
  if (VERIFIED_BOT_IDS.has(key)) return true;
  if (VERIFIED_BOT_CACHE.has(key)) return VERIFIED_BOT_CACHE.get(key);

  let verified = false;
  try {
    const flags =
      user.flags || (typeof user.fetchFlags === "function" ? await user.fetchFlags() : null);
    verified = Boolean(flags?.has?.(UserFlagsBitField.Flags.VerifiedBot));
  } catch {
    verified = false;
  }
  VERIFIED_BOT_CACHE.set(key, verified);
  return verified;
}

function getFlagReasons(state, member, at = nowMs()) {
  const reasons = [];
  if (JOIN_RAID_CONFIG.idFlag.enabled) {
    const matches = countIdMatches(state, member, at);
    const needed = getRequiredIdMatches(state, at);
    if (matches >= needed) {
      reasons.push({
        key: "id_flag",
        label: "ID Flag (Adaptive)",
        detail: `${matches} matches (need ${needed})`,
      });
    }
  }
  if (JOIN_RAID_CONFIG.noPfpFlag.enabled && isNoPfp(member)) {
    reasons.push({
      key: "no_pfp",
      label: "NoPFP Flag",
      detail: "No profile picture",
    });
  }
  if (JOIN_RAID_CONFIG.ageFlag.enabled && isTooYoung(member)) {
    reasons.push({
      key: "age_flag",
      label: "Age Flag",
      detail: "Account too young",
    });
  }
  return reasons;
}

function matchJoinRaidAccountType(member, reasons = []) {
  const accountType = String(JOIN_RAID_CONFIG.accountType || "any").toLowerCase();
  const keys = new Set((Array.isArray(reasons) ? reasons : []).map((x) => String(x?.key || "")));
  if (accountType === "any") return keys.size > 0;
  if (accountType === "young") return keys.has("age_flag");
  if (accountType === "no_pfp") return keys.has("no_pfp");
  if (accountType === "young_or_no_pfp") {
    return keys.has("age_flag") || keys.has("no_pfp");
  }
  if (accountType === "id_flag") return keys.has("id_flag");
  return keys.size > 0;
}

function isHighRiskJoinRaidReasons(reasons = []) {
  const keys = new Set((Array.isArray(reasons) ? reasons : []).map((x) => String(x?.key || "")));
  if (!keys.size) return false;
  // Treat only adaptive ID correlation as high-risk.
  // "young account" and "no pfp" alone are too noisy and can trigger false positives.
  return keys.has("id_flag");
}

async function resolveModLogChannel(guild) {
  const channelId = IDs.channels?.modLogs || IDs.channels?.activityLogs;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
}

async function sendJoinRaidLog(guild, title, lines, color = "#ED4245") {
  const channel = await resolveModLogChannel(guild);
  if (!channel?.isTextBased?.()) return;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(lines.filter(Boolean).join("\n"))
    .setTimestamp();
  await channel
    .send({
      content: HIGH_STAFF_MENTION || undefined,
      embeds: [embed],
      allowedMentions: HIGH_STAFF_MENTION
        ? { roles: [HIGH_STAFF_ROLE_ID] }
        : undefined,
    })
    .catch(() => {});
}

async function warnRaidRoles(guild, contentLines) {
  const mentionIds = new Set(
    [...JOIN_RAID_CONFIG.warnedRoleIds, HIGH_STAFF_ROLE_ID]
      .filter(Boolean)
      .map(String),
  );
  const roleMentions = [...mentionIds].map((id) => `<@&${id}>`);
  const channel = await resolveModLogChannel(guild);
  if (!channel?.isTextBased?.()) return;
  const content = [roleMentions.join(" "), ...contentLines].filter(Boolean).join("\n");
  await channel
    .send({
      content,
      allowedMentions: { roles: [...mentionIds] },
    })
    .catch(() => {});
}

async function sendPunishDm(member, action, reasons) {
  const readableAction =
    action === "ban"
      ? "banned"
      : action === "kick"
        ? "kicked"
        : action === "timeout"
          ? "timed out"
          : "flagged";
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`You have been ${readableAction} in ${member.guild.name}!`)
    .setDescription(
      [
        `${ARROW} **Member:** ${member.user} [\`${member.user.id}\`]`,
        `${ARROW} **Reason:** Join Raid protection triggered.`,
        `${ARROW} **Flags:** ${reasons.map((x) => x.label).join(", ") || "N/A"}`,
      ].join("\n"),
    );
  try {
    await member.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

function makeJoinRaidBanMarker(guildId, userId, unbanAt) {
  return `[JR:${String(guildId || "")}:${String(userId || "")}:${Number(unbanAt || 0)}]`;
}

function buildJoinRaidBanReason(marker = "") {
  const suffix = String(marker || "").trim();
  return suffix
    ? `Join Raid: flagged account during raid window ${suffix}`
    : "Join Raid: flagged account during raid window";
}

async function scheduleTempUnban(guild, userId, reason, marker = "") {
  const key = `${guild.id}:${userId}`;
  const old = TEMP_BAN_TIMERS.get(key);
  if (old) clearTimeout(old);
  const state = getGuildState(guild.id);
  const unbanAt = nowMs() + JOIN_RAID_CONFIG.raidDurationMs;
  const effectiveMarker =
    String(marker || "").trim() || makeJoinRaidBanMarker(guild.id, userId, unbanAt);
  state.tempBans = (state.tempBans || []).filter(
    (x) => String(x?.userId || "") !== String(userId),
  );
  state.tempBans.push({ userId: String(userId), unbanAt, marker: effectiveMarker });
  scheduleStateSave(guild.id);
  const timer = setTimeout(async () => {
    TEMP_BAN_TIMERS.delete(key);
    const shouldUnban = await shouldUnbanJoinRaidBan(guild, userId, effectiveMarker);
    if (shouldUnban) {
      await guild.members.unban(userId, reason).catch(() => {});
    }
    const current = getGuildState(guild.id);
    current.tempBans = (current.tempBans || []).filter(
      (x) => String(x?.userId || "") !== String(userId),
    );
    scheduleStateSave(guild.id);
  }, JOIN_RAID_CONFIG.raidDurationMs);
  if (typeof timer.unref === "function") timer.unref();
  TEMP_BAN_TIMERS.set(key, timer);
}

async function shouldUnbanJoinRaidBan(guild, userId, marker = "") {
  if (!guild?.id || !userId) return false;
  const ban = await guild.bans.fetch(String(userId)).catch(() => null);
  if (!ban) return false;
  const reason = String(ban?.reason || "").toLowerCase();
  const token = String(marker || "").trim().toLowerCase();
  if (token) return reason.includes(token);
  if (!reason) return false;
  return reason.includes("join raid:");
}

async function restoreTempBans(guild, options = {}) {
  if (!guild?.id) return;
  const force = Boolean(options?.force);
  const at = nowMs();
  const guildId = String(guild.id);
  const lastAt = Number(LAST_RESTORE_AT.get(guildId) || 0);
  if (!force && at - lastAt < RESTORE_COOLDOWN_MS) return;
  LAST_RESTORE_AT.set(guildId, at);

  await loadGuildState(guild.id);
  const state = getGuildState(guild.id);
  const allTempBans = Array.isArray(state.tempBans) ? [...state.tempBans] : [];
  const expiredRows = allTempBans.filter(
    (row) =>
      String(row?.userId || "").trim().length > 0 &&
      Number(row?.unbanAt || 0) > 0 &&
      Number(row?.unbanAt || 0) <= at,
  );
  if (expiredRows.length) {
    for (const row of expiredRows) {
      const userId = String(row?.userId || "").trim();
      if (!userId) continue;
      const shouldUnban = await shouldUnbanJoinRaidBan(
        guild,
        userId,
        String(row?.marker || ""),
      );
      if (shouldUnban) {
        await guild.members
          .unban(userId, "Join Raid temporary ban elapsed (restored late)")
          .catch(() => {});
      }
    }
  }

  const beforeTempBans = allTempBans.length;
  state.tempBans = allTempBans.filter(
    (row) =>
      String(row?.userId || "").trim().length > 0 &&
      Number(row?.unbanAt || 0) > at,
  );
  pruneState(state, at);
  if (beforeTempBans !== state.tempBans.length || expiredRows.length) {
    scheduleStateSave(guild.id);
  }
  if (!state.tempBans.length) return;

  for (const row of state.tempBans) {
    const userId = String(row?.userId || "");
    const unbanAt = Number(row?.unbanAt || 0);
    if (!userId || unbanAt <= at) continue;
    const key = `${guild.id}:${userId}`;
    if (TEMP_BAN_TIMERS.has(key)) continue;
    const timer = setTimeout(async () => {
      TEMP_BAN_TIMERS.delete(key);
      const shouldUnban = await shouldUnbanJoinRaidBan(
        guild,
        userId,
        String(row?.marker || ""),
      );
      if (shouldUnban) {
        await guild.members
          .unban(userId, "Join Raid temporary ban elapsed (restored)")
          .catch(() => {});
      }
      const current = getGuildState(guild.id);
      current.tempBans = (current.tempBans || []).filter(
        (x) => String(x?.userId || "") !== String(userId),
      );
      scheduleStateSave(guild.id);
    }, Math.max(1_000, unbanAt - at));
    if (typeof timer.unref === "function") timer.unref();
    TEMP_BAN_TIMERS.set(key, timer);
  }
}

async function applyPunishment(member, reasons) {
  const configuredAction = String(JOIN_RAID_CONFIG.triggerAction || "log").toLowerCase();
  const action = ["ban", "kick", "timeout", "log"].includes(configuredAction)
    ? configuredAction
    : "log";
  const guild = member.guild;
  const me = guild.members.me;
  const canBan =
    Boolean(me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) &&
    Boolean(member?.bannable);
  const canKick =
    Boolean(me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) &&
    Boolean(member?.kickable);
  const canTimeout =
    Boolean(me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) &&
    Boolean(member?.moderatable);

  let punished = false;
  let appliedAction = action;
  if (action === "ban") {
    if (canBan) {
      const marker = makeJoinRaidBanMarker(
        guild.id,
        member.id,
        nowMs() + JOIN_RAID_CONFIG.raidDurationMs,
      );
      punished = await guild.members
        .ban(member.id, {
          deleteMessageSeconds: 0,
          reason: buildJoinRaidBanReason(marker),
        })
        .then(() => true)
        .catch((err) => {
          global.logger?.warn?.("[joinRaid] applyPunishment ban failed:", guild.id, member.id, err?.message || err);
          return false;
        });
      if (punished) {
        await scheduleTempUnban(
          guild,
          member.id,
          "Join Raid temporary ban elapsed",
          marker,
        );
      }
    }
  } else if (action === "kick") {
    if (canKick) {
      punished = await member
        .kick("Join Raid: flagged account during raid window")
        .then(() => true)
        .catch((err) => {
          global.logger?.warn?.("[joinRaid] applyPunishment kick failed:", guild.id, member.id, err?.message || err);
          return false;
        });
    }
  } else if (action === "timeout") {
    if (canTimeout) {
      const timeoutMs = Math.max(10 * 60_000, JOIN_RAID_CONFIG.raidDurationMs);
      punished = await member
        .timeout(timeoutMs, "Join Raid: flagged account during raid window")
        .then(() => true)
        .catch((err) => {
          global.logger?.warn?.("[joinRaid] applyPunishment timeout failed:", guild.id, member.id, err?.message || err);
          return false;
        });
    }
  }

  if (!punished && action !== "log") {
    if (canTimeout) {
      const timeoutMs = Math.max(10 * 60_000, JOIN_RAID_CONFIG.raidDurationMs);
      punished = await member
        .timeout(timeoutMs, "Join Raid: punitive fallback timeout")
        .then(() => true)
        .catch((err) => {
          global.logger?.warn?.("[joinRaid] applyPunishment fallback timeout failed:", guild.id, member.id, err?.message || err);
          return false;
        });
      if (punished) {
        appliedAction = "timeout";
      } else {
        appliedAction = "log";
      }
    } else {
      appliedAction = "log";
    }
  }
  const dmSent =
    punished && appliedAction !== "log"
      ? await sendPunishDm(member, appliedAction, reasons)
      : false;
  const actionWord =
    appliedAction === "ban"
      ? "banned"
      : appliedAction === "kick"
        ? "kicked"
        : appliedAction === "timeout"
          ? "timed out"
        : "flagged";

  await sendJoinRaidLog(
    guild,
    `${member.user.username} has been ${actionWord} by Join Raid!`,
    [
      `${ARROW} **JoinRaid Filter:** ${reasons.map((x) => x.label).join(", ") || "N/A"}`,
      `${ARROW} **Member:** ${member.user} [\`${member.id}\`]`,
      `${ARROW} **Action:** ${appliedAction}${punished ? "" : " (fallback)"}`,
      `${ARROW} **Can Ban:** ${canBan ? "Yes" : "No"} | **Can Kick:** ${canKick ? "Yes" : "No"} | **Can Timeout:** ${canTimeout ? "Yes" : "No"}`,
      appliedAction === "ban"
        ? `${ARROW} **Duration:** ${Math.round(
            JOIN_RAID_CONFIG.raidDurationMs / 60_000,
          )} minutes`
        : null,
      `${ARROW} **DM Sent:** ${dmSent ? "Yes" : "No"}`,
      `${ARROW} **Punished:** ${punished ? "Yes" : "No"}`,
    ],
    punished ? "#ED4245" : "#F59E0B",
  );
  return { punished, appliedAction };
}

async function processJoinRaidForMember(member, options = {}) {
  const joinGateFeedOnly = Boolean(options?.joinGateFeedOnly);
  if (!JOIN_RAID_CONFIG.enabled) return { blocked: false };
  if (!member?.guild || !member?.user) return { blocked: false };
  const guildKey = String(member.guild.id || "");
  if (CLEARED_GUILDS.has(guildKey)) return { blocked: false };
  if (member.user?.bot) return { blocked: false };
  if (
    CORE_EXEMPT_USER_IDS.has(String(member.id || "")) ||
    String(member.guild.ownerId || "") === String(member.id || "") ||
    isSecurityProfileImmune(String(member.guild?.id || ""), String(member.id || "")) ||
    hasAdminsProfileCapability(member, "fullImmunity")
  ) {
    return { blocked: false };
  }

  await loadGuildState(member.guild.id);
  await restoreTempBans(member.guild);
  return withGuildLock(member.guild.id, async () => {
    const at = nowMs();
    const state = getGuildState(member.guild.id);
    for (const [key, ts] of LOW_RISK_FLAG_LOG_COOLDOWN.entries()) {
      if (Number(ts || 0) + LOW_RISK_FLAG_LOG_COOLDOWN_MS < at) {
        LOW_RISK_FLAG_LOG_COOLDOWN.delete(key);
      }
    }
    pruneState(state, at);
    if (Number(state.raidUntil || 0) > 0 && Number(state.raidUntil || 0) <= at) {
      await finalizeJoinRaidAndReport(member.guild, "elapsed");
      pruneState(state, at);
    }

    const sample = {
      ts: at,
      userId: String(member.id),
      createdAt: new Date(member.user.createdAt).getTime(),
      skeleton: usernameSkeleton(
        member.user.globalName || member.displayName || member.user.username,
      ),
    };

    const reasons = getFlagReasons(state, member, at);
    state.samples.push(sample);

    const highRisk = isHighRiskJoinRaidReasons(reasons);
    const qualifiesForTrigger = matchJoinRaidAccountType(member, reasons);
    if (qualifiesForTrigger) {
      state.flagged.push({
        ts: at,
        userId: String(member.id),
        reasons: reasons.map((x) => x.key),
      });
    }
    pruneState(state, at);
    scheduleStateSave(member.guild.id);

    const flaggedCount = state.flagged.length;
    const uniqueFlaggedUsers = new Set(
      state.flagged.map((x) => String(x?.userId || "")).filter(Boolean),
    ).size;
    const triggerCountNow =
      String(JOIN_RAID_CONFIG.triggerType || "unique") === "events"
        ? flaggedCount
        : uniqueFlaggedUsers;
    const wasActive = Number(state.raidUntil || 0) > at;
    if (!wasActive && triggerCountNow >= JOIN_RAID_CONFIG.triggerCount) {
      state.raidUntil = at + JOIN_RAID_CONFIG.raidDurationMs;
      state.raidStartedAt = at;
      state.raidCaseCode = makeJoinRaidCaseCode();
      state.raidCaughtUserIds = [];
      state.raidInitialFlaggedUserIds = Array.from(
        new Set(
          state.flagged
            .map((x) => String(x?.userId || ""))
            .filter(Boolean),
        ),
      ).slice(-8);
      const untilTs = Math.floor(state.raidUntil / 1000);
      if (!joinGateFeedOnly) {
        triggerAutoModPanicExternal(
          member.guild.id,
          member.id,
          { raidBoost: 1, activityBoost: 0 },
          at,
        );
      }
      const initialFlags = buildInitialFlagRows(member.guild, state, 8);
      const actionVerb =
        JOIN_RAID_CONFIG.triggerAction === "ban"
          ? "banned"
          : JOIN_RAID_CONFIG.triggerAction === "kick"
            ? "kicked"
            : JOIN_RAID_CONFIG.triggerAction === "timeout"
              ? "timed out"
              : "logged";
      await warnRaidRoles(member.guild, [
        `Join Raid triggered: **${triggerCountNow}** flagged ${
          String(JOIN_RAID_CONFIG.triggerType || "unique") === "events"
            ? "events"
            : "users"
        } in the last **${formatRaidHours(
          JOIN_RAID_CONFIG.triggerWindowMs,
        )}h**.`,
        `Raid protection active until <t:${untilTs}:F>.`,
      ]);
      await sendJoinRaidLog(
        member.guild,
        "Join Raid Trigger!",
        [
          `${ARROW} Wick has identified a weird join pattern.`,
          `${ARROW} Flagged accounts joining for the next **${Math.round(JOIN_RAID_CONFIG.raidDurationMs / 60_000)}m** will be **${actionVerb}**.`,
          `${ARROW} A full report will be posted once the duration ends.`,
          "",
          "**Initial Flags:**",
          ...(initialFlags.length ? initialFlags : ["`No record found.`"]),
          "",
          `**Code:** \`${state.raidCaseCode}\``,
        ],
        "#ED4245",
      );
      scheduleJoinRaidReport(member.guild);
      scheduleStateSave(member.guild.id);
    }

    const active = Number(state.raidUntil || 0) > at;
    const reasonKeys = new Set(reasons.map((x) => String(x?.key || "")));
    const strongEvidence =
      reasonKeys.has("id_flag") ||
      (reasonKeys.has("age_flag") && reasonKeys.has("no_pfp"));
    const punishableDuringRaid =
      JOIN_RAID_CONFIG.punishOnActiveRaid &&
      reasons.length > 0 &&
      matchJoinRaidAccountType(member, reasons) &&
      (highRisk || strongEvidence || String(JOIN_RAID_CONFIG.accountType || "any") !== "id_flag");
    if (active && punishableDuringRaid) {
      if (!joinGateFeedOnly) {
        triggerAutoModPanicExternal(
          member.guild.id,
          member.id,
          { raidBoost: 0 },
          at,
        );
      }
      if (joinGateFeedOnly) {
        state.raidCaughtUserIds.push(String(member.id));
        state.raidCaughtUserIds = Array.from(
          new Set(state.raidCaughtUserIds.map((x) => String(x || "")).filter(Boolean)),
        ).slice(-300);
        scheduleStateSave(member.guild.id);
        return { blocked: false, flagged: true, reasons };
      }
      const outcome = await applyPunishment(member, reasons);
      if (Boolean(outcome?.punished)) {
        state.raidCaughtUserIds.push(String(member.id));
        state.raidCaughtUserIds = Array.from(
          new Set(state.raidCaughtUserIds.map((x) => String(x || "")).filter(Boolean)),
        ).slice(-300);
        scheduleStateSave(member.guild.id);
      }
      return {
        blocked: true,
        punished: Boolean(outcome?.punished),
        action: outcome?.appliedAction || JOIN_RAID_CONFIG.triggerAction,
        reasons,
      };
    }
    if (active && reasons.length > 0) {
      const cooldownKey = `${member.guild.id}:${member.id}`;
      const lastSentAt = Number(LOW_RISK_FLAG_LOG_COOLDOWN.get(cooldownKey) || 0);
      if (at - lastSentAt >= LOW_RISK_FLAG_LOG_COOLDOWN_MS) {
        LOW_RISK_FLAG_LOG_COOLDOWN.set(cooldownKey, at);
        await sendJoinRaidLog(
          member.guild,
          "Join Raid flagged account",
          [
            `${ARROW} **Member:** ${member.user} [\`${member.id}\`]`,
            `${ARROW} **Reasons:** ${reasons.map((x) => x.label).join(", ") || "N/A"}`,
            `${ARROW} **Action:** \`log\``,
          ],
          "#F59E0B",
        );
      }
    }
    return { blocked: false, flagged: reasons.length > 0, reasons };
  });
}

async function activateJoinRaidWindow(
  guild,
  reason = "Security escalation",
  minDurationMs = 0,
) {
  if (!guild?.id) return { ok: false, reason: "missing_guild" };
  await loadGuildState(guild.id);
  return withGuildLock(guild.id, async () => {
    const at = nowMs();
    const state = getGuildState(guild.id);
    pruneState(state, at);
    const currentUntil = Number(state.raidUntil || 0);
    const requestedDuration = Math.max(
      Number(JOIN_RAID_CONFIG.raidDurationMs || 0),
      Number(minDurationMs || 0),
    );
    const safeDuration = Math.max(60_000, requestedDuration);
    const targetUntil = at + safeDuration;
    const wasActive = currentUntil > at;
    const changed = !wasActive || targetUntil > currentUntil;
    if (!changed) {
      return { ok: true, activated: false, raidUntil: currentUntil };
    }
    state.raidUntil = Math.max(currentUntil, targetUntil);
    if (!wasActive) {
      state.raidStartedAt = at;
      state.raidCaseCode = makeJoinRaidCaseCode();
      state.raidCaughtUserIds = [];
      state.raidInitialFlaggedUserIds = [];
    }
    scheduleStateSave(guild.id);
    const untilTs = Math.floor(state.raidUntil / 1000);
    if (!wasActive) {
      await warnRaidRoles(guild, [
        `Join Raid attivato da escalation sicurezza.`,
        `Protezione raid attiva fino a <t:${untilTs}:F>.`,
      ]);
    }
    await sendJoinRaidLog(
      guild,
      "Join Raid escalation attivata",
      [
        `${ARROW} **Reason:** ${String(reason || "Security escalation")}`,
        `${ARROW} **Code:** \`${state.raidCaseCode || "N/A"}\``,
        `${ARROW} **Raid Duration:** ${Math.round(
          safeDuration / 60_000,
        )} minutes`,
        `${ARROW} **Raid Until:** <t:${untilTs}:F>`,
      ],
      "#ED4245",
    );
    scheduleJoinRaidReport(guild);
    return { ok: true, activated: !wasActive, raidUntil: state.raidUntil };
  });
}

async function registerJoinRaidSecuritySignal(member, options = {}) {
  if (!member?.guild?.id || !member?.id) return { ok: false, reason: "missing_member" };
  const at = nowMs();
  const enableAntiNuke = Boolean(options.enableAntiNuke);
  const enableAutoMod = options.enableAutoMod === true;
  const heat = Math.max(0, Number(options.antiNukeHeat || 0));
  const reason = String(options.reason || "Join Gate security signal");
  const raidBoost = Math.max(0, Math.min(2, Math.floor(Number(options.raidBoost || 0))));
  if (enableAntiNuke && heat > 0) {
    await triggerAntiNukePanicExternal(member.guild, reason, heat).catch(() => null);
  }
  if (!enableAutoMod) return { ok: true, panic: { activated: false, active: false, count: 0 } };
  const panic = triggerAutoModPanicExternal(member.guild.id, member.id, { raidBoost, activityBoost: 0 }, at);
  return { ok: true, panic };
}

function applyJoinRaidPreset(name = "balanced") {
  const presetKey = String(name || "").toLowerCase();
  const preset = JOIN_RAID_PRESETS[presetKey];
  if (!preset) return { ok: false, reason: "invalid_preset" };
  JOIN_RAID_CONFIG.triggerAction = String(
    preset.triggerAction || JOIN_RAID_CONFIG.triggerAction,
  );
  JOIN_RAID_CONFIG.triggerType = String(
    preset.triggerType || JOIN_RAID_CONFIG.triggerType,
  );
  JOIN_RAID_CONFIG.accountType = String(
    preset.accountType || JOIN_RAID_CONFIG.accountType,
  );
  JOIN_RAID_CONFIG.punishOnActiveRaid =
    typeof preset.punishOnActiveRaid === "boolean"
      ? preset.punishOnActiveRaid
      : JOIN_RAID_CONFIG.punishOnActiveRaid;
  JOIN_RAID_CONFIG.triggerCount = Number(
    preset.triggerCount || JOIN_RAID_CONFIG.triggerCount,
  );
  JOIN_RAID_CONFIG.triggerWindowMs = Number(
    preset.triggerWindowMs || JOIN_RAID_CONFIG.triggerWindowMs,
  );
  JOIN_RAID_CONFIG.raidDurationMs = Number(
    preset.raidDurationMs || JOIN_RAID_CONFIG.raidDurationMs,
  );
  JOIN_RAID_CONFIG.idFlag.minimumMatches = Number(
    preset.idFlag?.minimumMatches || JOIN_RAID_CONFIG.idFlag.minimumMatches,
  );
  JOIN_RAID_CONFIG.idFlag.compareWindowMs = Number(
    preset.idFlag?.compareWindowMs || JOIN_RAID_CONFIG.idFlag.compareWindowMs,
  );
  JOIN_RAID_CONFIG.idFlag.createdAtDeltaMs = Number(
    preset.idFlag?.createdAtDeltaMs || JOIN_RAID_CONFIG.idFlag.createdAtDeltaMs,
  );
  JOIN_RAID_CONFIG.ageFlag.minimumAgeMs = Number(
    preset.ageFlag?.minimumAgeMs || JOIN_RAID_CONFIG.ageFlag.minimumAgeMs,
  );
  saveJoinRaidPersistentConfig();
  return { ok: true, preset: presetKey };
}

async function getJoinRaidStatusSnapshot(guildId) {
  const key = String(guildId || "");
  if (!key) return null;
  await loadGuildState(key);
  const at = nowMs();
  const state = getGuildState(key);
  pruneState(state, at);
  return {
    enabled: Boolean(JOIN_RAID_CONFIG.enabled),
    raidActive: Number(state.raidUntil || 0) > at,
    raidUntil: Number(state.raidUntil || 0),
    raidRemainingMs: Math.max(0, Number(state.raidUntil || 0) - at),
    flaggedRecent: Array.isArray(state.flagged) ? state.flagged.length : 0,
    uniqueFlaggedRecent: new Set(
      (Array.isArray(state.flagged) ? state.flagged : [])
        .map((row) => String(row?.userId || "").trim())
        .filter(Boolean),
    ).size,
    samplesRecent: Array.isArray(state.samples) ? state.samples.length : 0,
    tempBans: Array.isArray(state.tempBans) ? state.tempBans.length : 0,
    raidCaseCode: String(state.raidCaseCode || ""),
    raidCaughtCount: new Set(
      (Array.isArray(state.raidCaughtUserIds) ? state.raidCaughtUserIds : [])
        .map((x) => String(x || ""))
        .filter(Boolean),
    ).size,
    config: {
      triggerAction: JOIN_RAID_CONFIG.triggerAction,
      triggerType: JOIN_RAID_CONFIG.triggerType,
      accountType: JOIN_RAID_CONFIG.accountType,
      punishOnActiveRaid: Boolean(JOIN_RAID_CONFIG.punishOnActiveRaid),
      triggerCount: Number(JOIN_RAID_CONFIG.triggerCount || 0),
      triggerWindowMs: Number(JOIN_RAID_CONFIG.triggerWindowMs || 0),
      raidDurationMs: Number(JOIN_RAID_CONFIG.raidDurationMs || 0),
      warnedRoleIds: [...new Set((JOIN_RAID_CONFIG.warnedRoleIds || []).map(String).filter(Boolean))],
      idFlag: {
        enabled: Boolean(JOIN_RAID_CONFIG.idFlag.enabled),
        categorization: String(JOIN_RAID_CONFIG.idFlag.categorization || "adaptive"),
        minimumMatches: Number(JOIN_RAID_CONFIG.idFlag.minimumMatches || 0),
      },
      noPfpFlag: { enabled: Boolean(JOIN_RAID_CONFIG.noPfpFlag.enabled) },
      ageFlag: {
        enabled: Boolean(JOIN_RAID_CONFIG.ageFlag.enabled),
        minimumAgeMs: Number(JOIN_RAID_CONFIG.ageFlag.minimumAgeMs || 0),
      },
    },
  };
}

function clearGuildState(guildId) {
  const key = String(guildId || "");
  if (!key) return;
  CLEARED_GUILDS.add(key);
  GUILD_STATE.delete(key);
  LOADED_GUILDS.delete(key);
  LOAD_SUCCEEDED_GUILDS.delete(key);
  const saveTimer = SAVE_TIMERS.get(key);
  if (saveTimer) {
    clearTimeout(saveTimer);
    SAVE_TIMERS.delete(key);
  }
  RAID_REPORT_TIMERS.delete(key);
  LOAD_GUILD_PROMISES.delete(key);
  GUILD_LOCKS.delete(key);
  LAST_RESTORE_AT.delete(key);
  const tempBanKeys = [...TEMP_BAN_TIMERS.keys()].filter((k) => k.startsWith(`${key}:`));
  for (const timerKey of tempBanKeys) {
    const t = TEMP_BAN_TIMERS.get(timerKey);
    if (t) clearTimeout(t);
    TEMP_BAN_TIMERS.delete(timerKey);
  }
  const cooldownKeys = [...LOW_RISK_FLAG_LOG_COOLDOWN.keys()].filter((k) => k.startsWith(`${key}:`));
  for (const cooldownKey of cooldownKeys) {
    LOW_RISK_FLAG_LOG_COOLDOWN.delete(cooldownKey);
  }
}

module.exports = {
  JOIN_RAID_CONFIG,
  JOIN_RAID_PRESETS,
  getJoinRaidConfigSnapshot,
  setJoinRaidConfigSnapshot,
  processJoinRaidForMember,
  activateJoinRaidWindow,
  registerJoinRaidSecuritySignal,
  restoreTempBans,
  applyJoinRaidPreset,
  getJoinRaidStatusSnapshot,
  clearGuildState,
};
