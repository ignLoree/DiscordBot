const { ExpUser, GlobalSettings, LevelHistory, EventUserExpSnapshot, } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const { shouldBlockDm } = require("../../Utils/noDmList");
const EXP_EXCLUDED_CATEGORY_IDS = new Set([IDs.categories.categoryGames].filter(Boolean).map((id) => String(id)),);
const TIME_ZONE = "Europe/Rome";
const MESSAGE_EXP = 2;
const VOICE_EXP_PER_MINUTE = 5;
const DEFAULT_MULTIPLIER = 1;
const MAX_COMBINED_MULTIPLIER = 8;
const MULTIPLIER_CACHE_TTL_MS = 60 * 1000;
const settingsCache = new Map();
const LEVEL_UP_CHANNEL_ID = IDs.channels.commands;
const PERKS_CHANNEL_ID = IDs.channels.info;
const PERK_ROLE_ID = IDs.roles.PicPerms;
const LEVEL_ROLE_MAP = new Map([[10, IDs.roles.Level10], [20, IDs.roles.Level20], [30, IDs.roles.Level30], [50, IDs.roles.Level50], [70, IDs.roles.Level70], [100, IDs.roles.Level100],]);
const PERK_NEAR_LEVEL_DISTANCE = 2;
const ROLE_MULTIPLIERS = new Map([[IDs.roles.Donator, 3], [IDs.roles.VIP, 4], [IDs.roles.ServerBooster, 2], [IDs.roles.Level100, 1.25],]);
const EVENT_STAFF_ROLE_IDS = new Set([IDs.roles.Staff, IDs.roles.HighStaff,].filter(Boolean).map((id) => String(id)),);

