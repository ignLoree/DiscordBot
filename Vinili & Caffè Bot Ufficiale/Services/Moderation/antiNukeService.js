const { EmbedBuilder, PermissionsBitField, OverwriteType, UserFlagsBitField, } = require("discord.js");
const fs = require("fs");
const path = require("path");
const IDs = require("../../Utils/Config/ids");
const UNKNOWN_EXECUTOR_ID = "__unknown_audit_executor__";
const HIGH_STAFF_MENTION = IDs.roles?.HighStaff
  ? `<@&${IDs.roles.HighStaff}>`
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

const DANGEROUS_PERMS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
];

const DANGEROUS_CHANNEL_PERMS = [
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.ManageMessages,
  PermissionsBitField.Flags.MentionEveryone,
];
const KICK_BAN_TRACKER = new Map();
const ROLE_CREATION_TRACKER = new Map();
const ROLE_DELETION_TRACKER = new Map();
const CHANNEL_CREATION_TRACKER = new Map();
const CHANNEL_DELETION_TRACKER = new Map();
const WEBHOOK_CREATION_TRACKER = new Map();
const WEBHOOK_DELETION_TRACKER = new Map();
const INVITE_CREATION_TRACKER = new Map();
const ANTINUKE_PANIC_STATE = new Map();
const QUARANTINE_ROLE_TIMERS = new Map();
const VERIFIED_BOT_CACHE = new Map();
const ANTINUKE_LOG_DEDUPE = new Map();
const ANTINUKE_LOG_DEDUPE_TTL_MS = 12_000;
const ACTION_EVENT_DEDUPE = new Map();
const ACTION_EVENT_DEDUPE_TTL_MS = 3_500;
const ACTION_EVENT_DEDUPE_NO_TARGET_TTL_MS = 900;
const GUILD_BURST_TRACKER = new Map();
const GUILD_BURST_WINDOW_MS = 20_000;
const GUILD_BURST_TRIGGER_HEAT = 160;
const GUILD_BURST_COOLDOWN_MS = 30_000;
const PANIC_EXECUTOR_COOLDOWN = new Map();
const PANIC_EXECUTOR_COOLDOWN_MS = 20_000;
const MAINTENANCE_ALLOWLIST = new Map();
const MAINTENANCE_MAX_MS = 2 * 60 * 60_000;
const ANTINUKE_CONFIG_PATH = path.resolve(
  __dirname,
  "../../Utils/Config/antiNukeConfig.json",
);

const ANTINUKE_CONFIG = {
  enabled: true,
  detectPrune: false,
  vanityGuard: true,
  autoQuarantine: {
    enabled: true,
    strictMode: true,
    strictMemberRoleAddition: true,
    monitorPublicRoles: true,
    monitorChannelPermissions: true,
    quarantineRoleId: "1442568884833095832",
    quarantineTimeoutMs: 24 * 60 * 60_000,
    whitelistUserIds: new Set([
      "610531025470095390", // _diunk_
      "700814270069342339", // buffphantasm10
      "1466495522474037463", // test bot
      "1329118940110127204", // official bot
    ]),
  },
  kickBanFilter: {
    enabled: true,
    minuteLimit: 5,
    hourLimit: 15,
    heatPerAction: 20,
  },
  roleCreationFilter: {
    enabled: true,
    minuteLimit: 5,
    hourLimit: 15,
    heatPerAction: 10,
  },
  roleDeletionFilter: {
    enabled: true,
    minuteLimit: 3,
    hourLimit: 10,
    heatPerAction: 25,
  },
  channelCreationFilter: {
    enabled: true,
    minuteLimit: 4,
    hourLimit: 12,
    heatPerAction: 16,
  },
  channelDeletionFilter: {
    enabled: true,
    minuteLimit: 3,
    hourLimit: 8,
    heatPerAction: 25,
  },
  webhookCreationFilter: {
    enabled: true,
    minuteLimit: 3,
    hourLimit: 10,
    heatPerAction: 15,
  },
  webhookDeletionFilter: {
    enabled: true,
    minuteLimit: 3,
    hourLimit: 8,
    heatPerAction: 10,
  },
  inviteCreationFilter: {
    enabled: true,
    minuteLimit: 4,
    hourLimit: 15,
    heatPerAction: 12,
  },
  panicMode: {
    enabled: true,
    useHeatAlgorithm: true,
    thresholdHeat: 100,
    decayPerSec: 5,
    durationMs: 10 * 60_000,
    maxDurationMs: 45 * 60_000,
    extendByMsOnTrigger: 2 * 60_000,
    lockdown: {
      dangerousRoles: true,
      unlockDangerousRolesOnFinish: true,
      lockModerationCommands: true,
      roleAllowlistIds: new Set([]),
    },
    warnedRoleIds: new Set([
      String(IDs.roles.HighStaff || ""),
      String(IDs.roles.Supervisor || ""),
      String(IDs.roles.Coordinator || ""),
      String(IDs.roles.Mod || ""),
      String(IDs.roles.Helper || ""),
    ].filter(Boolean)),
    whitelistCategoryIds: new Set([]),
    autoBackupSync: {
      enabled: false,
      restoreDeletedRoles: true,
      deleteNewRoles: true,
      restoreDeletedChannels: true,
      deleteNewChannels: true,
      deleteNewWebhooks: true,
    },
    instantRollbackWhileActive: {
      enabled: true,
      quarantineExecutor: true,
      deleteCreatedRoles: true,
      deleteCreatedChannels: true,
      deleteCreatedWebhooks: true,
    },
  },
};

const ANTINUKE_PRESETS = {
  safe: {
    kickBanFilter: { minuteLimit: 6, hourLimit: 18, heatPerAction: 18 },
    roleCreationFilter: { minuteLimit: 6, hourLimit: 16, heatPerAction: 9 },
    roleDeletionFilter: { minuteLimit: 4, hourLimit: 10, heatPerAction: 22 },
    channelCreationFilter: { minuteLimit: 5, hourLimit: 12, heatPerAction: 14 },
    channelDeletionFilter: { minuteLimit: 3, hourLimit: 8, heatPerAction: 24 },
    webhookCreationFilter: { minuteLimit: 4, hourLimit: 12, heatPerAction: 12 },
    webhookDeletionFilter: { minuteLimit: 4, hourLimit: 10, heatPerAction: 10 },
    inviteCreationFilter: { minuteLimit: 5, hourLimit: 16, heatPerAction: 10 },
    panicMode: {
      thresholdHeat: 110,
      decayPerSec: 5,
      durationMs: 8 * 60_000,
      maxDurationMs: 30 * 60_000,
      extendByMsOnTrigger: 90_000,
    },
  },
  balanced: {
    kickBanFilter: { minuteLimit: 5, hourLimit: 15, heatPerAction: 20 },
    roleCreationFilter: { minuteLimit: 5, hourLimit: 15, heatPerAction: 10 },
    roleDeletionFilter: { minuteLimit: 3, hourLimit: 10, heatPerAction: 25 },
    channelCreationFilter: { minuteLimit: 4, hourLimit: 12, heatPerAction: 16 },
    channelDeletionFilter: { minuteLimit: 3, hourLimit: 8, heatPerAction: 25 },
    webhookCreationFilter: { minuteLimit: 3, hourLimit: 10, heatPerAction: 15 },
    webhookDeletionFilter: { minuteLimit: 3, hourLimit: 8, heatPerAction: 10 },
    inviteCreationFilter: { minuteLimit: 4, hourLimit: 15, heatPerAction: 12 },
    panicMode: {
      thresholdHeat: 100,
      decayPerSec: 5,
      durationMs: 10 * 60_000,
      maxDurationMs: 45 * 60_000,
      extendByMsOnTrigger: 2 * 60_000,
    },
  },
  strict: {
    kickBanFilter: { minuteLimit: 4, hourLimit: 12, heatPerAction: 25 },
    roleCreationFilter: { minuteLimit: 4, hourLimit: 12, heatPerAction: 12 },
    roleDeletionFilter: { minuteLimit: 2, hourLimit: 8, heatPerAction: 30 },
    channelCreationFilter: { minuteLimit: 3, hourLimit: 10, heatPerAction: 18 },
    channelDeletionFilter: { minuteLimit: 2, hourLimit: 6, heatPerAction: 30 },
    webhookCreationFilter: { minuteLimit: 2, hourLimit: 8, heatPerAction: 18 },
    webhookDeletionFilter: { minuteLimit: 2, hourLimit: 6, heatPerAction: 14 },
    inviteCreationFilter: { minuteLimit: 3, hourLimit: 10, heatPerAction: 15 },
    panicMode: {
      thresholdHeat: 80,
      decayPerSec: 4,
      durationMs: 12 * 60_000,
      maxDurationMs: 60 * 60_000,
      extendByMsOnTrigger: 3 * 60_000,
    },
  },
};

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

function normalizeStringSet(input, fallbackSet = new Set()) {
  if (!Array.isArray(input)) return new Set(fallbackSet);
  return new Set(
    input
      .map((x) => String(x || "").trim())
      .filter(Boolean),
  );
}

function getSerializableAntiNukeConfig() {
  return {
    enabled: Boolean(ANTINUKE_CONFIG.enabled),
    detectPrune: Boolean(ANTINUKE_CONFIG.detectPrune),
    vanityGuard: Boolean(ANTINUKE_CONFIG.vanityGuard),
    autoQuarantine: {
      ...ANTINUKE_CONFIG.autoQuarantine,
      whitelistUserIds: Array.from(
        ANTINUKE_CONFIG.autoQuarantine.whitelistUserIds || [],
      ),
    },
    kickBanFilter: { ...ANTINUKE_CONFIG.kickBanFilter },
    roleCreationFilter: { ...ANTINUKE_CONFIG.roleCreationFilter },
    roleDeletionFilter: { ...ANTINUKE_CONFIG.roleDeletionFilter },
    channelCreationFilter: { ...ANTINUKE_CONFIG.channelCreationFilter },
    channelDeletionFilter: { ...ANTINUKE_CONFIG.channelDeletionFilter },
    webhookCreationFilter: { ...ANTINUKE_CONFIG.webhookCreationFilter },
    webhookDeletionFilter: { ...ANTINUKE_CONFIG.webhookDeletionFilter },
    inviteCreationFilter: { ...ANTINUKE_CONFIG.inviteCreationFilter },
    panicMode: {
      ...ANTINUKE_CONFIG.panicMode,
      warnedRoleIds: Array.from(ANTINUKE_CONFIG.panicMode.warnedRoleIds || []),
      whitelistCategoryIds: Array.from(
        ANTINUKE_CONFIG.panicMode.whitelistCategoryIds || [],
      ),
      lockdown: {
        ...ANTINUKE_CONFIG.panicMode.lockdown,
        roleAllowlistIds: Array.from(
          ANTINUKE_CONFIG.panicMode.lockdown?.roleAllowlistIds || [],
        ),
      },
    },
  };
}

