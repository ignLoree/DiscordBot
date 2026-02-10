const { ExpUser } = require('../../Schemas/Community/communitySchemas');
const { GlobalSettings } = require('../../Schemas/Community/communitySchemas');
const LevelHistory = require('../../Schemas/Community/levelHistorySchema');
const IDs = require('../../Utils/Config/ids');

const TIME_ZONE = 'Europe/Rome';
const MESSAGE_EXP = 2;
const VOICE_EXP_PER_MINUTE = 5;
const DEFAULT_MULTIPLIER = 1;
const MULTIPLIER_CACHE_TTL_MS = 60 * 1000;
const settingsCache = new Map();
const LEVEL_UP_CHANNEL_ID = IDs.channels.levelUp;
const PERKS_CHANNEL_ID = IDs.channels.infoPerks;
const PERK_ROLE_ID = IDs.roles.mediaBypass;
const LEVEL_ROLE_MAP = new Map([
  [10, IDs.roles.level10],
  [20, IDs.roles.level20],
  [30, IDs.roles.level30],
  [50, IDs.roles.level50],
  [70, IDs.roles.level70],
  [100, IDs.roles.level100]
]);
const ROLE_MULTIPLIERS = new Map([
  [IDs.roles.customRoleAccessA, 3],
  [IDs.roles.customRoleAccessB, 3],
  [IDs.roles.plusColorBooster, 2]
]);

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getTimeParts(date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday
  };
}

