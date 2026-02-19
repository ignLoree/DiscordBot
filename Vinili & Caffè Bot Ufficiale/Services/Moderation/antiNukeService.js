const {
  EmbedBuilder,
  PermissionsBitField,
  OverwriteType,
  UserFlagsBitField,
} = require("discord.js");
const IDs = require("../../Utils/Config/ids");
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
const ANTINUKE_PANIC_STATE = new Map();
const QUARANTINE_ROLE_TIMERS = new Map();
const VERIFIED_BOT_CACHE = new Map();
const ANTINUKE_LOG_DEDUPE = new Map();
const ANTINUKE_LOG_DEDUPE_TTL_MS = 12_000;

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
  panicMode: {
    enabled: true,
    useHeatAlgorithm: true,
    thresholdHeat: 100,
    decayPerSec: 5,
    durationMs: 10 * 60_000,
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
  },
};

function hasAllPerms(member, flags) {
  return flags.every((flag) => member?.permissions?.has?.(flag));
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

function isWhitelistedExecutor(guild, executorId) {
  const userId = String(executorId || "");
  if (!userId) return true;
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
  if (!userId) return true;
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
  const key = String(guildId || "");
  const existing = ANTINUKE_PANIC_STATE.get(key);
  if (existing) return existing;
  const initial = {
    heat: 0,
    lastAt: Date.now(),
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
    if (allowlist?.size && !allowlist.has(String(role.id))) continue;
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

  state.activeUntil = Math.max(
    Number(state.activeUntil || 0),
    now + Number(ANTINUKE_CONFIG.panicMode.durationMs || 0),
  );
  state.heat = 0;

  await lockDangerousRolesForPanic(guild, state);

  if (state.unlockTimer) clearTimeout(state.unlockTimer);
  state.unlockTimer = setTimeout(async () => {
    const current = getPanicState(guild.id);
    current.unlockTimer = null;
    if (Number(current.activeUntil || 0) > Date.now()) return;
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

  if (!wasActive) {
    await sendAntiNukeLog(
      guild,
      "AntiNuke Panic Mode Enabled",
      [
        `<:VC_right_arrow:1473441155055096081> **Reason:** ${reason || "threshold reached"}`,
        `<:VC_right_arrow:1473441155055096081> **Heat Algorithm:** ${ANTINUKE_CONFIG.panicMode.useHeatAlgorithm ? "ON" : "OFF"}`,
        `<:VC_right_arrow:1473441155055096081> **Duration:** ${Math.round(ANTINUKE_CONFIG.panicMode.durationMs / 60_000)} min`,
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
  const actorId = String(executorId || "");
  if (!actorId) return;
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(
    guild,
    `Kick/Ban filter: ${action}`,
    ANTINUKE_CONFIG.kickBanFilter.heatPerAction,
  );

  const now = Date.now();
  const { state } = getKickBanState(guild.id, actorId);
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
      `<:VC_right_arrow:1473441155055096081> **Executor:** <@${actorId}> \`${actorId}\``,
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
  const actorId = String(executorId || "");
  if (!actorId) return;
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(
    guild,
    "Role creation filter",
    ANTINUKE_CONFIG.roleCreationFilter.heatPerAction,
  );
  if (isAntiNukePanicActive(guild.id) && roleId) {
    getPanicState(guild.id).createdRoleIds.add(String(roleId));
  }

  const now = Date.now();
  const { state } = getRoleCreationState(guild.id, actorId);
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
      `<:VC_right_arrow:1473441155055096081> **Executor:** <@${actorId}> \`${actorId}\``,
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
  const actorId = String(executorId || "");
  if (!actorId) return;
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(
    guild,
    "Role deletion filter",
    ANTINUKE_CONFIG.roleDeletionFilter.heatPerAction,
  );

  const now = Date.now();
  const { state } = getRoleDeletionState(guild.id, actorId);
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
      `<:VC_right_arrow:1473441155055096081> **Executor:** <@${actorId}> \`${actorId}\``,
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
  const actorId = String(executorId || "");
  if (!actorId) return;
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  if (isCategoryWhitelisted(channel)) return;
  await enableAntiNukePanic(
    guild,
    "Channel creation filter",
    ANTINUKE_CONFIG.channelCreationFilter.heatPerAction,
  );
  if (isAntiNukePanicActive(guild.id) && channelId) {
    getPanicState(guild.id).createdChannelIds.add(String(channelId));
  }

  const now = Date.now();
  const { state } = getChannelCreationState(guild.id, actorId);
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
      `<:VC_right_arrow:1473441155055096081> **Executor:** <@${actorId}> \`${actorId}\``,
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
  const actorId = String(executorId || "");
  if (!actorId) return;
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  if (isCategoryWhitelisted(channel)) return;
  await enableAntiNukePanic(
    guild,
    "Channel deletion filter",
    ANTINUKE_CONFIG.channelDeletionFilter.heatPerAction,
  );

  const now = Date.now();
  const { state } = getChannelDeletionState(guild.id, actorId);
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
      `<:VC_right_arrow:1473441155055096081> **Executor:** <@${actorId}> \`${actorId}\``,
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

async function handleWebhookCreationAction({ guild, executorId, webhookId = "" }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.webhookCreationFilter.enabled) return;
  if (!guild) return;
  const actorId = String(executorId || "");
  if (!actorId) return;
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(
    guild,
    "Webhook creation filter",
    ANTINUKE_CONFIG.webhookCreationFilter.heatPerAction,
  );
  if (isAntiNukePanicActive(guild.id) && webhookId) {
    getPanicState(guild.id).createdWebhookIds.add(String(webhookId));
  }

  const now = Date.now();
  const { state } = getWebhookCreationState(guild.id, actorId);
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
      `<:VC_right_arrow:1473441155055096081> **Executor:** <@${actorId}> \`${actorId}\``,
      webhookId
        ? `<:VC_right_arrow:1473441155055096081> **Last Webhook:** \`${webhookId}\``
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
  const actorId = String(executorId || "");
  if (!actorId) return;
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(
    guild,
    "Webhook deletion filter",
    ANTINUKE_CONFIG.webhookDeletionFilter.heatPerAction,
  );

  const now = Date.now();
  const { state } = getWebhookDeletionState(guild.id, actorId);
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
      `<:VC_right_arrow:1473441155055096081> **Executor:** <@${actorId}> \`${actorId}\``,
      webhookId
        ? `<:VC_right_arrow:1473441155055096081> **Last Webhook:** \`${webhookId}\``
        : null,
      `<:VC_right_arrow:1473441155055096081> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.webhookDeletionFilter.minuteLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.webhookDeletionFilter.hourLimit}`,
      `<:VC_right_arrow:1473441155055096081> **Heat:** ${state.heat}/100`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

async function handleRoleUpdate({ oldRole, newRole, executorId }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.autoQuarantine.strictMode) return;
  const guild = newRole?.guild || oldRole?.guild;
  if (!guild) return;
  const addedDanger = dangerousAddedBits(
    oldRole?.permissions?.bitfield || 0n,
    newRole?.permissions?.bitfield || 0n,
    DANGEROUS_PERMS,
  );
  if (!addedDanger.length) return;
  if (await isWhitelistedExecutorAsync(guild, executorId)) return;
  await enableAntiNukePanic(guild, "Dangerous role permission update", 100);

  const myMember = guild.members.me;
  if (!myMember?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;
  if (newRole.position >= myMember.roles.highest.position) return;

  await newRole.setPermissions(oldRole.permissions.bitfield, "AntiNuke: revert dangerous role perms").catch(() => {});
  const quarantine = await quarantineExecutor(
    guild,
    executorId,
    "AntiNuke: dangerous role permission update",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Role Quarantine",
    [
      `<:VC_right_arrow:1473441155055096081> **Executor:** <@${executorId}> \`${executorId}\``,
      `<:VC_right_arrow:1473441155055096081> **Role:** ${newRole} \`${newRole.id}\``,
      `<:VC_right_arrow:1473441155055096081> **Action:** Dangerous permissions reverted`,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ],
  );
}

async function handleMemberRoleAddition({ guild, targetMember, addedRoles, executorId }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.autoQuarantine.strictMemberRoleAddition) return;
  if (!guild || !targetMember || !Array.isArray(addedRoles) || !addedRoles.length) return;
  const dangerousRoles = addedRoles.filter((role) =>
    containsDangerousBits(role?.permissions?.bitfield || 0n, DANGEROUS_PERMS),
  );
  if (!dangerousRoles.length) return;
  if (await isWhitelistedExecutorAsync(guild, executorId)) return;
  await enableAntiNukePanic(guild, "Dangerous role added to member", 100);

  const myMember = guild.members.me;
  if (!myMember?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;

  const removable = dangerousRoles.filter((role) => role.position < myMember.roles.highest.position);
  if (!removable.length) return;
  await targetMember.roles.remove(removable, "AntiNuke: remove dangerous role grants").catch(() => {});
  const quarantine = await quarantineExecutor(
    guild,
    executorId,
    "AntiNuke: dangerous role granted to member",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Member Role Quarantine",
    [
      `<:VC_right_arrow:1473441155055096081> **Executor:** <@${executorId}> \`${executorId}\``,
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
  if (Number(overwrite.type) !== OverwriteType.Role) return;

  const mainRoleIds = getMainRoleIds(guild);
  if (!mainRoleIds.has(String(overwrite.id || ""))) return;

  const addedDanger = dangerousAddedBits(beforeAllow, afterAllow, DANGEROUS_CHANNEL_PERMS);
  if (!addedDanger.length) return;
  if (await isWhitelistedExecutorAsync(guild, executorId)) return;
  await enableAntiNukePanic(guild, "Dangerous channel overwrite", 100);

  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) return;

  await channel.permissionOverwrites.edit(
    overwrite.id,
    { allow: beforeAllow, deny: overwrite.deny?.bitfield ? 0n },
    { reason: "AntiNuke: revert dangerous channel overwrite permissions" },
  ).catch(() => {});

  const quarantine = await quarantineExecutor(
    guild,
    executorId,
    "AntiNuke: dangerous channel overwrite",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Channel Overwrite Quarantine",
    [
      `<:VC_right_arrow:1473441155055096081> **Executor:** <@${executorId}> \`${executorId}\``,
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
  const oldVanity = String(oldGuild?.vanityURLCode || "");
  const newVanity = String(newGuild?.vanityURLCode || "");
  if (oldVanity === newVanity) return;
  if (!oldVanity || !newGuild?.setVanityCode) return;
  if (await isWhitelistedExecutorAsync(guild, executorId)) return;
  await enableAntiNukePanic(guild, "Vanity URL unauthorized update", 100);

  await newGuild.setVanityCode(oldVanity, "AntiNuke: restore vanity url").catch(() => {});
  const quarantine = await quarantineExecutor(
    guild,
    executorId,
    "AntiNuke: unauthorized vanity update",
  );
  await sendAntiNukeLog(
    guild,
    "AntiNuke: Vanity Guard",
    [
      `<:VC_right_arrow:1473441155055096081> **Executor:** <@${executorId}> \`${executorId}\``,
      `<:VC_right_arrow:1473441155055096081> **Action:** Vanity restored to \`${oldVanity}\``,
      `<:VC_right_arrow:1473441155055096081> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ],
  );
}

async function handlePruneAction({ guild, executorId, removedCount = 0 }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.detectPrune) return;
  if (!guild) return;
  const actorId = String(executorId || "");
  if (!actorId) return;
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
      `<:VC_right_arrow:1473441155055096081> **Executor:** <@${actorId}> \`${actorId}\``,
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

async function shouldBlockModerationCommands(guild, userId) {
  if (!ANTINUKE_CONFIG.enabled) return false;
  if (!ANTINUKE_CONFIG.panicMode.enabled) return false;
  if (!ANTINUKE_CONFIG.panicMode.lockdown.lockModerationCommands) return false;
  if (!guild?.id || !userId) return false;
  if (!isAntiNukePanicActive(guild.id)) return false;
  return !(await isWhitelistedExecutorAsync(guild, userId));
}

module.exports = {
  ANTINUKE_CONFIG,
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
  handleThreadCreationAction,
  handleThreadDeletionAction,
  handlePruneAction,
  isAntiNukePanicActive,
  shouldBlockModerationCommands,
  isWhitelistedExecutor,
};