function isEventStaffMember(member) {
  if (!member?.roles?.cache) return false;
  return Array.from(EVENT_STAFF_ROLE_IDS).some((id) => member.roles.cache.has(id));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getTimeParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday,
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
  if (safeLevel <= 10) {
    return 120 + (safeLevel - 1) * 25;
  }
  if (safeLevel <= 30) {
    return 380 + (safeLevel - 10) * 55;
  }
  if (safeLevel <= 60) {
    return 1600 + (safeLevel - 30) * 120;
  }
  return 5200 + (safeLevel - 60) * 210;
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
  const progressPercent = Math.max(0, Math.min(100, Math.round(((exp - currentLevelExp) / span) * 100)),);
  return {
    level,
    currentLevelExp,
    nextLevelExp: nextThreshold,
    remainingToNext,
    progressPercent,
  };
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

function getNextPerkLevel(currentLevel) {
  const safeLevel = Math.max(0, Math.floor(Number(currentLevel || 0)));
  return (
    Array.from(LEVEL_ROLE_MAP.keys())
      .filter((level) => level > safeLevel)
      .sort((a, b) => a - b)[0] || null
  );
}

function normalizeSettingsDoc(doc) {
  const now = Date.now();
  const expiresAtValue = doc?.expEventMultiplierExpiresAt ? new Date(doc.expEventMultiplierExpiresAt).getTime() : null;
  const eventActive = Number.isFinite(expiresAtValue) && expiresAtValue > now;
  const baseMultiplier = Number(doc?.expMultiplier || DEFAULT_MULTIPLIER);
  const eventMultiplier = eventActive ? Number(doc?.expEventMultiplier || 1) : 1;
  const eventRoleOverrides = eventActive && doc?.expEventRoleOverrides && typeof doc.expEventRoleOverrides === "object" ? doc.expEventRoleOverrides : null;
  const eventExtraMultiplierRoleIds = Array.isArray(doc?.expEventExtraMultiplierRoleIds,) ? doc.expEventExtraMultiplierRoleIds.filter(Boolean) : [];
  return {
    baseMultiplier:
      Number.isFinite(baseMultiplier) && baseMultiplier > 0
        ? baseMultiplier
        : DEFAULT_MULTIPLIER,
    eventMultiplier:
      Number.isFinite(eventMultiplier) && eventMultiplier > 0
        ? eventMultiplier
        : 1,
    eventExpiresAt: eventActive ? new Date(expiresAtValue) : null,
    eventStartedAt:
      eventActive && doc?.expEventStartedAt
        ? new Date(doc.expEventStartedAt)
        : null,
    eventRoleOverrides: eventActive ? eventRoleOverrides : null,
    eventExtraMultiplierRoleIds: eventActive ? eventExtraMultiplierRoleIds : [],
    lockedChannelIds: Array.isArray(doc?.expLockedChannelIds)
      ? doc.expLockedChannelIds.filter(Boolean)
      : [],
    ignoredRoleIds: Array.isArray(doc?.expIgnoredRoleIds)
      ? doc.expIgnoredRoleIds.filter(Boolean)
      : [],
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
      eventStartedAt: null,
      eventRoleOverrides: null,
      eventExtraMultiplierRoleIds: [],
      lockedChannelIds: [],
      ignoredRoleIds: [],
    };
  }
  const cached = settingsCache.get(guildId);
  const now = Date.now();
  if (cached && now - cached.at < MULTIPLIER_CACHE_TTL_MS) {
    return cached.value;
  }
  let doc = null;
  try {
    doc = await GlobalSettings.findOneAndUpdate(
      { guildId },
      {
        $setOnInsert: {
          expMultiplier: DEFAULT_MULTIPLIER,
          expEventMultiplier: 1,
          expEventMultiplierExpiresAt: null,
          expLockedChannelIds: [],
          expIgnoredRoleIds: [],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch { }

  if (
    doc?.expEventMultiplierExpiresAt &&
    new Date(doc.expEventMultiplierExpiresAt).getTime() <= now
  ) {
    try {
      doc = await GlobalSettings.findOneAndUpdate(
        { guildId },
        { $set: { expEventMultiplier: 1 } },
        { new: true },
      );
    } catch { }
  }

  const normalized = normalizeSettingsDoc(doc);
  const value = { ...normalized, effectiveMultiplier: normalized.baseMultiplier * normalized.eventMultiplier, };
  settingsCache.set(guildId, { value, at: now });
  return value;
}

async function setActivityEvent(guildId, options = {}) {
  if (!guildId) return null;
  const start = options.startDate ? new Date(options.startDate).getTime() : Date.now();
  const end = options.endDate ? new Date(options.endDate).getTime() : start + 31 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(end) || end <= start) return null;
  const globalMulti = Number(options.globalMultiplier);
  const eventMultiplier = Number.isFinite(globalMulti) && globalMulti > 0 ? globalMulti : 3;
  const roleOverrides = options.roleOverrides && typeof options.roleOverrides === "object" ? options.roleOverrides : null;
  const extraRoleIds = Array.isArray(options.extraMultiplierRoleIds) ? options.extraMultiplierRoleIds.filter(Boolean) : [];
  const startedAt = options.startedAt ? new Date(options.startedAt) : new Date();
  await GlobalSettings.findOneAndUpdate(
    { guildId },
    {
      $set: {
        expEventMultiplier: eventMultiplier,
        expEventMultiplierExpiresAt: new Date(end),
        expEventRoleOverrides: roleOverrides,
        expEventExtraMultiplierRoleIds: extraRoleIds,
        expEventStartedAt: startedAt,
        expEventEndAnnouncementSentForExpiresAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  invalidateSettingsCache(guildId);
  setImmediate(() => {
    snapshotExpForEvent(guildId).catch((err) => {
      global.logger?.error?.("[expService] snapshotExpForEvent failed:", err);
    });
  });
  return {
    startDate: new Date(start),
    endDate: new Date(end),
    startedAt,
    eventMultiplier,
    roleOverrides,
    extraMultiplierRoleIds: extraRoleIds,
  };
}

async function snapshotExpForEvent(guildId) {
  if (!guildId) return;
  const users = await ExpUser.find({ guildId }).select("userId totalExp").lean().catch(() => []);
  if (!users.length) return;
  await EventUserExpSnapshot.deleteMany({ guildId }).catch(() => null);
  const ops = users.map((doc) => ({ insertOne: { document: { guildId, userId: String(doc?.userId || ""), totalExpAtStart: Math.max(0, Number(doc?.totalExp || 0)), }, }, }));
  if (ops.length) {
    await EventUserExpSnapshot.bulkWrite(ops, { ordered: false }).catch(() => null);
  }
}

async function clearActivityEvent(guildId) {
  if (!guildId) return;
  await GlobalSettings.findOneAndUpdate(
    { guildId },
    {
      $set: {
        expEventMultiplier: 1,
        expEventMultiplierExpiresAt: null,
        expEventRoleOverrides: null,
        expEventExtraMultiplierRoleIds: [],
        expEventStartedAt: null,
      },
    },
    { upsert: true, new: true },
  ).catch(() => null);
  invalidateSettingsCache(guildId);
}

async function clearStaffEvent(guildId) {
  if (!guildId) return;
  await GlobalSettings.findOneAndUpdate(
    { guildId },
    { $set: { staffEventExpiresAt: null, staffEventStartedAt: null } },
    { upsert: true, new: true },
  ).catch(() => null);
  invalidateSettingsCache(guildId);
}

async function setStaffEvent(guildId, options = {}) {
  if (!guildId) return null;
  const end = options.endDate ? new Date(options.endDate).getTime() : null;
  const startedAt = options.startedAt ? new Date(options.startedAt) : new Date();
  if (!Number.isFinite(end)) return null;
  await GlobalSettings.findOneAndUpdate(
    { guildId },
    {
      $set: {
        staffEventExpiresAt: new Date(end),
        staffEventStartedAt: startedAt,
      },
    },
    { upsert: true, new: true },
  ).catch(() => null);
  return { expiresAt: new Date(end), startedAt };
}

async function getStaffEventSettings(guildId) {
  if (!guildId) return { active: false, expiresAt: null, startedAt: null };
  const doc = await GlobalSettings.findOne({ guildId }).select("staffEventExpiresAt staffEventStartedAt").lean().catch(() => null);
  const expiresAt = doc?.staffEventExpiresAt ? new Date(doc.staffEventExpiresAt) : null;
  const now = Date.now();
  const active = expiresAt && expiresAt.getTime() > now;
  return {
    active: Boolean(active),
    expiresAt: expiresAt || null,
    startedAt: doc?.staffEventStartedAt ? new Date(doc.staffEventStartedAt) : null,
  };
}

async function recordLevelHistory(guildId, userId, actorId = null, action = "update", beforeExp = 0, afterExp = 0, note = null) {
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
    note: note ? String(note).slice(0, 500) : null,
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
  const weeklyEffective = weeklyAmountOverride !== null ? Math.max(0, Math.floor(Number(weeklyAmountOverride))) : effective;
  if (effective === 0 && weeklyEffective === 0) return doc;
  const beforeExp = Number(doc.totalExp || 0);
  const prevLevel = getLevelInfo(beforeExp).level;
  doc.totalExp = Number(doc.totalExp || 0) + effective;
  doc.weeklyExp = Number(doc.weeklyExp || 0) + weeklyEffective;
  const levelInfo = getLevelInfo(doc.totalExp);
  doc.level = levelInfo.level;
  await doc.save();
  return {
    doc,
    prevLevel,
    levelInfo,
    beforeExp,
    afterExp: Number(doc.totalExp || 0),
  };
}

function getRoleMultiplier(member, settings = null) {
  if (!member?.roles?.cache) return 1;
  const useOverrides = settings?.eventExpiresAt && settings?.eventRoleOverrides && typeof settings.eventRoleOverrides === "object";
  const overrides = useOverrides ? settings.eventRoleOverrides : null;
  let multi = 1;
  if (overrides) {
    for (const [roleId, value] of Object.entries(overrides)) {
      if (member.roles.cache.has(roleId)) {
        multi = Math.max(multi, Number(value) || 1);
      }
    }
  } else {
    for (const [roleId, value] of ROLE_MULTIPLIERS.entries()) {
      if (member.roles.cache.has(roleId)) {
        multi = Math.max(multi, Number(value) || 1);
      }
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
          url: member?.user?.displayAvatarURL({ size: 256 }),
        },
        description: [
          `<a:VC_PandaClap:1331620157398712330> **Complimenti ${member}!**`,
          `<:VC_LevelUp2:1443701876892762243> Hai appena __raggiunto__ il **livello** \`${level}\``,
          `<a:VC_HelloKittyGift:1329447876857958471> __Continua__ ad essere **attivo** in __chat__ e in __vocale__ per avanzare di _livello_!`,
        ].join("\n"),
      },
    ],
  };
}

async function sendLevelUpMessage(guild, member, level) {
  if (!guild || !member) return;
  const channel = await getLevelUpChannel(guild);
  if (!channel) return;
  const payload = buildLevelUpEmbed(member, level);
  await sendLevelUpPayload(channel, member, payload);
}

function buildPerksLevelEmbed(member, level, roleId) {
  return {
    embeds: [
      {
        color: 0x6f4e37,
        title: `${member.user.username} leveled up!`,
        thumbnail: {
          url: member?.user?.displayAvatarURL({ size: 256 }),
        },
        description: [
          `<a:VC_PandaClap:1331620157398712330> **Complimenti ${member}!**`,
          `<:VC_LevelUp2:1443701876892762243> Hai appena __raggiunto__ il <@&${roleId}>`,
          `<a:VC_HelloKittyGift:1329447876857958471> __Controlla__ <#${PERKS_CHANNEL_ID}> per sapere i nuovi **vantaggi** che hai _sbloccato_!`,
        ].join("\n"),
      },
    ],
  };
}

async function sendPerksLevelMessage(guild, member, level) {
  const roleId = LEVEL_ROLE_MAP.get(level);
  if (!guild || !member || !roleId) return;
  const channel = await getLevelUpChannel(guild);
  if (!channel) return;
  const payload = buildPerksLevelEmbed(member, level, roleId);
  await sendLevelUpPayload(channel, member, payload);
}

function buildPerkNearDmEmbed(member, targetLevel, roleLabel, missingExp) {
  const safeRoleLabel = String(roleLabel || "<:VC_Role:1448670089670037675> Ruolo sconosciuto").trim();
  return {
    embeds: [
      {
        color: 0x6f4e37,
        title: "<:VC_Info:1448670089670037675> Sei vicino a un nuovo perk!",
        thumbnail: {
          url: member?.user?.displayAvatarURL({ size: 256 }),
        },
        description: [
          `<a:VC_PandaClap:1331620157398712330> ${member}, ci sei quasi!`,
          `<:VC_Role:1448670089670037675> Sei vicino al ruolo **${safeRoleLabel}** (livello \`${targetLevel}\`).`,
          `<:VC_EXP:1468714279673925883> Ti mancano **${Math.max(0, Number(missingExp || 0))} EXP**.`,
          PERKS_CHANNEL_ID
            ? `<:VC_Info:1448670089670037675> Info perks: <#${PERKS_CHANNEL_ID}>`
            : "<:VC_Info:1448670089670037675> Controlla il canale info del server.",
        ].join("\n"),
      },
    ],
  };
}

async function maybeSendPerkNearReminder(guild, member, result) {
  if (!guild || !member || !result?.doc || !result?.levelInfo) return;
  if (member.user?.bot) return;

  const currentLevel = Number(result.levelInfo.level || 0);
  const nextPerkLevel = getNextPerkLevel(currentLevel);
  if (!nextPerkLevel) return;

  if (nextPerkLevel - currentLevel > PERK_NEAR_LEVEL_DISTANCE) return;

  const roleId = LEVEL_ROLE_MAP.get(nextPerkLevel);
  if (!roleId) return;

  const reminded = Array.isArray(result.doc.perkNearReminderLevels) ? result.doc.perkNearReminderLevels.map((value) => Number(value)).filter(Number.isFinite) : [];
  if (reminded.includes(nextPerkLevel)) return;

  if (await shouldBlockDm(guild.id, member.id, "perks").catch(() => false)) return;

  const targetExp = getTotalExpForLevel(nextPerkLevel);
  const missingExp = Math.max(0, targetExp - Number(result.afterExp || 0));
  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  const roleLabel = role?.name || `ID ${roleId}`;
  const payload = buildPerkNearDmEmbed(member, nextPerkLevel, roleLabel, missingExp,);

  const sent = await member.user.send(payload).then(() => true).catch(() => false);
  if (!sent) return;

  const nextReminded = Array.from(new Set([...reminded.filter((level) => level > currentLevel), nextPerkLevel]),);
  await ExpUser.updateOne(
    { guildId: guild.id, userId: member.id },
    { $set: { perkNearReminderLevels: nextReminded } },
  ).catch(() => null);
}

async function getLevelUpChannel(guild) {
  if (!guild || !LEVEL_UP_CHANNEL_ID) return null;
  return (
    guild.channels.cache.get(LEVEL_UP_CHANNEL_ID) ||
    (await guild.channels.fetch(LEVEL_UP_CHANNEL_ID).catch(() => null))
  );
}

const EVENT_LEVEL_UP_DEBOUNCE_MS = 1800;
const eventLevelUpPending = new Map();

function scheduleEventLevelUpMessage(clientOrGuild, guildId, userId, level) {
  if (!guildId || !userId || !Number.isFinite(level) || level < 1) return;
  const client = clientOrGuild?.client ?? clientOrGuild;
  if (!client) return;
  const key = `${String(guildId)}:${String(userId)}`;
  const existing = eventLevelUpPending.get(key);
  if (existing) {
    clearTimeout(existing.timeoutId);
  }
  const timeoutId = setTimeout(async () => { eventLevelUpPending.delete(key); try { const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null)); if (!guild) return; const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null)); if (!member) return; await sendLevelUpMessage(guild, member, level); } catch (err) { global.logger?.error?.("[expService] scheduleEventLevelUpMessage flush error:", err); } }, EVENT_LEVEL_UP_DEBOUNCE_MS); timeoutId.unref?.(); eventLevelUpPending.set(key, { timeoutId, level, guildId, client });
}