function getIsoWeekKey(date) {
  const { year, month, day } = getTimeParts(date);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const weekNr = 1 + Math.round((utcDate - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${pad2(weekNr)}`;
}

function getCurrentWeekKey() {
  return getIsoWeekKey(new Date());
}

function roundToNearest50(value) {
  return Math.round(value / 50) * 50;
}

function getLevelStep(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
  let step = 90 + Math.floor(safeLevel * 12) + (safeLevel % 4) * 15;

  if (safeLevel >= 10) {
    const over10 = safeLevel - 9;
    step += 120 + (over10 * 28) + Math.floor((over10 * over10) * 1.3);
  }
  if (safeLevel >= 30) {
    step += 120 + ((safeLevel - 30) * 18);
  }
  if (safeLevel >= 50) {
    step += 220 + ((safeLevel - 50) * 25);
  }

  return Math.max(110, step);
}

function getLevelInfo(totalExp) {
  const exp = Math.max(0, Math.floor(Number(totalExp || 0)));
  let level = 0;
  let currentLevelExp = 0;
  let nextThreshold = 100;
  while (exp >= nextThreshold) {
    level += 1;
    currentLevelExp = nextThreshold;
    const step = getLevelStep(level);
    nextThreshold = roundToNearest50(nextThreshold + Math.max(110, step));
  }
  const remainingToNext = Math.max(0, nextThreshold - exp);
  const span = Math.max(1, nextThreshold - currentLevelExp);
  const progressPercent = Math.max(0, Math.min(100, Math.round(((exp - currentLevelExp) / span) * 100)));
  return { level, currentLevelExp, nextLevelExp: nextThreshold, remainingToNext, progressPercent };
}

function getTotalExpForLevel(level) {
  const targetLevel = Math.max(0, Math.floor(Number(level || 0)));
  if (targetLevel <= 0) return 0;
  let threshold = 100;
  for (let l = 1; l < targetLevel; l += 1) {
    threshold = roundToNearest50(threshold + Math.max(110, getLevelStep(l)));
  }
  return threshold;
}

function normalizeSettingsDoc(doc) {
  const now = Date.now();
  const expiresAtValue = doc?.expEventMultiplierExpiresAt ? new Date(doc.expEventMultiplierExpiresAt).getTime() : null;
  const eventActive = Number.isFinite(expiresAtValue) && expiresAtValue > now;
  const baseMultiplier = Number(doc?.expMultiplier || DEFAULT_MULTIPLIER);
  const eventMultiplier = eventActive ? Number(doc?.expEventMultiplier || 1) : 1;
  return {
    baseMultiplier: Number.isFinite(baseMultiplier) && baseMultiplier > 0 ? baseMultiplier : DEFAULT_MULTIPLIER,
    eventMultiplier: Number.isFinite(eventMultiplier) && eventMultiplier > 0 ? eventMultiplier : 1,
    eventExpiresAt: eventActive ? new Date(expiresAtValue) : null,
    lockedChannelIds: Array.isArray(doc?.expLockedChannelIds) ? doc.expLockedChannelIds.filter(Boolean) : [],
    ignoredRoleIds: Array.isArray(doc?.expIgnoredRoleIds) ? doc.expIgnoredRoleIds.filter(Boolean) : []
  };
}

function ensureWeekly(doc, now) {
  const weekKey = getIsoWeekKey(now);
  if (doc.weeklyKey !== weekKey) {
    doc.weeklyKey = weekKey;
    doc.weeklyExp = 0;
  }
}

function invalidateSettingsCache(guildId) {
  if (guildId) settingsCache.delete(guildId);
}

async function getGuildExpSettings(guildId) {
  if (!guildId) {
    return {
      baseMultiplier: DEFAULT_MULTIPLIER,
      eventMultiplier: 1,
      effectiveMultiplier: DEFAULT_MULTIPLIER,
      eventExpiresAt: null,
      lockedChannelIds: [],
      ignoredRoleIds: []
    };
  }
  const cached = settingsCache.get(guildId);
  const now = Date.now();
  if (cached && (now - cached.at) < MULTIPLIER_CACHE_TTL_MS) {
    return cached.value;
  }
  let doc = null;
  try {
    doc = await GlobalSettings.findOneAndUpdate(
      { guildId },
      { $setOnInsert: { expMultiplier: DEFAULT_MULTIPLIER, expEventMultiplier: 1, expEventMultiplierExpiresAt: null, expLockedChannelIds: [], expIgnoredRoleIds: [] } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch {}

  if (doc?.expEventMultiplierExpiresAt && new Date(doc.expEventMultiplierExpiresAt).getTime() <= now) {
    try {
      doc = await GlobalSettings.findOneAndUpdate(
        { guildId },
        { $set: { expEventMultiplier: 1, expEventMultiplierExpiresAt: null } },
        { new: true }
      );
    } catch {}
  }

  const normalized = normalizeSettingsDoc(doc);
  const value = {
    ...normalized,
    effectiveMultiplier: normalized.baseMultiplier * normalized.eventMultiplier
  };
  settingsCache.set(guildId, { value, at: now });
  return value;
}

async function recordLevelHistory({ guildId, userId, actorId = null, action = 'update', beforeExp = 0, afterExp = 0, note = null }) {
  if (!guildId || !userId) return null;
  const beforeLevel = getLevelInfo(beforeExp).level;
  const afterLevel = getLevelInfo(afterExp).level;
  return LevelHistory.create({
    guildId,
    userId,
    actorId,
    action,
    beforeExp: Number(beforeExp || 0),
    afterExp: Number(afterExp || 0),
    beforeLevel,
    afterLevel,
    deltaExp: Number(afterExp || 0) - Number(beforeExp || 0),
    note: note ? String(note).slice(0, 500) : null
  }).catch(() => null);
}

async function addExp(guildId, userId, amount, applyMultiplier = false, weeklyAmountOverride = null) {
  if (!guildId || !userId || !Number.isFinite(amount)) return null;
  const now = new Date();
  let doc = await ExpUser.findOne({ guildId, userId });
  if (!doc) {
    doc = new ExpUser({ guildId, userId });
  }
  ensureWeekly(doc, now);
  const multiplier = applyMultiplier ? await getGlobalMultiplier(guildId) : 1;
  const effective = Math.max(0, Math.floor(amount)) * multiplier;
  const weeklyEffective = weeklyAmountOverride !== null
    ? Math.max(0, Math.floor(Number(weeklyAmountOverride)))
    : effective;
  if (effective === 0 && weeklyEffective === 0) return doc;
  const beforeExp = Number(doc.totalExp || 0);
  const prevLevel = getLevelInfo(beforeExp).level;
  doc.totalExp = Number(doc.totalExp || 0) + effective;
  doc.weeklyExp = Number(doc.weeklyExp || 0) + weeklyEffective;
  const levelInfo = getLevelInfo(doc.totalExp);
  doc.level = levelInfo.level;
  await doc.save();
  return { doc, prevLevel, levelInfo, beforeExp, afterExp: Number(doc.totalExp || 0) };
}

function getRoleMultiplier(member) {
  if (!member?.roles?.cache) return 1;
  let multi = 1;
  for (const [roleId, value] of ROLE_MULTIPLIERS.entries()) {
    if (member.roles.cache.has(roleId)) {
      multi *= value;
    }
  }
  return multi;
}

function buildLevelUpEmbed(member, level) {
  return {
    embeds: [
      {
        color: 0x6f4e37,
        title: `${member?.displayName || member?.user?.username} leveled up!`,
        thumbnail: {
          url: member?.user?.displayAvatarURL({ size: 256 })
        },
        description: [
          `<a:VC_PandaClap:1331620157398712330> **Complimenti ${member}!**`,
          `<:VC_LevelUp2:1443701876892762243>Hai appena __raggiunto__ il **livello** \`${level}\``,
          `<a:VC_HelloKittyGift:1329447876857958471> __Continua__ ad essere **attivo** in __chat__ e in __vocale__ per avanzare di _livello_!`
        ].join('\n'),
      }
    ]
  };
}

