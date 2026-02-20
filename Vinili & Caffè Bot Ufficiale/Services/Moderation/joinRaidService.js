const { EmbedBuilder, PermissionsBitField, UserFlagsBitField, } = require("discord.js");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const JoinRaidState = require("../../Schemas/Moderation/joinRaidStateSchema");

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
  triggerAction: "kick", // ban | kick | log
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
    triggerAction: "ban",
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
const SAVE_TIMERS = new Map();
const LOADED_GUILDS = new Set();
const LOAD_GUILD_PROMISES = new Map();
const GUILD_LOCKS = new Map();
const LAST_RESTORE_AT = new Map();
const VERIFIED_BOT_CACHE = new Map();
const RESTORE_COOLDOWN_MS = 45_000;
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
    if (["ban", "kick", "log"].includes(action)) {
      JOIN_RAID_CONFIG.triggerAction = action;
    }
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
  Object.assign(JOIN_RAID_CONFIG.idFlag, raw.idFlag || {});
  Object.assign(JOIN_RAID_CONFIG.noPfpFlag, raw.noPfpFlag || {});
  Object.assign(JOIN_RAID_CONFIG.ageFlag, raw.ageFlag || {});
  JOIN_RAID_CONFIG.idFlag.enabled =
    typeof JOIN_RAID_CONFIG.idFlag.enabled === "boolean"
      ? JOIN_RAID_CONFIG.idFlag.enabled
      : true;
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
    triggerCount: Number(JOIN_RAID_CONFIG.triggerCount || 0),
    triggerWindowMs: Number(JOIN_RAID_CONFIG.triggerWindowMs || 0),
    raidDurationMs: Number(JOIN_RAID_CONFIG.raidDurationMs || 0),
    idFlag: { ...JOIN_RAID_CONFIG.idFlag },
    noPfpFlag: { ...JOIN_RAID_CONFIG.noPfpFlag },
    ageFlag: { ...JOIN_RAID_CONFIG.ageFlag },
  });
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
  if (!key || LOADED_GUILDS.has(key)) return;
  if (!isDbReady()) return;
  const existingLoad = LOAD_GUILD_PROMISES.get(key);
  if (existingLoad) {
    await existingLoad;
    return;
  }
  const loader = (async () => {
    try {
      const row = await JoinRaidState.findOne({ guildId: key }).lean();
      if (row) {
        GUILD_STATE.set(key, {
          samples: Array.isArray(row.samples) ? row.samples : [],
          flagged: Array.isArray(row.flagged) ? row.flagged : [],
          tempBans: Array.isArray(row.tempBans) ? row.tempBans : [],
          raidUntil: Number(row.raidUntil || 0),
        });
      }
      LOADED_GUILDS.add(key);
    } catch {
      // Do not block runtime if persistence fails.
    } finally {
      LOAD_GUILD_PROMISES.delete(key);
    }
  })();
  LOAD_GUILD_PROMISES.set(key, loader);
  await loader;
}

function scheduleStateSave(guildId) {
  const key = String(guildId || "");
  if (!key || !isDbReady()) return;
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
          },
        },
        { upsert: true },
      );
    } catch {
      // Do not block runtime if persistence fails.
    }
  }, 1_500);
  SAVE_TIMERS.set(key, timer);
}

