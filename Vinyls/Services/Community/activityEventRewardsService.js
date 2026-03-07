const { ActivityEventReward, ExpUser, EventUserExpSnapshot, EventWeekWinner, VoteRole } = require("../../Schemas/Community/communitySchemas");
const { getGuildExpSettings, addExp, getTotalExpForLevel, getLevelInfo, recordLevelHistory, isEventStaffMember, scheduleEventLevelUpMessage } = require("./expService");
const IDs = require("../../Utils/Config/ids");
const { sendEventRewardLog, sendEventRewardSkippedLog, sendEventRewardDm } = require("./eventRewardLogService");
const TIME_ZONE_ROME = "Europe/Rome";

function getRomeOffsetMs(utcDate) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE_ROME, timeZoneName: "shortOffset", hour: "2-digit", });
  const zoneName = formatter.formatToParts(utcDate).find((part) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i,);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year, month, day, hour, minute, second) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

function getRomeDayBoundsForDate(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE_ROME, year: "numeric", month: "2-digit", day: "2-digit", });
  const parts = fmt.formatToParts(date).reduce((acc, part) => { if (part.type !== "literal") acc[part.type] = part.value; return acc; }, {});
  const year = Number(parts.year || 0);
  const month = Number(parts.month || 1);
  const day = Number(parts.day || 1);
  const startRome = createUtcFromRomeLocal(year, month, day, 0, 0, 0);
  const endRome = createUtcFromRomeLocal(year, month, day + 1, 0, 0, 0);
  return { startRome, endRome };
}

async function isEventActive(guildId) {
  if (!guildId) return false;
  const settings = await getGuildExpSettings(guildId);
  return Boolean(settings?.eventExpiresAt);
}

async function grantEventLevels(guildId, userId, levels, note = null, member = null, clientOrGuild = null, options = {}) {
  if (!guildId || !userId || !Number.isFinite(levels) || levels <= 0)
    return null;
  const active = await isEventActive(guildId);
  if (!active) return null;

  const { ExpUser } = require("../../Schemas/Community/communitySchemas");
  let doc = await ExpUser.findOne({ guildId, userId });
  if (!doc) doc = new ExpUser({ guildId, userId });
  const currentExp = Math.max(0, Math.floor(Number(doc.totalExp || 0)));
  const currentLevel = getLevelInfo(currentExp).level;
  const targetLevel = currentLevel + Math.floor(Number(levels));
  const expToAdd = Math.max(0, getTotalExpForLevel(targetLevel) - getTotalExpForLevel(currentLevel),);
  if (expToAdd <= 0) return { doc, added: 0 };

  if (clientOrGuild) {
    const guild = clientOrGuild?.guilds?.cache?.get(guildId) ?? (await clientOrGuild?.guilds?.fetch(guildId).catch(() => null));
    const mem = guild ? (guild.members?.cache?.get(userId) ?? (await guild.members?.fetch(userId).catch(() => null))) : null;
    if (mem?.user?.bot) return null;
  }

  const result = await addExp(guildId, userId, expToAdd, false, null);
  if (!result) return null;
  const suppressLog = Boolean(options?.suppressLog);
  const suppressDm = Boolean(options?.suppressDm);
  if (clientOrGuild && !suppressLog) {
    const client = clientOrGuild?.client ?? clientOrGuild;
    const label = note && note.length <= 100 ? note : `+${levels} livelli`;
    sendEventRewardLog(client, {
      userId,
      guildId,
      label,
      detail: note && note.length > 100 ? note : undefined,
      levels,
    }).catch(() => { });
    if (!suppressDm) {
      sendEventRewardDm(client, userId, guildId, { label, levels }).catch(() => { });
    }
  }
  if (result && clientOrGuild) {
    const newLevel = getLevelInfo(result.afterExp).level;
    if (newLevel >= 1) scheduleEventLevelUpMessage(clientOrGuild, guildId, userId, newLevel);
  }
  return result;
}