function applyPersistentAntiNukeConfig(raw) {
  if (!raw || typeof raw !== "object") return;
  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  const boolOr = (value, fallback) =>
    typeof value === "boolean" ? value : fallback;
  const src = raw;
  ANTINUKE_CONFIG.enabled = boolOr(src.enabled, ANTINUKE_CONFIG.enabled);
  ANTINUKE_CONFIG.detectPrune = boolOr(
    src.detectPrune,
    ANTINUKE_CONFIG.detectPrune,
  );
  ANTINUKE_CONFIG.vanityGuard = boolOr(
    src.vanityGuard,
    ANTINUKE_CONFIG.vanityGuard,
  );

  const aq = src.autoQuarantine || {};
  Object.assign(ANTINUKE_CONFIG.autoQuarantine, aq);
  ANTINUKE_CONFIG.autoQuarantine.enabled = boolOr(
    aq.enabled,
    ANTINUKE_CONFIG.autoQuarantine.enabled,
  );
  ANTINUKE_CONFIG.autoQuarantine.strictMode = boolOr(
    aq.strictMode,
    ANTINUKE_CONFIG.autoQuarantine.strictMode,
  );
  ANTINUKE_CONFIG.autoQuarantine.strictMemberRoleAddition = boolOr(
    aq.strictMemberRoleAddition,
    ANTINUKE_CONFIG.autoQuarantine.strictMemberRoleAddition,
  );
  ANTINUKE_CONFIG.autoQuarantine.monitorPublicRoles = boolOr(
    aq.monitorPublicRoles,
    ANTINUKE_CONFIG.autoQuarantine.monitorPublicRoles,
  );
  ANTINUKE_CONFIG.autoQuarantine.monitorChannelPermissions = boolOr(
    aq.monitorChannelPermissions,
    ANTINUKE_CONFIG.autoQuarantine.monitorChannelPermissions,
  );
  ANTINUKE_CONFIG.autoQuarantine.quarantineTimeoutMs = clamp(
    aq.quarantineTimeoutMs,
    60_000,
    7 * 24 * 60 * 60_000,
    ANTINUKE_CONFIG.autoQuarantine.quarantineTimeoutMs,
  );
  ANTINUKE_CONFIG.autoQuarantine.whitelistUserIds = normalizeStringSet(
    aq.whitelistUserIds,
    ANTINUKE_CONFIG.autoQuarantine.whitelistUserIds,
  );

  Object.assign(ANTINUKE_CONFIG.kickBanFilter, src.kickBanFilter || {});
  Object.assign(ANTINUKE_CONFIG.roleCreationFilter, src.roleCreationFilter || {});
  Object.assign(ANTINUKE_CONFIG.roleDeletionFilter, src.roleDeletionFilter || {});
  Object.assign(
    ANTINUKE_CONFIG.channelCreationFilter,
    src.channelCreationFilter || {},
  );
  Object.assign(
    ANTINUKE_CONFIG.channelDeletionFilter,
    src.channelDeletionFilter || {},
  );
  Object.assign(
    ANTINUKE_CONFIG.webhookCreationFilter,
    src.webhookCreationFilter || {},
  );
  Object.assign(
    ANTINUKE_CONFIG.webhookDeletionFilter,
    src.webhookDeletionFilter || {},
  );
  Object.assign(
    ANTINUKE_CONFIG.inviteCreationFilter,
    src.inviteCreationFilter || {},
  );
  const filters = [
    ANTINUKE_CONFIG.kickBanFilter,
    ANTINUKE_CONFIG.roleCreationFilter,
    ANTINUKE_CONFIG.roleDeletionFilter,
    ANTINUKE_CONFIG.channelCreationFilter,
    ANTINUKE_CONFIG.channelDeletionFilter,
    ANTINUKE_CONFIG.webhookCreationFilter,
    ANTINUKE_CONFIG.webhookDeletionFilter,
    ANTINUKE_CONFIG.inviteCreationFilter,
  ];
  for (const f of filters) {
    f.enabled = boolOr(f.enabled, true);
    f.minuteLimit = clamp(f.minuteLimit, 1, 200, 5);
    f.hourLimit = clamp(f.hourLimit, 1, 5000, 20);
    f.heatPerAction = clamp(f.heatPerAction, 1, 200, 20);
  }

  const pm = src.panicMode || {};
  Object.assign(ANTINUKE_CONFIG.panicMode, pm);
  ANTINUKE_CONFIG.panicMode.enabled = boolOr(
    pm.enabled,
    ANTINUKE_CONFIG.panicMode.enabled,
  );
  ANTINUKE_CONFIG.panicMode.useHeatAlgorithm = boolOr(
    pm.useHeatAlgorithm,
    ANTINUKE_CONFIG.panicMode.useHeatAlgorithm,
  );
  ANTINUKE_CONFIG.panicMode.thresholdHeat = clamp(
    pm.thresholdHeat,
    1,
    500,
    ANTINUKE_CONFIG.panicMode.thresholdHeat,
  );
  ANTINUKE_CONFIG.panicMode.decayPerSec = clamp(
    pm.decayPerSec,
    0,
    100,
    ANTINUKE_CONFIG.panicMode.decayPerSec,
  );
  ANTINUKE_CONFIG.panicMode.durationMs = clamp(
    pm.durationMs,
    60_000,
    24 * 60 * 60_000,
    ANTINUKE_CONFIG.panicMode.durationMs,
  );
  ANTINUKE_CONFIG.panicMode.maxDurationMs = clamp(
    pm.maxDurationMs,
    ANTINUKE_CONFIG.panicMode.durationMs,
    24 * 60 * 60_000,
    Math.max(
      ANTINUKE_CONFIG.panicMode.maxDurationMs,
      ANTINUKE_CONFIG.panicMode.durationMs,
    ),
  );
  ANTINUKE_CONFIG.panicMode.extendByMsOnTrigger = clamp(
    pm.extendByMsOnTrigger,
    0,
    12 * 60 * 60_000,
    ANTINUKE_CONFIG.panicMode.extendByMsOnTrigger,
  );
  ANTINUKE_CONFIG.panicMode.warnedRoleIds = normalizeStringSet(
    pm.warnedRoleIds,
    ANTINUKE_CONFIG.panicMode.warnedRoleIds,
  );
  ANTINUKE_CONFIG.panicMode.whitelistCategoryIds = normalizeStringSet(
    pm.whitelistCategoryIds,
    ANTINUKE_CONFIG.panicMode.whitelistCategoryIds,
  );
  Object.assign(ANTINUKE_CONFIG.panicMode.lockdown, pm.lockdown || {});
  ANTINUKE_CONFIG.panicMode.lockdown.roleAllowlistIds = normalizeStringSet(
    pm.lockdown?.roleAllowlistIds,
    ANTINUKE_CONFIG.panicMode.lockdown.roleAllowlistIds,
  );
  ANTINUKE_CONFIG.panicMode.lockdown.dangerousRoles = boolOr(
    pm.lockdown?.dangerousRoles,
    ANTINUKE_CONFIG.panicMode.lockdown.dangerousRoles,
  );
  ANTINUKE_CONFIG.panicMode.lockdown.unlockDangerousRolesOnFinish = boolOr(
    pm.lockdown?.unlockDangerousRolesOnFinish,
    ANTINUKE_CONFIG.panicMode.lockdown.unlockDangerousRolesOnFinish,
  );
  ANTINUKE_CONFIG.panicMode.lockdown.lockModerationCommands = boolOr(
    pm.lockdown?.lockModerationCommands,
    ANTINUKE_CONFIG.panicMode.lockdown.lockModerationCommands,
  );
  ANTINUKE_CONFIG.panicMode.autoBackupSync.enabled = boolOr(
    pm.autoBackupSync?.enabled,
    ANTINUKE_CONFIG.panicMode.autoBackupSync.enabled,
  );
  ANTINUKE_CONFIG.panicMode.autoBackupSync.restoreDeletedRoles = boolOr(
    pm.autoBackupSync?.restoreDeletedRoles,
    ANTINUKE_CONFIG.panicMode.autoBackupSync.restoreDeletedRoles,
  );
  ANTINUKE_CONFIG.panicMode.autoBackupSync.deleteNewRoles = boolOr(
    pm.autoBackupSync?.deleteNewRoles,
    ANTINUKE_CONFIG.panicMode.autoBackupSync.deleteNewRoles,
  );
  ANTINUKE_CONFIG.panicMode.autoBackupSync.restoreDeletedChannels = boolOr(
    pm.autoBackupSync?.restoreDeletedChannels,
    ANTINUKE_CONFIG.panicMode.autoBackupSync.restoreDeletedChannels,
  );
  ANTINUKE_CONFIG.panicMode.autoBackupSync.deleteNewChannels = boolOr(
    pm.autoBackupSync?.deleteNewChannels,
    ANTINUKE_CONFIG.panicMode.autoBackupSync.deleteNewChannels,
  );
  ANTINUKE_CONFIG.panicMode.autoBackupSync.deleteNewWebhooks = boolOr(
    pm.autoBackupSync?.deleteNewWebhooks,
    ANTINUKE_CONFIG.panicMode.autoBackupSync.deleteNewWebhooks,
  );
  ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.enabled = boolOr(
    pm.instantRollbackWhileActive?.enabled,
    ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.enabled,
  );
  ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.quarantineExecutor = boolOr(
    pm.instantRollbackWhileActive?.quarantineExecutor,
    ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.quarantineExecutor,
  );
  ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.deleteCreatedRoles = boolOr(
    pm.instantRollbackWhileActive?.deleteCreatedRoles,
    ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.deleteCreatedRoles,
  );
  ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.deleteCreatedChannels = boolOr(
    pm.instantRollbackWhileActive?.deleteCreatedChannels,
    ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.deleteCreatedChannels,
  );
  ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.deleteCreatedWebhooks = boolOr(
    pm.instantRollbackWhileActive?.deleteCreatedWebhooks,
    ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive.deleteCreatedWebhooks,
  );
}

function saveAntiNukePersistentConfig() {
  return writeJsonSafe(ANTINUKE_CONFIG_PATH, getSerializableAntiNukeConfig());
}

applyPersistentAntiNukeConfig(readJsonSafe(ANTINUKE_CONFIG_PATH, null));

function hasAllPerms(member, flags) {
  return flags.every((flag) => member?.permissions?.has?.(flag));
}

function normalizeExecutorId(executorId) {
  const raw = String(executorId || "").trim();
  return raw || UNKNOWN_EXECUTOR_ID;
}

