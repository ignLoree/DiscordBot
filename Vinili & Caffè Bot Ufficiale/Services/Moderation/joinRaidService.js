const { EmbedBuilder, PermissionsBitField } = require("discord.js");
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

const JOIN_RAID_CONFIG = {
  enabled: true,
  triggerAction: "ban", // ban | kick | log
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

const GUILD_STATE = new Map();
const TEMP_BAN_TIMERS = new Map();
const SAVE_TIMERS = new Map();
const LOADED_GUILDS = new Set();

function getGuildState(guildId) {
  const key = String(guildId || "");
  const existing = GUILD_STATE.get(key);
  if (existing) return existing;
  const initial = {
    samples: [],
    flagged: [],
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
  LOADED_GUILDS.add(key);
  if (!isDbReady()) return;
  try {
    const row = await JoinRaidState.findOne({ guildId: key }).lean();
    if (!row) return;
    GUILD_STATE.set(key, {
      samples: Array.isArray(row.samples) ? row.samples : [],
      flagged: Array.isArray(row.flagged) ? row.flagged : [],
      raidUntil: Number(row.raidUntil || 0),
    });
  } catch {
    // Do not block runtime if persistence fails.
  }
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
    action === "ban" ? "banned" : action === "kick" ? "kicked" : "flagged";
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

async function scheduleTempUnban(guild, userId, reason) {
  const key = `${guild.id}:${userId}`;
  const old = TEMP_BAN_TIMERS.get(key);
  if (old) clearTimeout(old);
  const timer = setTimeout(async () => {
    TEMP_BAN_TIMERS.delete(key);
    await guild.members.unban(userId, reason).catch(() => {});
  }, JOIN_RAID_CONFIG.raidDurationMs);
  TEMP_BAN_TIMERS.set(key, timer);
}

async function applyPunishment(member, reasons) {
  const action = JOIN_RAID_CONFIG.triggerAction;
  const guild = member.guild;
  const me = guild.members.me;
  const dmSent = await sendPunishDm(member, action, reasons);

  let punished = false;
  let appliedAction = action;
  if (action === "ban") {
    if (me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
      punished = await guild.members
        .ban(member.id, {
          deleteMessageSeconds: 0,
          reason: "Join Raid: flagged account during raid window",
        })
        .then(() => true)
        .catch(() => false);
      if (punished) {
        await scheduleTempUnban(
          guild,
          member.id,
          "Join Raid temporary ban elapsed",
        );
      }
    }
  } else if (action === "kick") {
    punished = await member
      .kick("Join Raid: flagged account during raid window")
      .then(() => true)
      .catch(() => false);
  }

  if (!punished && action !== "log") {
    appliedAction = "log";
  }

  await sendJoinRaidLog(
    guild,
    `${member.user.username} has been ${appliedAction}${action === "ban" ? "ned" : action === "kick" ? "ed" : ""} by Join Raid!`,
    [
      `${ARROW} **JoinRaid Filter:** ${reasons.map((x) => x.label).join(", ") || "N/A"}`,
      `${ARROW} **Member:** ${member.user} [\`${member.id}\`]`,
      `${ARROW} **Action:** ${appliedAction}`,
      action === "ban"
        ? `${ARROW} **Duration:** ${Math.round(
            JOIN_RAID_CONFIG.raidDurationMs / 60_000,
          )} minutes`
        : null,
      `${ARROW} **DM Sent:** ${dmSent ? "Yes" : "No"}`,
      `${ARROW} **Punished:** ${punished ? "Yes" : "No"}`,
    ],
    punished ? "#ED4245" : "#F59E0B",
  );
  return punished;
}

async function processJoinRaidForMember(member) {
  if (!JOIN_RAID_CONFIG.enabled) return { blocked: false };
  if (!member?.guild || !member?.user) return { blocked: false };
  if (
    CORE_EXEMPT_USER_IDS.has(String(member.id || "")) ||
    String(member.guild.ownerId || "") === String(member.id || "")
  ) {
    return { blocked: false };
  }

  await loadGuildState(member.guild.id);
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

  if (reasons.length) {
    state.flagged.push({
      ts: at,
      userId: String(member.id),
      reasons: reasons.map((x) => x.key),
    });
  }
  pruneState(state, at);
  scheduleStateSave(member.guild.id);

  const flaggedCount = state.flagged.length;
  const wasActive = Number(state.raidUntil || 0) > at;
  if (!wasActive && flaggedCount >= JOIN_RAID_CONFIG.triggerCount) {
    state.raidUntil = at + JOIN_RAID_CONFIG.raidDurationMs;
    const untilTs = Math.floor(state.raidUntil / 1000);
    await warnRaidRoles(member.guild, [
      `Join Raid triggered: **${flaggedCount}** flagged accounts in the last **${Math.round(
        JOIN_RAID_CONFIG.triggerWindowMs / 60 / 60_000,
      )}h**.`,
      `Raid protection active until <t:${untilTs}:F>.`,
    ]);
    await sendJoinRaidLog(
      member.guild,
      "Join Raid protection enabled",
      [
        `${ARROW} **Trigger Count:** ${flaggedCount}/${JOIN_RAID_CONFIG.triggerCount}`,
        `${ARROW} **Window:** ${Math.round(
          JOIN_RAID_CONFIG.triggerWindowMs / 60 / 60_000,
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
  if (active && reasons.length) {
    await applyPunishment(member, reasons);
    return { blocked: true, action: JOIN_RAID_CONFIG.triggerAction, reasons };
  }
  return { blocked: false, flagged: reasons.length > 0, reasons };
}

module.exports = {
  JOIN_RAID_CONFIG,
  processJoinRaidForMember,
};