async function sendLevelUpPayload(channel, member, payload) {
  if (!channel || !member || !payload) return;
  await channel
    .send({
      content: `<a:VC_LevelUp:1469046204582068376> ${member} sei salito/a di livello!`,
      ...payload,
    })
    .catch(() => { });
}

async function fetchGuildMember(guild, userId) {
  if (!guild || !userId) return null;
  return (
    guild.members.cache.get(userId) ||
    (await guild.members.fetch(userId).catch(() => null))
  );
}

async function addLevelRoleIfPossible(member, roleId) {
  if (!member || !roleId) return false;
  const me = member.guild.members.me;
  if (!me) return false;
  if (!me.permissions.has("ManageRoles")) return false;
  const role = member.guild.roles.cache.get(roleId) || (await member.guild.roles.fetch(roleId).catch(() => null));
  if (!role) return false;
  if (role.position >= me.roles.highest.position) return false;
  if (member.roles.cache.has(roleId)) return true;
  await member.roles.add(role).catch(() => { });
  const refreshedMember = await member.guild.members.fetch(member.id).catch(() => null);
  return Boolean(refreshedMember?.roles?.cache?.has(roleId));
}

async function addPerkRoleIfPossible(member) {
  const me = member.guild.members.me;
  if (!me) return;
  if (!me.permissions.has("ManageRoles")) return;
  const role = member.guild.roles.cache.get(PERK_ROLE_ID);
  if (!role) return;
  if (role.position >= me.roles.highest.position) return;
  if (member.roles.cache.has(PERK_ROLE_ID)) return;
  await member.roles.add(role).catch(() => { });
  const refreshedMember = await member.guild.members.fetch(member.id).catch(() => null);
  if (!refreshedMember?.roles?.cache?.has(PERK_ROLE_ID)) {
    global.logger?.warn?.("[EXP] perk role assign failed:", member.guild.id, member.id, PERK_ROLE_ID);
  }
}