function isUnknownExecutorId(executorId) {
  return String(executorId || "").trim() === UNKNOWN_EXECUTOR_ID;
}

function formatExecutorLine(executorId) {
  const actorId = String(executorId || "").trim();
  if (!actorId || actorId === UNKNOWN_EXECUTOR_ID) {
    return `<:VC_right_arrow:1473441155055096081> **Executor:** Unknown (audit missing)`;
  }
  return `<:VC_right_arrow:1473441155055096081> **Executor:** <@${actorId}> \`${actorId}\``;
}

function hasDangerousGuildPerms(member) {
  return hasAllPerms(member, [PermissionsBitField.Flags.Administrator]) ||
    DANGEROUS_PERMS.some((flag) => member?.permissions?.has?.(flag));
}

function containsDangerousBits(bitfield, dangerList = DANGEROUS_PERMS) {
  const bits = BigInt(bitfield || 0n);
  return dangerList.some((flag) => (bits & BigInt(flag)) !== 0n);
}

function dangerousAddedBits(beforeBits, afterBits, dangerList = DANGEROUS_PERMS) {
  const before = BigInt(beforeBits || 0n);
  const after = BigInt(afterBits || 0n);
  const added = after & ~before;
  return dangerList.filter((flag) => (added & BigInt(flag)) !== 0n);
}

function getMainRoleIds(guild) {
  return new Set(
    [
      String(guild?.id || ""),
      String(IDs.roles.Member || ""),
      String(IDs.roles.Staff || ""),
      String(IDs.roles.HighStaff || ""),
      String(IDs.roles.Founder || ""),
      String(IDs.roles.CoFounder || ""),
    ].filter(Boolean),
  );
}

function cleanupMaintenanceAllowlist(guildId, at = Date.now()) {
  const key = String(guildId || "");
  const bucket = MAINTENANCE_ALLOWLIST.get(key);
  if (!bucket) return;
  for (const [userId, expiresAt] of bucket.entries()) {
    if (Number(expiresAt || 0) <= at) bucket.delete(String(userId));
  }
  if (!bucket.size) MAINTENANCE_ALLOWLIST.delete(key);
}

function isMaintenanceAllowed(guildId, userId, at = Date.now()) {
  const g = String(guildId || "");
  const u = String(userId || "");
  if (!g || !u) return false;
  cleanupMaintenanceAllowlist(g, at);
  const bucket = MAINTENANCE_ALLOWLIST.get(g);
  const expiresAt = Number(bucket?.get(u) || 0);
  return expiresAt > at;
}

function isWhitelistedExecutor(guild, executorId) {
  const userId = String(executorId || "");
  if (!userId || userId === UNKNOWN_EXECUTOR_ID) return false;
  if (isMaintenanceAllowed(guild?.id, userId)) return true;
  if (String(guild?.ownerId || "") === userId) return true;
  if (CORE_EXEMPT_USER_IDS.has(userId)) return true;
  if (VERIFIED_BOT_IDS.has(userId)) return true;
  if (ANTINUKE_CONFIG.autoQuarantine.whitelistUserIds.has(userId)) return true;
  const member = guild?.members?.cache?.get(userId);
  if (!member) return false;
  if (
    member.roles.cache.has(String(IDs.roles.Founder || "")) ||
    member.roles.cache.has(String(IDs.roles.CoFounder || ""))
  ) {
    return true;
  }
  return false;
}

async function isVerifiedBotExecutor(guild, executorId) {
  const userId = String(executorId || "");
  if (!userId) return false;
  if (VERIFIED_BOT_IDS.has(userId)) return true;
  if (VERIFIED_BOT_CACHE.has(userId)) return VERIFIED_BOT_CACHE.get(userId);

  let verified = false;
  try {
    const member =
      guild?.members?.cache?.get(userId) ||
      (await guild?.members?.fetch(userId).catch(() => null));
    const user = member?.user;
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
  VERIFIED_BOT_CACHE.set(userId, verified);
  return verified;
}

async function isWhitelistedExecutorAsync(guild, executorId) {
  const userId = String(executorId || "");
  if (!userId || userId === UNKNOWN_EXECUTOR_ID) return false;
  if (isMaintenanceAllowed(guild?.id, userId)) return true;
  if (String(guild?.ownerId || "") === userId) return true;
  if (CORE_EXEMPT_USER_IDS.has(userId)) return true;
  if (VERIFIED_BOT_IDS.has(userId)) return true;
  if (await isVerifiedBotExecutor(guild, userId)) return true;
  if (ANTINUKE_CONFIG.autoQuarantine.whitelistUserIds.has(userId)) return true;
  let member = guild?.members?.cache?.get(userId) || null;
  if (!member) member = await guild?.members?.fetch(userId).catch(() => null);
  if (!member) return false;
  if (
    member.roles.cache.has(String(IDs.roles.Founder || "")) ||
    member.roles.cache.has(String(IDs.roles.CoFounder || ""))
  ) {
    return true;
  }
  return false;
}

function isCategoryWhitelisted(channel) {
  const set = ANTINUKE_CONFIG.panicMode.whitelistCategoryIds;
  if (!set || !set.size || !channel) return false;
  const parentId = String(channel.parentId || "");
  const id = String(channel.id || "");
  return set.has(parentId) || set.has(id);
}

async function resolveModLogChannel(guild) {
  const channelId = IDs.channels.modLogs || IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
}

function extractLineValue(lines, label) {
  const key = `**${label}:**`;
  const raw = (Array.isArray(lines) ? lines : []).find((line) =>
    String(line || "").includes(key),
  );
  if (!raw) return "";
  return String(raw)
    .replace(/<:[^>]+>\s*/g, "")
    .replace(key, "")
    .trim();
}

function antiNukeHeadline(title, lines) {
  const executor = extractLineValue(lines, "Executor");
  const action = extractLineValue(lines, "Action");
  if (/panic mode enabled/i.test(String(title || ""))) {
    return "AntiNuke panic mode has been enabled!";
  }
  if (/panic mode ended/i.test(String(title || ""))) {
    return "AntiNuke panic mode has ended.";
  }
  if (executor && /quarantined/i.test((lines || []).join(" "))) {
    return `${executor.split(" ")[0]} has been quarantined!`;
  }
  if (action) return `AntiNuke action: ${action}`;
  return title || "AntiNuke Trigger";
}

function cleanAntiNukeLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .filter(Boolean)
    .map((line) =>
      String(line)
        .replace(/^<:[^>]+>\s*/g, "")
        .trim(),
    )
    .filter(
      (line) =>
        !line.startsWith("**Executor:**") &&
        !line.startsWith("**Target:**") &&
        !line.startsWith("**Channel:**"),
    );
}