async function grantEventRewardOnce(guildId, userId, rewardType, options = {}) {
  if (!guildId || !userId || !rewardType) return null;
  const active = await isEventActive(guildId);
  if (!active) return null;

  const levels = Number(options.levels);
  const tier = options.tier != null ? Number(options.tier) : null;
  if (!Number.isFinite(levels) || levels <= 0) return null;

  const rewardTypeStr = String(rewardType);
  const tierVal = tier != null ? tier : null;
  const labelMap = { supporter: "Ruolo Supporter", verificato: "Ruolo Verificato/Verificata", guilded: "Ruolo Guilded", invite: "Inviti (soglia raggiunta)", voter: "Voto Discadia", recensione: "Recensione DISBOARD", };

  try {
    await ActivityEventReward.create({
      guildId,
      userId,
      rewardType: rewardTypeStr,
      tier: tierVal,
    });
  } catch (err) {
    if (err?.code === 11000) {
      if (options.clientOrGuild && !options.suppressSkipLog) {
        const client = options.clientOrGuild?.client ?? options.clientOrGuild;
        sendEventRewardSkippedLog(client, {
          userId,
          guildId,
          label: labelMap[rewardType] || rewardType,
        }).catch(() => { });
      }
      return null;
    }
    throw err;
  }

  const result = await grantEventLevels(guildId, userId, levels, `Evento reward: ${rewardType}${tier != null ? ` tier ${tier}` : ""}`, options.member, options.clientOrGuild ?? null, { suppressLog: true, suppressDm: true, },);
  if (!result) {
    await ActivityEventReward.deleteOne({
      guildId,
      userId,
      rewardType: rewardTypeStr,
      tier: tierVal,
    }).catch(() => { });
    return null;
  }

  if (options.clientOrGuild) {
    const client = options.clientOrGuild?.client ?? options.clientOrGuild;
    const label = labelMap[rewardType] || rewardType;
    sendEventRewardLog(client, {
      userId,
      guildId,
      label,
      detail: `Evento reward: ${rewardType}${tier != null ? ` tier ${tier}` : ""}`,
      levels,
    }).catch(() => { });
    sendEventRewardDm(client, userId, guildId, { label, levels }).catch(() => { });
  }
  return result;
}

async function addEventWeekWinner(guildId, userId, week) {
  if (!guildId || !userId || (week !== 2 && week !== 3)) return null;
  await EventWeekWinner.findOneAndUpdate(
    { guildId, userId, week },
    { guildId, userId, week },
    { upsert: true, new: true },
  ).catch(() => null);
  return true;
}

async function hasEventWeekWinnerGrant(guildId, userId, week) {
  if (!guildId || !userId || (week !== 2 && week !== 3)) return false;
  const doc = await EventWeekWinner.findOne({ guildId, userId, week }).lean().catch(() => null);
  return Boolean(doc);
}

async function grantEventRewardsForExistingRoleMembers(guild) {
  if (!guild?.id) return;
  const active = await isEventActive(guild.id);
  if (!active) return;

  let membersToIterate;
  const full = await guild.members.fetch().catch(() => null);
  if (full && full.size >= 2) {
    membersToIterate = full;
  } else {
    const all = new Map();
    let after = null;
    let chunk;
    do {
      chunk = await guild.members
        .fetch({ limit: 100, after: after ?? undefined })
        .catch(() => null);
      if (!chunk || chunk.size === 0) break;
      for (const [id, m] of chunk) all.set(id, m);
      const last = chunk.last?.();
      after = last?.id ?? null;
      if (chunk.size < 100) break;
      await new Promise((r) => {
        const timer = setTimeout(r, 350);
        timer.unref?.();
      });
    } while (true);
    membersToIterate = all.size > 0 ? all : guild.members.cache;
    if (all.size === 0) {
      global.logger?.warn?.(
        "[activityEventRewards] grantEventRewardsForExistingRoleMembers: nessun membro ottenuto. Abilita Server Members Intent nel Developer Portal (Bot → Privileged Gateway Intents).",
      );
    } else {
      global.logger?.info?.(
        `[activityEventRewards] grantEventRewardsForExistingRoleMembers: usato fetch paginato (${all.size} membri). Per tutti i membri abilita Server Members Intent.`,
      );
    }
  }

  const supporterId = IDs.roles.Supporter;
  const verificatoId = IDs.roles.Verificato;
  const verificataId = IDs.roles.Verificata;
  const guildedId = IDs.roles.Guilded;
  for (const [, member] of membersToIterate) {
    if (!member?.user?.id) continue;
    if (supporterId && member.roles.cache.has(supporterId)) {
      await grantEventRewardOnce(guild.id, member.id, "supporter", {
        levels: 5,
        member,
        clientOrGuild: guild,
        suppressSkipLog: true,
      }).catch(() => null);
    }
    if (
      (verificatoId && member.roles.cache.has(verificatoId)) ||
      (verificataId && member.roles.cache.has(verificataId))
    ) {
      await grantEventRewardOnce(guild.id, member.id, "verificato", {
        levels: 5,
        member,
        clientOrGuild: guild,
        suppressSkipLog: true,
      }).catch(() => null);
    }
    if (guildedId && member.roles.cache.has(guildedId)) {
      await grantEventRewardOnce(guild.id, member.id, "guilded", {
        levels: 10,
        member,
        clientOrGuild: guild,
        suppressSkipLog: true,
      }).catch(() => null);
    }
  }
}
async function grantEventRewardsForSameDayReviewAndVote(guild, eventStartDate) {
  if (!guild?.id || !eventStartDate) return;
  const active = await isEventActive(guild.id);
  if (!active) return;
  const { startRome, endRome } = getRomeDayBoundsForDate(eventStartDate instanceof Date ? eventStartDate : new Date(eventStartDate),);
  await guild.members.fetch().catch(() => null);

  const voteDocs = await VoteRole.find({ guildId: guild.id, createdAt: { $gte: startRome, $lt: endRome }, }).select("userId").lean().catch(() => []);
  const membersCache = await guild.members.fetch().catch(() => null) || guild.members.cache;
  for (const doc of voteDocs) {
    const userId = String(doc?.userId || "");
    if (!userId) continue;
    const member = membersCache.get?.(userId) ?? guild.members.cache.get(userId) ?? null;
    await grantEventLevels(
      guild.id,
      userId,
      1,
      "Evento: voto Discadia",
      member || undefined,
      guild,
    ).catch(() => null);
  }
}