async function syncLevelRolesForMember(guild, userId, level) {
  if (!guild || !userId) return [];
  const safeLevel = Math.max(0, Math.floor(Number(level || 0)));
  const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
  if (!member) return [];
  const awarded = [];
  const reachedPerkLevels = Array.from(LEVEL_ROLE_MAP.keys()).filter((perkLevel) => perkLevel <= safeLevel).sort((a, b) => a - b);
  for (const perkLevel of reachedPerkLevels) {
    const roleId = LEVEL_ROLE_MAP.get(perkLevel);
    if (!roleId) continue;
    const ok = await addLevelRoleIfPossible(member, roleId);
    if (ok) awarded.push(roleId);
  }
  if (safeLevel >= 10) {
    await addPerkRoleIfPossible(member);
  }
  return awarded;
}

async function addExpWithLevel(guild, userId, amount, applyMultiplier = false, includeWeekly = true) {
  if (!guild || !userId) return null;
  const member = await fetchGuildMember(guild, userId);
  if (member?.user?.bot) return null;
  let effectiveAmount = amount;
  if (applyMultiplier) {
    const settings = await getGuildExpSettings(guild.id);
    const globalMulti = settings.effectiveMultiplier;
    const roleMulti = getRoleMultiplier(member || null, settings);
    const roleBonus = Math.max(0, Number(roleMulti || 1) - 1);
    const extraBonus = settings?.eventExpiresAt && Array.isArray(settings.eventExtraMultiplierRoleIds) && (member && settings.eventExtraMultiplierRoleIds.some((id) => member.roles?.cache?.has(id))) ? 1 : 0;
    const combined = Math.min(MAX_COMBINED_MULTIPLIER, Math.max(1, Number(globalMulti || 1) + roleBonus + extraBonus),);
    effectiveAmount = Number(amount || 0) * combined;
  }
  let weeklyAmount = null;
  if (!includeWeekly) {
    weeklyAmount = 0;
  } else if (applyMultiplier) {
    weeklyAmount = Number(amount || 0);
  }
  const result = await addExp(guild.id, userId, effectiveAmount, false, weeklyAmount,);
  if (!result || !result.levelInfo) return result;
  if (result.levelInfo.level > (result.prevLevel ?? 0)) {
    await recordLevelHistory({
      guildId: guild.id,
      userId,
      action: "level_up_auto",
      beforeExp: result.beforeExp,
      afterExp: result.afterExp,
      note: `Level up ${result.prevLevel ?? 0} -> ${result.levelInfo.level}`,
    });
  }
  if (result.levelInfo.level > (result.prevLevel ?? 0)) {
    if (member) {
      const level = result.levelInfo.level;
      const reachedPerkLevels = Array.from(LEVEL_ROLE_MAP.keys()).filter((perkLevel) => perkLevel > (result.prevLevel ?? 0) && perkLevel <= level,).sort((a, b) => a - b);
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
      await maybeSendPerkNearReminder(guild, member, result);
    }
  } else if (result.levelInfo.level >= 10 && member) {
    await addPerkRoleIfPossible(member);
    await maybeSendPerkNearReminder(guild, member, result);
  } else if (member) {
    await maybeSendPerkNearReminder(guild, member, result);
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
  const doc = await GlobalSettings.findOneAndUpdate({ guildId }, { $set: { expMultiplier: value } }, { upsert: true, new: true, setDefaultsOnInsert: true },);
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
    {
      $set: {
        expEventMultiplier: value,
        expEventMultiplierExpiresAt: expiresAt,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
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
    { upsert: true, new: true, setDefaultsOnInsert: true },
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
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  invalidateSettingsCache(guildId);
  return next;
}

async function resolveMemberVisibilityRoleForExp(guild) {
  if (!guild) return null;
  const configuredId = String(IDs.roles?.Member || "").trim();
  if (configuredId) {
    const role = guild.roles?.cache?.get(configuredId) || (await guild.roles?.fetch(configuredId).catch(() => null));
    if (role) return role;
  }
  return guild.roles?.everyone || null;
}

async function isChannelEligibleForMemberExp(guild, channelId) {
  const id = String(channelId || "").trim();
  if (!guild || !id) return true;
  const role = await resolveMemberVisibilityRoleForExp(guild);
  if (!role) return true;

  const channel = guild.channels?.cache?.get(id) || (await guild.channels?.fetch(id).catch(() => null));
  if (!channel) return false;

  const perms = channel.permissionsFor(role);
  if (!perms?.has("ViewChannel")) return false;

  if (perms.has("SendMessages")) return true;
  if (perms.has("Connect")) return true;
  return false;
}

async function shouldIgnoreExpForMember({ guildId, member, channelId = null }) {
  const settings = await getGuildExpSettings(guildId);
  if (channelId && settings.lockedChannelIds.includes(channelId)) return true;
  if (channelId && EXP_EXCLUDED_CATEGORY_IDS.size > 0) {
    const guild = member?.guild || null;
    const channel = guild?.channels?.cache?.get(channelId) || (await guild?.channels?.fetch?.(channelId).catch(() => null));
    const parentId = String(channel?.parentId || "");
    if (parentId && EXP_EXCLUDED_CATEGORY_IDS.has(parentId)) return true;
  }
  if (channelId) {
    const guild = member?.guild || null;
    const allowed = await isChannelEligibleForMemberExp(guild, channelId);
    if (!allowed) return true;
  }
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
  return LevelHistory.find({ guildId, userId })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean()
    .catch(() => []);
}

async function getLevelHistoryPage(guildId, userId, page = 1, pageSize = 10) {
  if (!guildId || !userId)
    return { rows: [], page: 1, totalPages: 1, totalCount: 0, pageSize: 10 };
  const safePageSize = Math.max(1, Math.min(20, Number(pageSize || 10)));
  const safePage = Math.max(1, Number(page || 1));
  const filter = { guildId, userId };
  const totalCount = await LevelHistory.countDocuments(filter).catch(() => 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const effectivePage = Math.min(safePage, totalPages);
  const skip = (effectivePage - 1) * safePageSize;
  const rows = await LevelHistory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safePageSize).lean().catch(() => []);
  return {
    rows,
    page: effectivePage,
    totalPages,
    totalCount,
    pageSize: safePageSize,
  };
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
    progressPercent: levelInfo.progressPercent,
  };
}

async function getUserRanks(guildId, userId) {
  const stats = await getUserExpStats(guildId, userId);
  if (stats.level === 0) {
    return { stats, weeklyRank: null, allTimeRank: null };
  }
  const currentWeekKey = getIsoWeekKey(new Date());
  const [weeklyHigher, totalHigher] = await Promise.all([ExpUser.countDocuments({ guildId, weeklyKey: currentWeekKey, weeklyExp: { $gt: stats.weeklyExp }, }), ExpUser.countDocuments({ guildId, totalExp: { $gt: stats.totalExp } }),]);
  return {
    stats,
    weeklyRank: weeklyHigher + 1,
    allTimeRank: totalHigher + 1,
  };
}

async function retroSyncGuildLevels(guild, { syncRoles = true } = {}) {
  if (!guild?.id) {
    return {
      scanned: 0,
      changed: 0,
      raised: 0,
      lowered: 0,
      roleSynced: 0,
    };
  }

  const guildId = guild.id;
  const changedUsers = [];
  const batchOps = [];
  let scanned = 0;
  let changed = 0;
  let raised = 0;
  let lowered = 0;

  const cursor = ExpUser.find({ guildId }).select("userId totalExp level").lean().cursor();

  for await (const doc of cursor) {
    scanned += 1;
    const totalExp = Math.max(0, Math.floor(Number(doc?.totalExp || 0)));
    const oldLevel = Math.max(0, Math.floor(Number(doc?.level || 0)));
    const newLevel = getLevelInfo(totalExp).level;
    if (newLevel === oldLevel) continue;

    changed += 1;
    if (newLevel > oldLevel) raised += 1;
    if (newLevel < oldLevel) lowered += 1;
    changedUsers.push({ userId: String(doc.userId), newLevel });

    batchOps.push({
      updateOne: {
        filter: { guildId, userId: String(doc.userId) },
        update: { $set: { level: newLevel } },
      },
    });

    if (batchOps.length >= 500) {
      await ExpUser.bulkWrite(batchOps, { ordered: false }).catch(() => null);
      batchOps.length = 0;
    }
  }

  if (batchOps.length > 0) {
    await ExpUser.bulkWrite(batchOps, { ordered: false }).catch(() => null);
  }

  let roleSynced = 0;
  if (syncRoles && changedUsers.length > 0) {
    for (const row of changedUsers) {
      await syncLevelRolesForMember(guild, row.userId, row.newLevel).catch(
        () => { },
      );
      roleSynced += 1;
    }
  }

  return { scanned, changed, raised, lowered, roleSynced };
}

module.exports = { MESSAGE_EXP, VOICE_EXP_PER_MINUTE, addExp, addExpWithLevel, getUserExpStats, getUserRanks, getLevelInfo, getTotalExpForLevel, getGlobalMultiplier, setGlobalMultiplier, setTemporaryEventMultiplier, setActivityEvent, clearActivityEvent, clearStaffEvent, setStaffEvent, getStaffEventSettings, getGuildExpSettings, invalidateSettingsCache, setLevelChannelLocked, setRoleIgnored, shouldIgnoreExpForMember, recordLevelHistory, getRecentLevelHistory, getLevelHistoryPage, syncLevelRolesForMember, retroSyncGuildLevels, getRoleMultiplier, getCurrentWeekKey, ROLE_MULTIPLIERS, isEventStaffMember, scheduleEventLevelUpMessage };