async function sendAntiNukeLog(guild, title, lines, color = "#ED4245") {
  const logChannel = await resolveModLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;
  const dedupeBasis = [
    String(guild?.id || ""),
    String(title || ""),
    String(color || ""),
    ...(Array.isArray(lines) ? lines.map((x) => String(x || "").trim()) : []),
  ].join("|");
  const now = Date.now();
  for (const [key, ts] of ANTINUKE_LOG_DEDUPE.entries()) {
    if (now - Number(ts || 0) > ANTINUKE_LOG_DEDUPE_TTL_MS) {
      ANTINUKE_LOG_DEDUPE.delete(key);
    }
  }
  if (ANTINUKE_LOG_DEDUPE.has(dedupeBasis)) return;
  ANTINUKE_LOG_DEDUPE.set(dedupeBasis, now);

  const executor = extractLineValue(lines, "Executor");
  const target = extractLineValue(lines, "Target");
  const channel = extractLineValue(lines, "Channel");
  const filterName = title?.replace(/^AntiNuke:\s*/i, "") || "AntiNuke";
  const details = cleanAntiNukeLines(lines);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(antiNukeHeadline(title, lines))
    .setDescription(
      [
        `<:VC_right_arrow:1473441155055096081> **AntiNuke Filter:** ${filterName}`,
        channel
          ? `<:VC_right_arrow:1473441155055096081> **Channel:** ${channel}`
          : null,
        target
          ? `<:VC_right_arrow:1473441155055096081> **Target:** ${target}`
          : null,
        executor
          ? `<:VC_right_arrow:1473441155055096081> **Member:** ${executor}`
          : null,
        "",
        ...details.map(
          (line) => `<:VC_right_arrow:1473441155055096081> ${line}`,
        ),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setTimestamp();
  await logChannel
    .send({
      content: HIGH_STAFF_MENTION || undefined,
      embeds: [embed],
      allowedMentions: HIGH_STAFF_MENTION
        ? { roles: [String(IDs.roles.HighStaff)] }
        : undefined,
    })
    .catch(() => {});
}

function getDangerMask(flags = DANGEROUS_PERMS) {
  let mask = 0n;
  for (const flag of flags) mask |= BigInt(flag);
  return mask;
}

function getPanicState(guildId) {
  const now = Date.now();
  for (const [gid, state] of ANTINUKE_PANIC_STATE.entries()) {
    const idleFor = now - Number(state?.lastAt || 0);
    const active = Number(state?.activeUntil || 0) > now;
    const hasArtifacts =
      Number(state?.lockedRoles?.size || 0) > 0 ||
      Number(state?.createdRoleIds?.size || 0) > 0 ||
      Number(state?.createdChannelIds?.size || 0) > 0 ||
      Number(state?.createdWebhookIds?.size || 0) > 0;
    if (!active && !hasArtifacts && idleFor > 6 * 60 * 60_000) {
      ANTINUKE_PANIC_STATE.delete(gid);
    }
  }
  const key = String(guildId || "");
  const existing = ANTINUKE_PANIC_STATE.get(key);
  if (existing) return existing;
  const initial = {
    heat: 0,
    lastAt: Date.now(),
    panicStartedAt: 0,
    activeUntil: 0,
    lockedRoles: new Map(),
    createdRoleIds: new Set(),
    createdChannelIds: new Set(),
    createdWebhookIds: new Set(),
    unlockTimer: null,
  };
  ANTINUKE_PANIC_STATE.set(key, initial);
  return initial;
}

function isAntiNukePanicActive(guildId) {
  const state = getPanicState(guildId);
  return Number(state.activeUntil || 0) > Date.now();
}

function decayPanicHeat(state, at = Date.now()) {
  const elapsedSec = Math.max(0, (at - Number(state.lastAt || at)) / 1000);
  const decay = elapsedSec * Number(ANTINUKE_CONFIG.panicMode.decayPerSec || 0);
  state.heat = Math.max(0, Number(state.heat || 0) - decay);
  state.lastAt = at;
}

async function lockDangerousRolesForPanic(guild, state) {
  if (!ANTINUKE_CONFIG.panicMode.lockdown.dangerousRoles) return;
  const me = guild?.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;

  const allowlist = ANTINUKE_CONFIG.panicMode.lockdown.roleAllowlistIds;
  const dangerMask = getDangerMask(DANGEROUS_PERMS);
  for (const role of guild.roles.cache.values()) {
    if (!role || role.managed || role.id === guild.id) continue;
    // If allowlist has values, treat them as explicit lockdown exclusions.
    if (allowlist?.size && allowlist.has(String(role.id))) continue;
    if (role.position >= me.roles.highest.position) continue;
    const current = BigInt(role.permissions?.bitfield || 0n);
    if ((current & dangerMask) === 0n) continue;
    if (!state.lockedRoles.has(role.id)) {
      state.lockedRoles.set(role.id, String(current));
    }
    const safeBits = current & ~dangerMask;
    if (safeBits !== current) {
      await role
        .setPermissions(
          safeBits,
          "AntiNuke Panic: lock dangerous role permissions",
        )
        .catch(() => {});
    }
  }
}

async function unlockDangerousRolesAfterPanic(guild, state) {
  if (!ANTINUKE_CONFIG.panicMode.lockdown.unlockDangerousRolesOnFinish) return;
  const me = guild?.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;

  for (const [roleId, oldBitsStr] of state.lockedRoles.entries()) {
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (!role) continue;
    if (role.position >= me.roles.highest.position) continue;
    const oldBits = BigInt(oldBitsStr || 0n);
    await role
      .setPermissions(oldBits, "AntiNuke Panic: restore role permissions")
      .catch(() => {});
  }
  state.lockedRoles.clear();
}

async function runAutoBackupSyncAfterPanic(guild, state) {
  const cfg = ANTINUKE_CONFIG.panicMode.autoBackupSync;
  if (!cfg?.enabled || !guild) return;
  const me = guild.members?.me;

  if (cfg.deleteNewChannels && me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
    for (const channelId of state.createdChannelIds) {
      const channel =
        guild.channels.cache.get(String(channelId)) ||
        (await guild.channels.fetch(String(channelId)).catch(() => null));
      if (!channel) continue;
      await channel.delete("AntiNuke panic cleanup: delete new channel").catch(() => {});
    }
  }

  if (cfg.deleteNewRoles && me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
    for (const roleId of state.createdRoleIds) {
      const role =
        guild.roles.cache.get(String(roleId)) ||
        (await guild.roles.fetch(String(roleId)).catch(() => null));
      if (!role) continue;
      if (role.managed) continue;
      if (role.position >= me.roles.highest.position) continue;
      await role.delete("AntiNuke panic cleanup: delete new role").catch(() => {});
    }
  }

  if (cfg.deleteNewWebhooks && me?.permissions?.has(PermissionsBitField.Flags.ManageWebhooks)) {
    for (const channel of guild.channels.cache.values()) {
      if (!channel?.isTextBased?.()) continue;
      const webhooks = await channel.fetchWebhooks().catch(() => null);
      if (!webhooks?.size) continue;
      for (const webhook of webhooks.values()) {
        if (!state.createdWebhookIds.has(String(webhook.id))) continue;
        await webhook.delete("AntiNuke panic cleanup: delete new webhook").catch(() => {});
      }
    }
  }

  state.createdRoleIds.clear();
  state.createdChannelIds.clear();
  state.createdWebhookIds.clear();
}

async function enableAntiNukePanic(guild, reason, addedHeat = 0) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.panicMode.enabled || !guild) {
    return { activated: false, active: false };
  }
  const now = Date.now();
  const state = getPanicState(guild.id);
  if (ANTINUKE_CONFIG.panicMode.useHeatAlgorithm) {
    decayPanicHeat(state, now);
  }
  state.heat += Number(addedHeat || 0);

  const wasActive = Number(state.activeUntil || 0) > now;
  if (state.heat < Number(ANTINUKE_CONFIG.panicMode.thresholdHeat || 100) && !wasActive) {
    return { activated: false, active: false };
  }

  const baseDuration = Number(ANTINUKE_CONFIG.panicMode.durationMs || 0);
  const extendBy = Number(ANTINUKE_CONFIG.panicMode.extendByMsOnTrigger || 0);
  const maxDuration = Math.max(baseDuration, Number(ANTINUKE_CONFIG.panicMode.maxDurationMs || baseDuration));
  if (!wasActive || !Number(state.panicStartedAt || 0)) {
    state.panicStartedAt = now;
  }
  const targetUntil = wasActive
    ? now + Math.max(baseDuration, extendBy)
    : now + baseDuration;
  state.activeUntil = Math.max(Number(state.activeUntil || 0), targetUntil);
  const hardCapUntil = Number(state.panicStartedAt || now) + maxDuration;
  if (state.activeUntil > hardCapUntil) {
    state.activeUntil = hardCapUntil;
  }
  state.heat = 0;

  await lockDangerousRolesForPanic(guild, state);

  if (state.unlockTimer) clearTimeout(state.unlockTimer);
  state.unlockTimer = setTimeout(async () => {
    const current = getPanicState(guild.id);
    current.unlockTimer = null;
    if (Number(current.activeUntil || 0) > Date.now()) return;
    current.panicStartedAt = 0;
    await unlockDangerousRolesAfterPanic(guild, current);
    await runAutoBackupSyncAfterPanic(guild, current);
    await sendAntiNukeLog(
      guild,
      "AntiNuke Panic Mode Ended",
      [
        `<:VC_right_arrow:1473441155055096081> **Reason:** Panic duration ended`,
        `<:VC_right_arrow:1473441155055096081> **Lockdown:** roles restored`,
      ],
      "#57F287",
    );
  }, Math.max(1_000, Number(state.activeUntil || 0) - now));
  if (typeof state.unlockTimer?.unref === "function") {
    state.unlockTimer.unref();
  }

  if (!wasActive) {
    await sendAntiNukeLog(
      guild,
      "AntiNuke Panic Mode Enabled",
      [
        `<:VC_right_arrow:1473441155055096081> **Reason:** ${reason || "threshold reached"}`,
        `<:VC_right_arrow:1473441155055096081> **Heat Algorithm:** ${ANTINUKE_CONFIG.panicMode.useHeatAlgorithm ? "ON" : "OFF"}`,
        `<:VC_right_arrow:1473441155055096081> **Duration:** ${Math.round(ANTINUKE_CONFIG.panicMode.durationMs / 60_000)} min`,
        `<:VC_right_arrow:1473441155055096081> **Max Duration:** ${Math.round(maxDuration / 60_000)} min`,
        `<:VC_right_arrow:1473441155055096081> **Dangerous Roles Lockdown:** ${ANTINUKE_CONFIG.panicMode.lockdown.dangerousRoles ? "ON" : "OFF"}`,
      ],
      "#ED4245",
    );
  }

  return { activated: !wasActive, active: true };
}

function scheduleQuarantineRoleRollback(guild, userId, roleId, durationMs) {
  const key = `${String(guild?.id || "")}:${String(userId || "")}:${String(roleId || "")}`;
  if (!guild?.id || !userId || !roleId) return;
  const old = QUARANTINE_ROLE_TIMERS.get(key);
  if (old) clearTimeout(old);
  const timer = setTimeout(async () => {
    QUARANTINE_ROLE_TIMERS.delete(key);
    try {
      const member =
        guild.members.cache.get(String(userId)) ||
        (await guild.members.fetch(String(userId)).catch(() => null));
      if (!member) return;
      if (!member.roles.cache.has(String(roleId))) return;
      await member.roles
        .remove(String(roleId), "AntiNuke quarantine timeout elapsed")
        .catch(() => {});
    } catch {
      // No-op
    }
  }, Math.max(1_000, Number(durationMs || 0)));
  if (typeof timer.unref === "function") timer.unref();
  QUARANTINE_ROLE_TIMERS.set(key, timer);
}

function quarantineOutcomeLabel(outcome) {
  if (!outcome?.applied) return "Quarantine not applied";
  if (outcome.method === "already_role") return "Quarantine active (existing role)";
  if (outcome.method === "role") return "Quarantined via role";
  if (outcome.method === "timeout") return "Quarantined via timeout";
  return "Quarantined";
}

async function quarantineExecutor(guild, executorId, reason) {
  if (!ANTINUKE_CONFIG.autoQuarantine.enabled) {
    return { applied: false, method: "disabled" };
  }
  const userId = String(executorId || "");
  if (userId === UNKNOWN_EXECUTOR_ID) {
    return { applied: false, method: "missing_executor_audit" };
  }
  if (!userId) return { applied: false, method: "missing_user" };
  if (await isWhitelistedExecutorAsync(guild, userId)) {
    return { applied: false, method: "whitelisted" };
  }
  const member = guild?.members?.cache?.get(userId) || (await guild?.members?.fetch(userId).catch(() => null));
  if (!member) return { applied: false, method: "missing_member" };

  const me = guild?.members?.me || null;
  const quarantineRoleId = String(
    ANTINUKE_CONFIG.autoQuarantine.quarantineRoleId || "",
  );

  if (
    quarantineRoleId &&
    me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)
  ) {
    const role =
      guild.roles.cache.get(quarantineRoleId) ||
      (await guild.roles.fetch(quarantineRoleId).catch(() => null));
    if (role && role.position < me.roles.highest.position) {
      if (member.roles.cache.has(role.id)) {
        return { applied: true, method: "already_role" };
      }
      const roleApplied = await member.roles
        .add(role, reason)
        .then(() => true)
        .catch(() => false);
      if (roleApplied) {
        scheduleQuarantineRoleRollback(
          guild,
          userId,
          role.id,
          ANTINUKE_CONFIG.autoQuarantine.quarantineTimeoutMs,
        );
        return { applied: true, method: "role" };
      }
    }
  }

  if (!member.moderatable) return { applied: false, method: "not_moderatable" };
  const timeoutApplied = await member
    .timeout(ANTINUKE_CONFIG.autoQuarantine.quarantineTimeoutMs, reason)
    .then(() => true)
    .catch(() => false);
  return timeoutApplied
    ? { applied: true, method: "timeout" }
    : { applied: false, method: "timeout_failed" };
}