function getEventWeekNumber(settings) {
  if (!settings?.eventStartedAt || !settings?.eventExpiresAt) return 0;
  const now = Date.now();
  const start = new Date(settings.eventStartedAt).getTime();
  const end = new Date(settings.eventExpiresAt).getTime();
  if (now < start || now > end) return 0;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weekIndex = Math.floor((now - start) / weekMs);
  if (weekIndex < 0) return 0;
  return Math.min(4, weekIndex + 1);
}

async function getTop10ExpDuringEvent(guildId, limit = 10) {
  if (!guildId) return [];
  const cap = Math.max(1, Math.min(100, Number(limit) || 10));
  const snapshots = await EventUserExpSnapshot.find({ guildId }).select("userId totalExpAtStart").lean().then((list) => new Map(list.map((d) => [String(d.userId), Number(d.totalExpAtStart) || 0]))).catch(() => new Map());
  const users = await ExpUser.find({ guildId }).select("userId totalExp").lean().catch(() => []);
  const withExp = users.map((d) => { const total = Math.max(0, Number(d?.totalExp || 0)); const atStart = snapshots.get(String(d?.userId || "")) ?? 0; const during = Math.max(0, total - atStart); return { userId: String(d?.userId || ""), expDuringEvent: during }; });
  return withExp
    .filter((r) => r.expDuringEvent > 0)
    .sort((a, b) => b.expDuringEvent - a.expDuringEvent)
    .slice(0, cap);
}

async function getTop3ExpDuringEventExcludingStaff(guild) {
  if (!guild?.id) return [];
  const list = await getTop10ExpDuringEvent(guild.id, 15);
  const out = [];
  for (const item of list) {
    if (out.length >= 3) break;
    const member = await guild.members.fetch(item.userId).catch(() => null);
    if (member && !isEventStaffMember(member)) out.push(item);
  }
  return out;
}

async function clearActivityEventRewardsForGuild(guildId) {
  if (!guildId) return { deleted: 0 };
  const result = await ActivityEventReward.deleteMany({ guildId: String(guildId) }).catch(() => null);
  return { deleted: result?.deletedCount ?? 0 };
}

module.exports = { isEventActive, grantEventLevels, grantEventRewardOnce, grantEventRewardsForExistingRoleMembers, grantEventRewardsForSameDayReviewAndVote, clearActivityEventRewardsForGuild, addEventWeekWinner, hasEventWeekWinnerGrant, getTop3ExpDuringEventExcludingStaff, getEventWeekNumber, getTop10ExpDuringEvent };