async function sendLevelUpMessage(guild, member, level) {
  if (!guild || !member) return;
  const channel = guild.channels.cache.get(LEVEL_UP_CHANNEL_ID) || await guild.channels.fetch(LEVEL_UP_CHANNEL_ID).catch(() => null);
  if (!channel) return;
  const payload = buildLevelUpEmbed(member, level);
  await channel.send({ content: `${member} sei salito/a di livello! <a:VC_LevelUp:1469046204582068376>`, ...payload }).catch(() => {});
}

function buildPerksLevelEmbed(member, level, roleId) {
  return {
    embeds: [
      {
        color: 0x6f4e37,
        title: `${member.user.username} leveled up!`,
        thumbnail: {
          url: member?.user?.displayAvatarURL({ size: 256 })
        },
        description: [
          `<a:VC_PandaClap:1331620157398712330> **Complimenti ${member}!**`,
          `<:VC_LevelUp2:1443701876892762243>Hai appena __raggiunto__ il <@&${roleId}>`,
          `<a:VC_HelloKittyGift:1329447876857958471> __Controlla__ <#${PERKS_CHANNEL_ID}> per sapere i nuovi **vantaggi** che hai _sbloccato_!`
        ].join('\n'),
      }
    ]
  };
}

async function sendPerksLevelMessage(guild, member, level) {
  const roleId = LEVEL_ROLE_MAP.get(level);
  if (!guild || !member || !roleId) return;
  const channel = guild.channels.cache.get(LEVEL_UP_CHANNEL_ID) || await guild.channels.fetch(LEVEL_UP_CHANNEL_ID).catch(() => null);
  if (!channel) return;
  const payload = buildPerksLevelEmbed(member, level, roleId);
  await channel.send({ content: `${member} sei salito/a di livello! <a:VC_LevelUp:1469046204582068376>`, ...payload }).catch(() => {});
}

async function addLevelRoleIfPossible(member, roleId) {
  if (!member || !roleId) return false;
  const me = member.guild.members.me;
  if (!me) return false;
  if (!me.permissions.has('ManageRoles')) return false;
  const role = member.guild.roles.cache.get(roleId) || await member.guild.roles.fetch(roleId).catch(() => null);
  if (!role) return false;
  if (role.position >= me.roles.highest.position) return false;
  if (member.roles.cache.has(roleId)) return true;
  await member.roles.add(role).catch(() => {});
  return member.roles.cache.has(roleId);
}