async function deleteWebhookById(guild, webhookId, preferredChannelId = "") {
  const id = String(webhookId || "");
  if (!guild?.id || !id) return false;
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageWebhooks)) return false;

  const preferredId = String(preferredChannelId || "");
  if (preferredId) {
    const preferredChannel =
      guild.channels.cache.get(preferredId) ||
      (await guild.channels.fetch(preferredId).catch(() => null));
    if (preferredChannel?.isTextBased?.()) {
      const wh = await preferredChannel.fetchWebhooks().catch(() => null);
      const target = wh?.get?.(id) || null;
      if (target) {
        const deleted = await target
          .delete("AntiNuke panic: delete webhook created during active panic")
          .then(() => true)
          .catch(() => false);
        if (deleted) return true;
      }
    }
  }

  for (const channel of guild.channels.cache.values()) {
    if (!channel?.isTextBased?.()) continue;
    const webhooks = await channel.fetchWebhooks().catch(() => null);
    if (!webhooks?.size) continue;
    const target = webhooks.get(id);
    if (!target) continue;
    const deleted = await target
      .delete("AntiNuke panic: delete webhook created during active panic")
      .then(() => true)
      .catch(() => false);
    if (deleted) return true;
  }
  return false;
}

function cleanupTrackerMap(map, now = Date.now()) {
  for (const [key, state] of map.entries()) {
    if (!state) {
      map.delete(key);
      continue;
    }
    const hits = Array.isArray(state.hourHits) ? state.hourHits : [];
    const hasRecentHits = hits.some((ts) => now - Number(ts || 0) <= 60 * 60_000);
    const hasRecentPunish = now - Number(state.lastPunishAt || 0) <= 60 * 60_000;
    if (!hasRecentHits && !hasRecentPunish) {
      map.delete(key);
    }
  }
}

function cleanupActionDedupe(now = Date.now()) {
  for (const [key, ts] of ACTION_EVENT_DEDUPE.entries()) {
    if (now - Number(ts || 0) > ACTION_EVENT_DEDUPE_TTL_MS) {
      ACTION_EVENT_DEDUPE.delete(key);
    }
  }
}

function cleanupPanicExecutorCooldown(now = Date.now()) {
  for (const [key, ts] of PANIC_EXECUTOR_COOLDOWN.entries()) {
    if (now - Number(ts || 0) > PANIC_EXECUTOR_COOLDOWN_MS) {
      PANIC_EXECUTOR_COOLDOWN.delete(key);
    }
  }
}

function shouldSkipPanicExecutorAction(guildId, executorId, now = Date.now()) {
  cleanupPanicExecutorCooldown(now);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const last = Number(PANIC_EXECUTOR_COOLDOWN.get(key) || 0);
  PANIC_EXECUTOR_COOLDOWN.set(key, now);
  return now - last <= PANIC_EXECUTOR_COOLDOWN_MS;
}

function shouldSkipDuplicatedActionEvent({
  guildId,
  executorId,
  actionKey,
  targetId = "",
  now = Date.now(),
}) {
  cleanupActionDedupe(now);
  const normalizedTarget = String(targetId || "").trim() || "__no_target__";
  const dedupeKey = [
    String(guildId || ""),
    String(executorId || ""),
    String(actionKey || ""),
    normalizedTarget,
  ].join(":");
  const lastTs = Number(ACTION_EVENT_DEDUPE.get(dedupeKey) || 0);
  ACTION_EVENT_DEDUPE.set(dedupeKey, now);
  const ttlMs =
    normalizedTarget === "__no_target__"
      ? ACTION_EVENT_DEDUPE_NO_TARGET_TTL_MS
      : ACTION_EVENT_DEDUPE_TTL_MS;
  return now - lastTs <= ttlMs;
}

function getTrackerExecutorId(
  executorId,
  targetId = "",
  actionKey = "",
  now = Date.now(),
) {
  const actorId = normalizeExecutorId(executorId);
  if (actorId !== UNKNOWN_EXECUTOR_ID) return actorId;
  const target = String(targetId || "").trim();
  if (target) return `${UNKNOWN_EXECUTOR_ID}:${target}`;
  const action = String(actionKey || "").trim() || "unknown";
  return `${UNKNOWN_EXECUTOR_ID}:${action}`;
}

function registerGuildBurstActivity(guildId, addedHeat, now = Date.now()) {
  for (const [gid, state] of GUILD_BURST_TRACKER.entries()) {
    const hits = Array.isArray(state?.hits) ? state.hits : [];
    const freshHits = hits.filter(
      (x) => now - Number(x?.ts || 0) <= GUILD_BURST_WINDOW_MS,
    );
    const recentlyTriggered =
      now - Number(state?.lastTriggeredAt || 0) <= GUILD_BURST_COOLDOWN_MS;
    if (!freshHits.length && !recentlyTriggered) {
      GUILD_BURST_TRACKER.delete(gid);
    } else if (freshHits.length !== hits.length) {
      GUILD_BURST_TRACKER.set(gid, {
        hits: freshHits,
        lastTriggeredAt: Number(state?.lastTriggeredAt || 0),
      });
    }
  }
  const key = String(guildId || "");
  if (!key || !Number.isFinite(Number(addedHeat || 0)) || Number(addedHeat || 0) <= 0) {
    return { triggered: false, totalHeat: 0 };
  }
  const existing = GUILD_BURST_TRACKER.get(key) || {
    hits: [],
    lastTriggeredAt: 0,
  };
  existing.hits = existing.hits.filter(
    (x) => now - Number(x?.ts || 0) <= GUILD_BURST_WINDOW_MS,
  );
  existing.hits.push({ ts: now, heat: Number(addedHeat || 0) });
  const totalHeat = existing.hits.reduce(
    (sum, x) => sum + Number(x?.heat || 0),
    0,
  );
  const canTrigger =
    totalHeat >= GUILD_BURST_TRIGGER_HEAT &&
    now - Number(existing.lastTriggeredAt || 0) > GUILD_BURST_COOLDOWN_MS;
  if (canTrigger) existing.lastTriggeredAt = now;
  GUILD_BURST_TRACKER.set(key, existing);
  return { triggered: canTrigger, totalHeat };
}

async function applyBurstPanicGuard(guild, actorId, actionLabel, addedHeat) {
  if (!guild?.id) return;
  const burst = registerGuildBurstActivity(guild.id, addedHeat, Date.now());
  if (!burst.triggered) return;
  await enableAntiNukePanic(
    guild,
    `Coordinated burst detected (${actionLabel || "unknown"})`,
    Math.max(100, Number(addedHeat || 0)),
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Coordinated Burst Guard",
    [
      formatExecutorLine(actorId),
      `<:VC_right_arrow:1473441155055096081> **Action:** ${actionLabel || "unknown"}`,
      `<:VC_right_arrow:1473441155055096081> **Burst Heat (20s):** ${Math.round(burst.totalHeat)}/${GUILD_BURST_TRIGGER_HEAT}`,
      `<:VC_right_arrow:1473441155055096081> **Result:** Panic mode forced`,
    ].filter(Boolean),
    "#ED4245",
  );
}

function getKickBanState(guildId, executorId) {
  cleanupTrackerMap(KICK_BAN_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = KICK_BAN_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  KICK_BAN_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimKickBanState(state, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts) => ts >= hourCutoff);
  state.heat = state.hourHits.length * Number(ANTINUKE_CONFIG.kickBanFilter.heatPerAction || 20);
}