function pruneState(state, at = nowMs()) {
  const minSampleTs = at - JOIN_RAID_CONFIG.idFlag.compareWindowMs;
  const minFlagTs = at - JOIN_RAID_CONFIG.triggerWindowMs;
  state.samples = state.samples.filter((x) => Number(x?.ts || 0) >= minSampleTs);
  state.flagged = state.flagged.filter((x) => Number(x?.ts || 0) >= minFlagTs);
  if (!Array.isArray(state.tempBans)) state.tempBans = [];
  state.tempBans = state.tempBans.filter(
    (x) =>
      String(x?.userId || "").length > 0 &&
      Number(x?.unbanAt || 0) > at,
  );
  if (Number(state.raidUntil || 0) <= at) state.raidUntil = 0;
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
    if (matches >= JOIN_RAID_CONFIG.idFlag.minimumMatches) {
      reasons.push({
        key: "id_flag",
        label: "ID Flag (Adaptive)",
        detail: `${matches} matches`,
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

function isHighRiskJoinRaidReasons(reasons = []) {
  const keys = new Set((Array.isArray(reasons) ? reasons : []).map((x) => String(x?.key || "")));
  if (!keys.size) return false;
  if (keys.has("id_flag")) return true;
  if (keys.has("age_flag") && keys.has("no_pfp")) return true;
  return false;
}

async function resolveModLogChannel(guild) {
  const channelId = IDs.channels.modLogs || IDs.channels.activityLogs;
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
  const action = ["ban", "kick", "log"].includes(configuredAction)
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
        .catch(() => false);
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
        .catch(() => false);
    }
  }

  if (!punished && action !== "log") {
    if (canTimeout) {
      const timeoutMs = Math.max(10 * 60_000, JOIN_RAID_CONFIG.raidDurationMs);
      punished = await member
        .timeout(timeoutMs, "Join Raid: punitive fallback timeout")
        .then(() => true)
        .catch(() => false);
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

async function processJoinRaidForMember(member) {
  if (!JOIN_RAID_CONFIG.enabled) return { blocked: false };
  if (!member?.guild || !member?.user) return { blocked: false };
  if (member.user?.bot) return { blocked: false };
  if (
    CORE_EXEMPT_USER_IDS.has(String(member.id || "")) ||
    String(member.guild.ownerId || "") === String(member.id || "")
  ) {
    return { blocked: false };
  }

  await loadGuildState(member.guild.id);
  await restoreTempBans(member.guild);
  return withGuildLock(member.guild.id, async () => {
    const at = nowMs();
    const state = getGuildState(member.guild.id);
    pruneState(state, at);

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
    if (highRisk) {
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
    const wasActive = Number(state.raidUntil || 0) > at;
    if (!wasActive && uniqueFlaggedUsers >= JOIN_RAID_CONFIG.triggerCount) {
      state.raidUntil = at + JOIN_RAID_CONFIG.raidDurationMs;
      const untilTs = Math.floor(state.raidUntil / 1000);
      await warnRaidRoles(member.guild, [
        `Join Raid triggered: **${uniqueFlaggedUsers}** unique flagged users in the last **${formatRaidHours(
          JOIN_RAID_CONFIG.triggerWindowMs,
        )}h**.`,
        `Raid protection active until <t:${untilTs}:F>.`,
      ]);
      await sendJoinRaidLog(
        member.guild,
        "Join Raid protection enabled",
        [
          `${ARROW} **Trigger Count:** ${uniqueFlaggedUsers}/${JOIN_RAID_CONFIG.triggerCount}`,
          `${ARROW} **Flagged Events:** ${flaggedCount}`,
          `${ARROW} **Window:** ${formatRaidHours(
            JOIN_RAID_CONFIG.triggerWindowMs,
          )} hours`,
          `${ARROW} **Raid Duration:** ${Math.round(
            JOIN_RAID_CONFIG.raidDurationMs / 60_000,
          )} minutes`,
          `${ARROW} **Action:** ${JOIN_RAID_CONFIG.triggerAction}`,
        ],
        "#ED4245",
      );
      scheduleStateSave(member.guild.id);
    }

    const active = Number(state.raidUntil || 0) > at;
    if (active && highRisk && reasons.length > 0) {
      const outcome = await applyPunishment(member, reasons);
      return {
        blocked: true,
        punished: Boolean(outcome?.punished),
        action: outcome?.appliedAction || JOIN_RAID_CONFIG.triggerAction,
        reasons,
      };
    }
    if (active && reasons.length > 0) {
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
    return { blocked: false, flagged: reasons.length > 0, reasons };
  });
}

function applyJoinRaidPreset(name = "balanced") {
  const presetKey = String(name || "").toLowerCase();
  const preset = JOIN_RAID_PRESETS[presetKey];
  if (!preset) return { ok: false, reason: "invalid_preset" };
  JOIN_RAID_CONFIG.triggerAction = String(
    preset.triggerAction || JOIN_RAID_CONFIG.triggerAction,
  );
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
    config: {
      triggerAction: JOIN_RAID_CONFIG.triggerAction,
      triggerCount: Number(JOIN_RAID_CONFIG.triggerCount || 0),
      triggerWindowMs: Number(JOIN_RAID_CONFIG.triggerWindowMs || 0),
      raidDurationMs: Number(JOIN_RAID_CONFIG.raidDurationMs || 0),
      idFlag: {
        enabled: Boolean(JOIN_RAID_CONFIG.idFlag.enabled),
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

module.exports = {
  JOIN_RAID_CONFIG,
  JOIN_RAID_PRESETS,
  processJoinRaidForMember,
  restoreTempBans,
  applyJoinRaidPreset,
  getJoinRaidStatusSnapshot,
};