async function addPerkRoleIfPossible(member) {
  const me = member.guild.members.me;
  if (!me) return;
  if (!me.permissions.has('ManageRoles')) return;
  const role = member.guild.roles.cache.get(PERK_ROLE_ID);
  if (!role) return;
  if (role.position >= me.roles.highest.position) return;
  if (member.roles.cache.has(PERK_ROLE_ID)) return;
  await member.roles.add(role).catch(() => {});
}

async function addExpWithLevel(guild, userId, amount, applyMultiplier = false) {
  if (!guild || !userId) return null;
  let effectiveAmount = amount;
  if (applyMultiplier) {
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    const globalMulti = await getGlobalMultiplier(guild.id);
    const roleMulti = getRoleMultiplier(member);
    effectiveAmount = Number(amount || 0) * globalMulti * roleMulti;
  }
  let weeklyAmount = null;
  if (applyMultiplier) {
    const globalMulti = await getGlobalMultiplier(guild.id);
    weeklyAmount = Number(amount || 0) * globalMulti;
  }
  const result = await addExp(guild.id, userId, effectiveAmount, false, weeklyAmount);
  if (!result || !result.levelInfo) return result;
  if (result.levelInfo.level > (result.prevLevel ?? 0)) {
    await recordLevelHistory({
      guildId: guild.id,
      userId,
      action: 'level_up_auto',
      beforeExp: result.beforeExp,
      afterExp: result.afterExp,
      note: `Level up ${(result.prevLevel ?? 0)} -> ${result.levelInfo.level}`
    });
  }
  if (result.levelInfo.level > (result.prevLevel ?? 0)) {
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (member) {
      const level = result.levelInfo.level;
      const reachedPerkLevels = Array.from(LEVEL_ROLE_MAP.keys())
        .filter((perkLevel) => perkLevel > (result.prevLevel ?? 0) && perkLevel <= level)
        .sort((a, b) => a - b);
      for (const perkLevel of reachedPerkLevels) {
        const roleId = LEVEL_ROLE_MAP.get(perkLevel);
        if (!roleId) continue;
        await addLevelRoleIfPossible(member, roleId);
      }
      if (LEVEL_ROLE_MAP.has(level)) {
        await sendPerksLevelMessage(guild, member, level);
      } else {
        await sendLevelUpMessage(guild, member, level);
      }
      if (result.levelInfo.level >= 10) {
        await addPerkRoleIfPossible(member);
      }
    }
  } else if (result.levelInfo.level >= 10) {
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (member) {
      await addPerkRoleIfPossible(member);
    }
  }
  return result;
}

async function getGlobalMultiplier(guildId) {
  const settings = await getGuildExpSettings(guildId);
  return settings.effectiveMultiplier;
}