async function handleKickBanAction({ guild, executorId, action = "unknown", targetId = "" }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.kickBanFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { /* keep tracking even when audit is missing */ }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, targetId, `kickban:${action}`, now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: `kickban:${action}`,
      targetId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    `kick/ban (${action})`,
    Number(ANTINUKE_CONFIG.kickBanFilter.heatPerAction || 20),
  );
  await enableAntiNukePanic(
    guild,
    `Kick/Ban filter: ${action}`,
    ANTINUKE_CONFIG.kickBanFilter.heatPerAction,
  );

  const { state } = getKickBanState(guild.id, trackerId);
  trimKickBanState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat = state.hourHits.length * Number(ANTINUKE_CONFIG.kickBanFilter.heatPerAction || 20);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.kickBanFilter.minuteLimit || 5);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.kickBanFilter.hourLimit || 15);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(
    guild,
    actorId,
    "AntiNuke: kick/ban abuse detected",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Kick/Ban Filter",
    [
      formatExecutorLine(actorId),
      `<:VC_right_arrow:1473441155055096081> **Action:** ${action}`,
      targetId
        ? `<:VC_right_arrow:1473441155055096081> **Target:** <@${targetId}> \`${targetId}\``
        : null,
      `<:VC_right_arrow:1473441155055096081> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.kickBanFilter.minuteLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.kickBanFilter.hourLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Heat:** ${state.heat}/100`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function getRoleCreationState(guildId, executorId) {
  cleanupTrackerMap(ROLE_CREATION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = ROLE_CREATION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  ROLE_CREATION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimRoleCreationState(state, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts) => ts >= hourCutoff);
  state.heat = state.hourHits.length * Number(ANTINUKE_CONFIG.roleCreationFilter.heatPerAction || 10);
}

async function handleRoleCreationAction({ guild, executorId, roleId = "" }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.roleCreationFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { /* keep tracking even when audit is missing */ }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, roleId, "role:create", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "role:create",
      targetId: roleId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    "role create",
    Number(ANTINUKE_CONFIG.roleCreationFilter.heatPerAction || 10),
  );
  await enableAntiNukePanic(
    guild,
    "Role creation filter",
    ANTINUKE_CONFIG.roleCreationFilter.heatPerAction,
  );
  const panicActive = isAntiNukePanicActive(guild.id);
  if (panicActive && roleId) {
    getPanicState(guild.id).createdRoleIds.add(String(roleId));
  }
  const instantCfg = ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive;
  if (panicActive && instantCfg?.enabled && instantCfg?.deleteCreatedRoles && roleId) {
    const me = guild.members?.me;
    const role =
      guild.roles.cache.get(String(roleId)) ||
      (await guild.roles.fetch(String(roleId)).catch(() => null));
    if (
      role &&
      !role.managed &&
      me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles) &&
      role.position < me.roles.highest.position
    ) {
      const removed = await role
        .delete("AntiNuke panic: delete role created during active panic")
        .then(() => true)
        .catch(() => false);
      const canQuarantine =
        instantCfg?.quarantineExecutor &&
        !shouldSkipPanicExecutorAction(guild.id, actorId, now);
      const quarantine = canQuarantine
        ? await quarantineExecutor(
          guild,
          actorId,
          "AntiNuke panic: role creation blocked during active panic",
        )
        : { applied: false, method: "cooldown" };
      if (removed) {
        await sendAntiNukeLog(
          guild,
          "AntiNuke: Panic Instant Rollback",
          [
            formatExecutorLine(actorId),
            `<:VC_right_arrow:1473441155055096081> **Action:** Role creation blocked during panic`,
            `<:VC_right_arrow:1473441155055096081> **Role:** \`${roleId}\``,
            `<:VC_right_arrow:1473441155055096081> **Result:** Role deleted immediately`,
            `<:VC_right_arrow:1473441155055096081> **Executor Quarantine:** ${quarantineOutcomeLabel(quarantine)}`,
          ],
        );
      }
      return;
    }
  }

  const { state } = getRoleCreationState(guild.id, trackerId);
  trimRoleCreationState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    Number(ANTINUKE_CONFIG.roleCreationFilter.heatPerAction || 10);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute =
    minuteCount >= Number(ANTINUKE_CONFIG.roleCreationFilter.minuteLimit || 5);
  const exceededHour =
    hourCount >= Number(ANTINUKE_CONFIG.roleCreationFilter.hourLimit || 15);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(
    guild,
    actorId,
    "AntiNuke: role creation spam detected",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Role Creations Filter",
    [
      formatExecutorLine(actorId),
      roleId
        ? `<:VC_right_arrow:1473441155055096081> **Last Role:** <@&${roleId}> \`${roleId}\``
        : null,
      `<:VC_right_arrow:1473441155055096081> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.roleCreationFilter.minuteLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.roleCreationFilter.hourLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Heat:** ${state.heat}/100`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function getRoleDeletionState(guildId, executorId) {
  cleanupTrackerMap(ROLE_DELETION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = ROLE_DELETION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  ROLE_DELETION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimRoleDeletionState(state, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    Number(ANTINUKE_CONFIG.roleDeletionFilter.heatPerAction || 25);
}

async function handleRoleDeletionAction({ guild, executorId, roleName = "", roleId = "" }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.roleDeletionFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { /* keep tracking even when audit is missing */ }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, roleId, "role:delete", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "role:delete",
      targetId: roleId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    "role delete",
    Number(ANTINUKE_CONFIG.roleDeletionFilter.heatPerAction || 25),
  );
  await enableAntiNukePanic(
    guild,
    "Role deletion filter",
    ANTINUKE_CONFIG.roleDeletionFilter.heatPerAction,
  );

  const { state } = getRoleDeletionState(guild.id, trackerId);
  trimRoleDeletionState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    Number(ANTINUKE_CONFIG.roleDeletionFilter.heatPerAction || 25);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute =
    minuteCount >= Number(ANTINUKE_CONFIG.roleDeletionFilter.minuteLimit || 3);
  const exceededHour =
    hourCount >= Number(ANTINUKE_CONFIG.roleDeletionFilter.hourLimit || 10);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(
    guild,
    actorId,
    "AntiNuke: role deletion spam detected",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Role Deletions Filter",
    [
      formatExecutorLine(actorId),
      roleId
        ? `<:VC_right_arrow:1473441155055096081> **Last Deleted Role:** ${roleName || "sconosciuto"} \`${roleId}\``
        : null,
      `<:VC_right_arrow:1473441155055096081> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.roleDeletionFilter.minuteLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.roleDeletionFilter.hourLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Heat:** ${state.heat}/100`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function getChannelCreationState(guildId, executorId) {
  cleanupTrackerMap(CHANNEL_CREATION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = CHANNEL_CREATION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  CHANNEL_CREATION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimChannelCreationState(state, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    Number(ANTINUKE_CONFIG.channelCreationFilter.heatPerAction || 16);
}

async function handleChannelCreationAction({ guild, executorId, channelId = "", channel = null }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.channelCreationFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { /* keep tracking even when audit is missing */ }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  if (isCategoryWhitelisted(channel)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, channelId, "channel:create", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "channel:create",
      targetId: channelId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    "channel create",
    Number(ANTINUKE_CONFIG.channelCreationFilter.heatPerAction || 16),
  );
  await enableAntiNukePanic(
    guild,
    "Channel creation filter",
    ANTINUKE_CONFIG.channelCreationFilter.heatPerAction,
  );
  const panicActive = isAntiNukePanicActive(guild.id);
  if (panicActive && channelId) {
    getPanicState(guild.id).createdChannelIds.add(String(channelId));
  }
  const instantCfg = ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive;
  if (panicActive && instantCfg?.enabled && instantCfg?.deleteCreatedChannels && channelId) {
    const me = guild.members?.me;
    const targetChannel =
      channel ||
      guild.channels.cache.get(String(channelId)) ||
      (await guild.channels.fetch(String(channelId)).catch(() => null));
    const canDelete =
      targetChannel?.deletable &&
      me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels);
    if (canDelete) {
      const removed = await targetChannel
        .delete("AntiNuke panic: delete channel created during active panic")
        .then(() => true)
        .catch(() => false);
      const canQuarantine =
        instantCfg?.quarantineExecutor &&
        !shouldSkipPanicExecutorAction(guild.id, actorId, now);
      const quarantine = canQuarantine
        ? await quarantineExecutor(
          guild,
          actorId,
          "AntiNuke panic: channel creation blocked during active panic",
        )
        : { applied: false, method: "cooldown" };
      if (removed) {
        await sendAntiNukeLog(
          guild,
          "AntiNuke: Panic Instant Rollback",
          [
            formatExecutorLine(actorId),
            `<:VC_right_arrow:1473441155055096081> **Action:** Channel creation blocked during panic`,
            `<:VC_right_arrow:1473441155055096081> **Channel:** \`${channelId}\``,
            `<:VC_right_arrow:1473441155055096081> **Result:** Channel deleted immediately`,
            `<:VC_right_arrow:1473441155055096081> **Executor Quarantine:** ${quarantineOutcomeLabel(quarantine)}`,
          ],
        );
      }
      return;
    }
  }

  const { state } = getChannelCreationState(guild.id, trackerId);
  trimChannelCreationState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    Number(ANTINUKE_CONFIG.channelCreationFilter.heatPerAction || 16);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute =
    minuteCount >= Number(ANTINUKE_CONFIG.channelCreationFilter.minuteLimit || 4);
  const exceededHour =
    hourCount >= Number(ANTINUKE_CONFIG.channelCreationFilter.hourLimit || 12);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(
    guild,
    actorId,
    "AntiNuke: channel creation spam detected",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Channel Creations Filter",
    [
      formatExecutorLine(actorId),
      channelId
        ? `<:VC_right_arrow:1473441155055096081> **Last Channel:** <#${channelId}> \`${channelId}\``
        : null,
      `<:VC_right_arrow:1473441155055096081> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.channelCreationFilter.minuteLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.channelCreationFilter.hourLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Heat:** ${state.heat}/100`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function getChannelDeletionState(guildId, executorId) {
  cleanupTrackerMap(CHANNEL_DELETION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = CHANNEL_DELETION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  CHANNEL_DELETION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimChannelDeletionState(state, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    Number(ANTINUKE_CONFIG.channelDeletionFilter.heatPerAction || 25);
}

async function handleChannelDeletionAction({ guild, executorId, channelName = "", channelId = "", channel = null }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.channelDeletionFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { /* keep tracking even when audit is missing */ }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  if (isCategoryWhitelisted(channel)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, channelId, "channel:delete", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "channel:delete",
      targetId: channelId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    "channel delete",
    Number(ANTINUKE_CONFIG.channelDeletionFilter.heatPerAction || 25),
  );
  await enableAntiNukePanic(
    guild,
    "Channel deletion filter",
    ANTINUKE_CONFIG.channelDeletionFilter.heatPerAction,
  );

  const { state } = getChannelDeletionState(guild.id, trackerId);
  trimChannelDeletionState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    Number(ANTINUKE_CONFIG.channelDeletionFilter.heatPerAction || 25);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute =
    minuteCount >= Number(ANTINUKE_CONFIG.channelDeletionFilter.minuteLimit || 3);
  const exceededHour =
    hourCount >= Number(ANTINUKE_CONFIG.channelDeletionFilter.hourLimit || 8);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(
    guild,
    actorId,
    "AntiNuke: channel deletion spam detected",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Channel Deletions Filter",
    [
      formatExecutorLine(actorId),
      channelId
        ? `<:VC_right_arrow:1473441155055096081> **Last Deleted Channel:** ${channelName || "sconosciuto"} \`${channelId}\``
        : null,
      `<:VC_right_arrow:1473441155055096081> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.channelDeletionFilter.minuteLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.channelDeletionFilter.hourLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Heat:** ${state.heat}/100`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function getWebhookCreationState(guildId, executorId) {
  cleanupTrackerMap(WEBHOOK_CREATION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = WEBHOOK_CREATION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  WEBHOOK_CREATION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimWebhookCreationState(state, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    Number(ANTINUKE_CONFIG.webhookCreationFilter.heatPerAction || 15);
}

async function handleWebhookCreationAction({
  guild,
  executorId,
  webhookId = "",
  channelId = "",
}) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.webhookCreationFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { /* keep tracking even when audit is missing */ }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const normalizedWebhookId = String(webhookId || "").trim();
  // Keep processing even without webhook id (audit can omit target details).
  const panicActive = isAntiNukePanicActive(guild.id);
  const now = Date.now();
  const trackerId = getTrackerExecutorId(
    actorId,
    normalizedWebhookId,
    "webhook:create",
    now,
  );
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "webhook:create",
      targetId: normalizedWebhookId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    "webhook create",
    Number(ANTINUKE_CONFIG.webhookCreationFilter.heatPerAction || 15),
  );
  await enableAntiNukePanic(
    guild,
    "Webhook creation filter",
    ANTINUKE_CONFIG.webhookCreationFilter.heatPerAction,
  );
  if (panicActive && normalizedWebhookId) {
    getPanicState(guild.id).createdWebhookIds.add(String(normalizedWebhookId));
  }
  const instantCfg = ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive;
  if (
    panicActive &&
    instantCfg?.enabled &&
    instantCfg?.deleteCreatedWebhooks &&
    normalizedWebhookId
  ) {
    const removed = await deleteWebhookById(guild, normalizedWebhookId, channelId);
    const canQuarantine =
      instantCfg?.quarantineExecutor &&
      !shouldSkipPanicExecutorAction(guild.id, actorId, now);
    const quarantine = canQuarantine
      ? await quarantineExecutor(
        guild,
        actorId,
        "AntiNuke panic: webhook creation blocked during active panic",
      )
      : { applied: false, method: "cooldown" };
    if (removed) {
      await sendAntiNukeLog(
        guild,
        "AntiNuke: Panic Instant Rollback",
        [
          formatExecutorLine(actorId),
          `<:VC_right_arrow:1473441155055096081> **Action:** Webhook creation blocked during panic`,
          `<:VC_right_arrow:1473441155055096081> **Webhook:** \`${normalizedWebhookId}\``,
          `<:VC_right_arrow:1473441155055096081> **Result:** Webhook deleted immediately`,
          `<:VC_right_arrow:1473441155055096081> **Executor Quarantine:** ${quarantineOutcomeLabel(quarantine)}`,
        ],
      );
    }
    return;
  }

  const { state } = getWebhookCreationState(guild.id, trackerId);
  trimWebhookCreationState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    Number(ANTINUKE_CONFIG.webhookCreationFilter.heatPerAction || 15);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute =
    minuteCount >= Number(ANTINUKE_CONFIG.webhookCreationFilter.minuteLimit || 3);
  const exceededHour =
    hourCount >= Number(ANTINUKE_CONFIG.webhookCreationFilter.hourLimit || 10);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(
    guild,
    actorId,
    "AntiNuke: webhook creation spam detected",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Webhook Creations Filter",
    [
      formatExecutorLine(actorId),
      normalizedWebhookId
        ? `<:VC_right_arrow:1473441155055096081> **Last Webhook:** \`${normalizedWebhookId}\``
        : null,
      `<:VC_right_arrow:1473441155055096081> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.webhookCreationFilter.minuteLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.webhookCreationFilter.hourLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Heat:** ${state.heat}/100`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function getWebhookDeletionState(guildId, executorId) {
  cleanupTrackerMap(WEBHOOK_DELETION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = WEBHOOK_DELETION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  WEBHOOK_DELETION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimWebhookDeletionState(state, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    Number(ANTINUKE_CONFIG.webhookDeletionFilter.heatPerAction || 10);
}

async function handleWebhookDeletionAction({ guild, executorId, webhookId = "" }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.webhookDeletionFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { /* keep tracking even when audit is missing */ }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const normalizedWebhookId = String(webhookId || "").trim();
  // Keep processing even without webhook id (audit can omit target details).
  const panicActive = isAntiNukePanicActive(guild.id);
  const now = Date.now();
  const trackerId = getTrackerExecutorId(
    actorId,
    normalizedWebhookId,
    "webhook:delete",
    now,
  );
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "webhook:delete",
      targetId: normalizedWebhookId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    "webhook delete",
    Number(ANTINUKE_CONFIG.webhookDeletionFilter.heatPerAction || 10),
  );
  await enableAntiNukePanic(
    guild,
    "Webhook deletion filter",
    ANTINUKE_CONFIG.webhookDeletionFilter.heatPerAction,
  );

  const { state } = getWebhookDeletionState(guild.id, trackerId);
  trimWebhookDeletionState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    Number(ANTINUKE_CONFIG.webhookDeletionFilter.heatPerAction || 10);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute =
    minuteCount >= Number(ANTINUKE_CONFIG.webhookDeletionFilter.minuteLimit || 3);
  const exceededHour =
    hourCount >= Number(ANTINUKE_CONFIG.webhookDeletionFilter.hourLimit || 8);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(
    guild,
    actorId,
    "AntiNuke: webhook deletion spam detected",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Webhook Deletions Filter",
    [
      formatExecutorLine(actorId),
      normalizedWebhookId
        ? `<:VC_right_arrow:1473441155055096081> **Last Webhook:** \`${normalizedWebhookId}\``
        : null,
      `<:VC_right_arrow:1473441155055096081> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.webhookDeletionFilter.minuteLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.webhookDeletionFilter.hourLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Heat:** ${state.heat}/100`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

function getInviteCreationState(guildId, executorId) {
  cleanupTrackerMap(INVITE_CREATION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = INVITE_CREATION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  INVITE_CREATION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimInviteCreationState(state, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    Number(ANTINUKE_CONFIG.inviteCreationFilter.heatPerAction || 12);
}

async function handleInviteCreationAction({
  guild,
  executorId,
  inviteCode = "",
  channelId = "",
}) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.inviteCreationFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { /* keep tracking even when audit is missing */ }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, inviteCode, "invite:create", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "invite:create",
      targetId: inviteCode,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    "invite create",
    Number(ANTINUKE_CONFIG.inviteCreationFilter.heatPerAction || 12),
  );
  await enableAntiNukePanic(
    guild,
    "Invite creation filter",
    ANTINUKE_CONFIG.inviteCreationFilter.heatPerAction,
  );

  const { state } = getInviteCreationState(guild.id, trackerId);
  trimInviteCreationState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    Number(ANTINUKE_CONFIG.inviteCreationFilter.heatPerAction || 12);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute =
    minuteCount >= Number(ANTINUKE_CONFIG.inviteCreationFilter.minuteLimit || 4);
  const exceededHour =
    hourCount >= Number(ANTINUKE_CONFIG.inviteCreationFilter.hourLimit || 15);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(
    guild,
    actorId,
    "AntiNuke: invite creation spam detected",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Invite Creations Filter",
    [
      formatExecutorLine(actorId),
      inviteCode
        ? `<:VC_right_arrow:1473441155055096081> **Invite:** \`${inviteCode}\``
        : null,
      channelId
        ? `<:VC_right_arrow:1473441155055096081> **Channel:** <#${channelId}> \`${channelId}\``
        : null,
      `<:VC_right_arrow:1473441155055096081> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.inviteCreationFilter.minuteLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.inviteCreationFilter.hourLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Heat:** ${state.heat}/100`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

async function handleRoleUpdate({ oldRole, newRole, executorId }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.autoQuarantine.strictMode) return;
  const guild = newRole?.guild || oldRole?.guild;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { /* keep tracking even when audit is missing */ }
  const addedDanger = dangerousAddedBits(
    oldRole?.permissions?.bitfield || 0n,
    newRole?.permissions?.bitfield || 0n,
    DANGEROUS_PERMS,
  );
  if (!addedDanger.length) return;
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(guild, "Dangerous role permission update", 100);

  const myMember = guild.members.me;
  if (!myMember?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;
  if (newRole.position >= myMember.roles.highest.position) return;

  await newRole.setPermissions(oldRole.permissions.bitfield, "AntiNuke: revert dangerous role perms").catch(() => {});
  const quarantine = await quarantineExecutor(
    guild,
    actorId,
    "AntiNuke: dangerous role permission update",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Role Quarantine",
    [
      formatExecutorLine(actorId),
      `<:VC_right_arrow:1473441155055096081> **Role:** ${newRole} \`${newRole.id}\``,
      `<:VC_right_arrow:1473441155055096081> **Action:** Dangerous permissions reverted`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ],
  );
}

async function handleMemberRoleAddition({ guild, targetMember, addedRoles, executorId }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.autoQuarantine.strictMemberRoleAddition) return;
  if (!guild || !targetMember || !Array.isArray(addedRoles) || !addedRoles.length) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { /* keep tracking even when audit is missing */ }
  const dangerousRoles = addedRoles.filter((role) =>
    containsDangerousBits(role?.permissions?.bitfield || 0n, DANGEROUS_PERMS),
  );
  if (!dangerousRoles.length) return;
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(guild, "Dangerous role added to member", 100);

  const myMember = guild.members.me;
  if (!myMember?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;

  const removable = dangerousRoles.filter((role) => role.position < myMember.roles.highest.position);
  if (!removable.length) return;
  await targetMember.roles.remove(removable, "AntiNuke: remove dangerous role grants").catch(() => {});
  const quarantine = await quarantineExecutor(
    guild,
    actorId,
    "AntiNuke: dangerous role granted to member",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Member Role Quarantine",
    [
      formatExecutorLine(actorId),
      `<:VC_right_arrow:1473441155055096081> **Target:** ${targetMember.user} \`${targetMember.id}\``,
      `<:VC_right_arrow:1473441155055096081> **Action:** Dangerous granted role(s) removed`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ],
  );
}

async function handleChannelOverwrite({
  guild,
  channel,
  overwrite,
  beforeAllow = 0n,
  afterAllow = 0n,
  executorId,
}) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.autoQuarantine.monitorChannelPermissions) return;
  if (!guild || !channel || !overwrite) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { /* keep tracking even when audit is missing */ }
  if (Number(overwrite.type) !== OverwriteType.Role) return;

  const mainRoleIds = getMainRoleIds(guild);
  if (!mainRoleIds.has(String(overwrite.id || ""))) return;

  const addedDanger = dangerousAddedBits(beforeAllow, afterAllow, DANGEROUS_CHANNEL_PERMS);
  if (!addedDanger.length) return;
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(guild, "Dangerous channel overwrite", 100);

  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) return;

  await channel.permissionOverwrites.edit(
    overwrite.id,
    { allow: beforeAllow, deny: overwrite.deny?.bitfield ?? 0n },
    { reason: "AntiNuke: revert dangerous channel overwrite permissions" },
  ).catch(() => {});

  const quarantine = await quarantineExecutor(
    guild,
    actorId,
    "AntiNuke: dangerous channel overwrite",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Channel Overwrite Quarantine",
    [
      formatExecutorLine(actorId),
      `<:VC_right_arrow:1473441155055096081> **Channel:** ${channel} \`${channel.id}\``,
      `<:VC_right_arrow:1473441155055096081> **Overwrite Role:** <@&${overwrite.id}> \`${overwrite.id}\``,
      `<:VC_right_arrow:1473441155055096081> **Action:** Dangerous channel perms reverted`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ],
  );
}

async function handleVanityGuard({ oldGuild, newGuild, executorId }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.vanityGuard) return;
  const guild = newGuild || oldGuild;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { /* keep tracking even when audit is missing */ }
  const oldVanity = String(oldGuild?.vanityURLCode || "");
  const newVanity = String(newGuild?.vanityURLCode || "");
  if (oldVanity === newVanity) return;
  if (!oldVanity || !newGuild?.setVanityCode) return;
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(guild, "Vanity URL unauthorized update", 100);

  await newGuild.setVanityCode(oldVanity, "AntiNuke: restore vanity url").catch(() => {});
  const quarantine = await quarantineExecutor(
    guild,
    actorId,
    "AntiNuke: unauthorized vanity update",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Vanity Guard",
    [
      formatExecutorLine(actorId),
      `<:VC_right_arrow:1473441155055096081> **Action:** Vanity restored to \`${oldVanity}\``,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ],
  );
}

async function handlePruneAction({ guild, executorId, removedCount = 0 }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.detectPrune) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { /* keep tracking even when audit is missing */ }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(guild, "Member prune detected", 100);
  const quarantine = await quarantineExecutor(
    guild,
    actorId,
    "AntiNuke: member prune detected",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Member Prune",
    [
      formatExecutorLine(actorId),
      `<:VC_right_arrow:1473441155055096081> **Action:** Member prune`,
      `<:VC_right_arrow:1473441155055096081> **Removed:** ${Number(removedCount || 0)}`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ],
  );
}

async function handleThreadCreationAction({
  guild,
  executorId,
  threadId = "",
  thread = null,
}) {
  return handleChannelCreationAction({
    guild,
    executorId,
    channelId: threadId,
    channel: thread,
  });
}

async function handleThreadDeletionAction({
  guild,
  executorId,
  threadName = "",
  threadId = "",
  thread = null,
}) {
  return handleChannelDeletionAction({
    guild,
    executorId,
    channelName: threadName,
    channelId: threadId,
    channel: thread,
  });
}

function applyPresetSection(target, patch) {
  if (!target || !patch || typeof patch !== "object") return;
  for (const [k, v] of Object.entries(patch)) {
    target[k] = v;
  }
}

function applyAntiNukePreset(name = "balanced") {
  const presetKey = String(name || "").toLowerCase();
  const preset = ANTINUKE_PRESETS[presetKey];
  if (!preset) return { ok: false, reason: "invalid_preset" };
  applyPresetSection(ANTINUKE_CONFIG.kickBanFilter, preset.kickBanFilter);
  applyPresetSection(ANTINUKE_CONFIG.roleCreationFilter, preset.roleCreationFilter);
  applyPresetSection(ANTINUKE_CONFIG.roleDeletionFilter, preset.roleDeletionFilter);
  applyPresetSection(ANTINUKE_CONFIG.channelCreationFilter, preset.channelCreationFilter);
  applyPresetSection(ANTINUKE_CONFIG.channelDeletionFilter, preset.channelDeletionFilter);
  applyPresetSection(ANTINUKE_CONFIG.webhookCreationFilter, preset.webhookCreationFilter);
  applyPresetSection(ANTINUKE_CONFIG.webhookDeletionFilter, preset.webhookDeletionFilter);
  applyPresetSection(ANTINUKE_CONFIG.inviteCreationFilter, preset.inviteCreationFilter);
  applyPresetSection(ANTINUKE_CONFIG.panicMode, preset.panicMode);
  saveAntiNukePersistentConfig();
  return { ok: true, preset: presetKey };
}

function getAntiNukeStatusSnapshot(guildId = "") {
  const now = Date.now();
  const panicState = guildId ? getPanicState(guildId) : null;
  const activeUntil = Number(panicState?.activeUntil || 0);
  const maintenanceEntries = [];
  if (guildId) {
    cleanupMaintenanceAllowlist(guildId, now);
    const bucket = MAINTENANCE_ALLOWLIST.get(String(guildId || ""));
    if (bucket?.size) {
      for (const [userId, expiresAt] of bucket.entries()) {
        maintenanceEntries.push({
          userId: String(userId),
          expiresAt: Number(expiresAt || 0),
          remainingMs: Math.max(0, Number(expiresAt || 0) - now),
        });
      }
      maintenanceEntries.sort((a, b) => a.expiresAt - b.expiresAt);
    }
  }

  const trackerSizes = {
    kickBan: KICK_BAN_TRACKER.size,
    roleCreate: ROLE_CREATION_TRACKER.size,
    roleDelete: ROLE_DELETION_TRACKER.size,
    channelCreate: CHANNEL_CREATION_TRACKER.size,
    channelDelete: CHANNEL_DELETION_TRACKER.size,
    webhookCreate: WEBHOOK_CREATION_TRACKER.size,
    webhookDelete: WEBHOOK_DELETION_TRACKER.size,
    inviteCreate: INVITE_CREATION_TRACKER.size,
  };

  return {
    enabled: Boolean(ANTINUKE_CONFIG.enabled),
    panicModeEnabled: Boolean(ANTINUKE_CONFIG.panicMode.enabled),
    panicActive: guildId ? activeUntil > now : false,
    panicActiveUntil: activeUntil,
    panicRemainingMs: guildId ? Math.max(0, activeUntil - now) : 0,
    maintenanceEntries,
    trackerSizes,
    config: {
      kickBanFilter: { ...ANTINUKE_CONFIG.kickBanFilter },
      roleCreationFilter: { ...ANTINUKE_CONFIG.roleCreationFilter },
      roleDeletionFilter: { ...ANTINUKE_CONFIG.roleDeletionFilter },
      channelCreationFilter: { ...ANTINUKE_CONFIG.channelCreationFilter },
      channelDeletionFilter: { ...ANTINUKE_CONFIG.channelDeletionFilter },
      webhookCreationFilter: { ...ANTINUKE_CONFIG.webhookCreationFilter },
      webhookDeletionFilter: { ...ANTINUKE_CONFIG.webhookDeletionFilter },
      inviteCreationFilter: { ...ANTINUKE_CONFIG.inviteCreationFilter },
      panicMode: {
        enabled: Boolean(ANTINUKE_CONFIG.panicMode.enabled),
        thresholdHeat: Number(ANTINUKE_CONFIG.panicMode.thresholdHeat || 0),
        decayPerSec: Number(ANTINUKE_CONFIG.panicMode.decayPerSec || 0),
        durationMs: Number(ANTINUKE_CONFIG.panicMode.durationMs || 0),
        maxDurationMs: Number(ANTINUKE_CONFIG.panicMode.maxDurationMs || 0),
        extendByMsOnTrigger: Number(ANTINUKE_CONFIG.panicMode.extendByMsOnTrigger || 0),
        lockdown: {
          dangerousRoles: Boolean(
            ANTINUKE_CONFIG.panicMode.lockdown?.dangerousRoles,
          ),
          lockModerationCommands: Boolean(
            ANTINUKE_CONFIG.panicMode.lockdown?.lockModerationCommands,
          ),
        },
      },
    },
  };
}

async function stopAntiNukePanic(guild, reason = "manual stop", stoppedById = "") {
  if (!guild?.id) return { ok: false, reason: "missing_guild" };
  const state = getPanicState(guild.id);
  const wasActive = Number(state.activeUntil || 0) > Date.now();
  state.activeUntil = 0;
  state.panicStartedAt = 0;
  state.heat = 0;
  state.lastAt = Date.now();
  if (state.unlockTimer) {
    clearTimeout(state.unlockTimer);
    state.unlockTimer = null;
  }
  await unlockDangerousRolesAfterPanic(guild, state);
  await runAutoBackupSyncAfterPanic(guild, state);
  await sendAntiNukeLog(
    guild,
    "AntiNuke Panic Mode Ended",
    [
      stoppedById
        ? `<:VC_right_arrow:1473441155055096081> **Executor:** <@${stoppedById}> \`${stoppedById}\``
        : null,
      `<:VC_right_arrow:1473441155055096081> **Reason:** ${reason || "manual stop"}`,
      `<:VC_right_arrow:1473441155055096081> **Action:** Panic mode disabled manually`,
      `<:VC_right_arrow:1473441155055096081> **Was Active:** ${wasActive ? "Yes" : "No"}`,
    ].filter(Boolean),
    "#57F287",
  );
  return { ok: true, wasActive };
}

function addMaintenanceAllowlistUser(guildId, userId, durationMs = 15 * 60_000) {
  const g = String(guildId || "");
  const u = String(userId || "");
  if (!g || !u) return { ok: false, reason: "missing_ids" };
  const safeDuration = Math.max(60_000, Math.min(MAINTENANCE_MAX_MS, Number(durationMs || 0)));
  cleanupMaintenanceAllowlist(g, Date.now());
  const bucket = MAINTENANCE_ALLOWLIST.get(g) || new Map();
  const expiresAt = Date.now() + safeDuration;
  bucket.set(u, expiresAt);
  MAINTENANCE_ALLOWLIST.set(g, bucket);
  return { ok: true, expiresAt, durationMs: safeDuration };
}

function removeMaintenanceAllowlistUser(guildId, userId) {
  const g = String(guildId || "");
  const u = String(userId || "");
  if (!g || !u) return { ok: false, reason: "missing_ids" };
  cleanupMaintenanceAllowlist(g, Date.now());
  const bucket = MAINTENANCE_ALLOWLIST.get(g);
  if (!bucket) return { ok: true, removed: false };
  const removed = bucket.delete(u);
  if (!bucket.size) MAINTENANCE_ALLOWLIST.delete(g);
  return { ok: true, removed };
}

function listMaintenanceAllowlist(guildId) {
  const g = String(guildId || "");
  if (!g) return [];
  const now = Date.now();
  cleanupMaintenanceAllowlist(g, now);
  const bucket = MAINTENANCE_ALLOWLIST.get(g);
  if (!bucket?.size) return [];
  return Array.from(bucket.entries())
    .map(([userId, expiresAt]) => ({
      userId: String(userId),
      expiresAt: Number(expiresAt || 0),
      remainingMs: Math.max(0, Number(expiresAt || 0) - now),
    }))
    .sort((a, b) => a.expiresAt - b.expiresAt);
}

async function shouldBlockModerationCommands(guild, userId) {
  if (!ANTINUKE_CONFIG.enabled) return false;
  if (!ANTINUKE_CONFIG.panicMode.enabled) return false;
  if (!ANTINUKE_CONFIG.panicMode.lockdown.lockModerationCommands) return false;
  if (!guild?.id || !userId) return false;
  if (!isAntiNukePanicActive(guild.id)) return false;
  if (String(guild.ownerId || "") === String(userId)) return false;
  const member =
    guild.members.cache.get(String(userId)) ||
    (await guild.members.fetch(String(userId)).catch(() => null));
  if (
    member?.permissions?.has?.(PermissionsBitField.Flags.Administrator) ||
    member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)
  ) {
    return false;
  }
  const emergencyBypassRoleIds = new Set(
    [
      IDs.roles.Founder,
      IDs.roles.CoFounder,
      IDs.roles.Manager,
      IDs.roles.Admin,
      IDs.roles.HighStaff,
      IDs.roles.Supervisor,
      IDs.roles.Coordinator,
    ]
      .filter(Boolean)
      .map(String),
  );
  if (
    member &&
    [...emergencyBypassRoleIds].some((roleId) =>
      member.roles?.cache?.has?.(String(roleId)),
    )
  ) {
    return false;
  }
  return !(await isWhitelistedExecutorAsync(guild, userId));
}

module.exports = {
  ANTINUKE_CONFIG,
  ANTINUKE_PRESETS,
  handleRoleUpdate,
  handleMemberRoleAddition,
  handleChannelOverwrite,
  handleVanityGuard,
  handleKickBanAction,
  handleRoleCreationAction,
  handleRoleDeletionAction,
  handleChannelCreationAction,
  handleChannelDeletionAction,
  handleWebhookCreationAction,
  handleWebhookDeletionAction,
  handleInviteCreationAction,
  handleThreadCreationAction,
  handleThreadDeletionAction,
  handlePruneAction,
  isAntiNukePanicActive,
  shouldBlockModerationCommands,
  isWhitelistedExecutor,
  isWhitelistedExecutorAsync,
  applyAntiNukePreset,
  getAntiNukeStatusSnapshot,
  stopAntiNukePanic,
  addMaintenanceAllowlistUser,
  removeMaintenanceAllowlistUser,
  listMaintenanceAllowlist,
};