async function setGlobalMultiplier(guildId, multiplier) {
  if (!guildId) return DEFAULT_MULTIPLIER;
  let value = Number(multiplier);
  if (!Number.isFinite(value) || value <= 0) value = DEFAULT_MULTIPLIER;
  const doc = await GlobalSettings.findOneAndUpdate(
    { guildId },
    { $set: { expMultiplier: value } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  invalidateSettingsCache(guildId);
  const settings = normalizeSettingsDoc(doc);
  return settings.baseMultiplier;
}

async function setTemporaryEventMultiplier(guildId, multiplier, durationMs) {
  if (!guildId) return null;
  let value = Number(multiplier);
  if (!Number.isFinite(value) || value <= 0) value = 1;
  const safeDurationMs = Math.max(60 * 1000, Number(durationMs || 60 * 1000));
  const expiresAt = new Date(Date.now() + safeDurationMs);
  await GlobalSettings.findOneAndUpdate(
    { guildId },
    { $set: { expEventMultiplier: value, expEventMultiplierExpiresAt: expiresAt } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => null);
  invalidateSettingsCache(guildId);
  return { multiplier: value, expiresAt };
}

async function setLevelChannelLocked(guildId, channelId, locked = true) {
  if (!guildId || !channelId) return [];
  const current = await getGuildExpSettings(guildId);
  const set = new Set(current.lockedChannelIds);
  if (locked) set.add(channelId);
  else set.delete(channelId);
  const next = Array.from(set);
  await GlobalSettings.findOneAndUpdate(
    { guildId },
    { $set: { expLockedChannelIds: next } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => null);
  invalidateSettingsCache(guildId);
  return next;
}

async function setRoleIgnored(guildId, roleId, ignored = true) {
  if (!guildId || !roleId) return [];
  const current = await getGuildExpSettings(guildId);
  const set = new Set(current.ignoredRoleIds);
  if (ignored) set.add(roleId);
  else set.delete(roleId);
  const next = Array.from(set);
  await GlobalSettings.findOneAndUpdate(
    { guildId },
    { $set: { expIgnoredRoleIds: next } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => null);
  invalidateSettingsCache(guildId);
  return next;
}

async function shouldIgnoreExpForMember({ guildId, member, channelId = null }) {
  const settings = await getGuildExpSettings(guildId);
  if (channelId && settings.lockedChannelIds.includes(channelId)) return true;
  if (member?.roles?.cache && settings.ignoredRoleIds.length > 0) {
    for (const roleId of settings.ignoredRoleIds) {
      if (member.roles.cache.has(roleId)) return true;
    }
  }
  return false;
}

async function getRecentLevelHistory(guildId, userId, limit = 10) {
  if (!guildId || !userId) return [];
  const safeLimit = Math.max(1, Math.min(30, Number(limit || 10)));
  return LevelHistory.find({ guildId, userId }).sort({ createdAt: -1 }).limit(safeLimit).lean().catch(() => []);
}

async function getUserExpStats(guildId, userId) {
  const now = new Date();
  let doc = await ExpUser.findOne({ guildId, userId });
  if (!doc) {
    doc = new ExpUser({ guildId, userId });
  }
  ensureWeekly(doc, now);
  const levelInfo = getLevelInfo(doc.totalExp);
  doc.level = levelInfo.level;
  await doc.save();
  return {
    totalExp: Number(doc.totalExp || 0),
    weeklyExp: Number(doc.weeklyExp || 0),
    level: levelInfo.level,
    currentLevelExp: levelInfo.currentLevelExp,
    nextLevelExp: levelInfo.nextLevelExp,
    remainingToNext: levelInfo.remainingToNext,
    progressPercent: levelInfo.progressPercent
  };
}

async function getUserRanks(guildId, userId) {
  const stats = await getUserExpStats(guildId, userId);
  if (stats.level === 0) {
    return { stats, weeklyRank: null, allTimeRank: null };
  }
  const currentWeekKey = getIsoWeekKey(new Date());
  const [weeklyHigher, totalHigher] = await Promise.all([
    ExpUser.countDocuments({ guildId, weeklyKey: currentWeekKey, weeklyExp: { $gt: stats.weeklyExp } }),
    ExpUser.countDocuments({ guildId, totalExp: { $gt: stats.totalExp } })
  ]);
  return {
    stats,
    weeklyRank: weeklyHigher + 1,
    allTimeRank: totalHigher + 1
  };
}

module.exports = {
  MESSAGE_EXP,
  VOICE_EXP_PER_MINUTE,
  addExp,
  addExpWithLevel,
  getUserExpStats,
  getUserRanks,
  getLevelInfo,
  getTotalExpForLevel,
  getGlobalMultiplier,
  setGlobalMultiplier,
  setTemporaryEventMultiplier,
  getGuildExpSettings,
  setLevelChannelLocked,
  setRoleIgnored,
  shouldIgnoreExpForMember,
  recordLevelHistory,
  getRecentLevelHistory,
  getRoleMultiplier,
  getCurrentWeekKey,
  ROLE_MULTIPLIERS
};



