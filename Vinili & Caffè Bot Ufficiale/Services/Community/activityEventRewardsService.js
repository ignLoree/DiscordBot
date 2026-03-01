"use strict";

const {
  ActivityEventReward,
  ExpUser,
  EventUserExpSnapshot,
  EventWeekWinner,
} = require("../../Schemas/Community/communitySchemas");
const {
  getGuildExpSettings,
  addExp,
  getTotalExpForLevel,
  getLevelInfo,
  recordLevelHistory,
  isEventStaffMember,
} = require("./expService");
const IDs = require("../../Utils/Config/ids");

async function isEventActive(guildId) {
  if (!guildId) return false;
  const settings = await getGuildExpSettings(guildId);
  return Boolean(settings?.eventExpiresAt);
}

/** Concede N livelli sotto forma di EXP (solo se evento attivo). Non applica moltiplicatori. Lo staff riceve i premi ruoli (supporter, verificato, etc.); l'esclusione staff è solo per i premi settimanali top 3. */
async function grantEventLevels(guildId, userId, levels, note = null, member = null) {
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
  const expToAdd = Math.max(
    0,
    getTotalExpForLevel(targetLevel) - getTotalExpForLevel(currentLevel),
  );
  if (expToAdd <= 0) return { doc, added: 0 };

  const result = await addExp(guildId, userId, expToAdd, false, null);
  if (!result) return null;
  await recordLevelHistory({
    guildId,
    userId,
    actorId: null,
    action: "event_reward_levels",
    beforeExp: result.beforeExp,
    afterExp: result.afterExp,
    note: note || `Evento: +${levels} livelli`,
  });
  return result;
}

/** Concede un reward una sola volta per (guildId, userId, rewardType, tier). Lo staff può ricevere i premi ruoli (supporter, verificato, guilded, invite, voter). */
async function grantEventRewardOnce(guildId, userId, rewardType, options = {}) {
  if (!guildId || !userId || !rewardType) return null;
  const active = await isEventActive(guildId);
  if (!active) return null;

  const levels = Number(options.levels);
  const tier = options.tier != null ? Number(options.tier) : null;
  if (!Number.isFinite(levels) || levels <= 0) return null;

  const tierVal = tier != null ? tier : null;
  const existing = await ActivityEventReward.findOne({
    guildId,
    userId,
    rewardType: String(rewardType),
    tier: tierVal,
  }).lean();
  if (existing) return null;

  const result = await grantEventLevels(
    guildId,
    userId,
    levels,
    `Evento reward: ${rewardType}${tier != null ? ` tier ${tier}` : ""}`,
    options.member,
  );
  if (!result) return null;

  await ActivityEventReward.create({
    guildId,
    userId,
    rewardType: String(rewardType),
    tier: tier != null ? tier : null,
  }).catch(() => null);

  return result;
}

/** Registra un vincitore settimana evento (week 2 = permesso tipo Level50, week 3 = tipo Level70). Permesso permanente: nessuna scadenza, stesso accesso a +customrole/+customvoc dei ruoli Level50/Level70. */
async function addEventWeekWinner(guildId, userId, week) {
  if (!guildId || !userId || (week !== 2 && week !== 3)) return null;
  await EventWeekWinner.findOneAndUpdate(
    { guildId, userId, week },
    { guildId, userId, week },
    { upsert: true, new: true },
  ).catch(() => null);
  return true;
}

/** True se l'utente ha il permesso evento permanente (2 = Level50-equivalente, 3 = Level70-equivalente). Usato per +customrole, +customvoc e altri comandi che richiedono Level50/Level70. */
async function hasEventWeekWinnerGrant(guildId, userId, week) {
  if (!guildId || !userId || (week !== 2 && week !== 3)) return false;
  const doc = await EventWeekWinner.findOne({ guildId, userId, week }).lean().catch(() => null);
  return Boolean(doc);
}

/** All’avvio evento: assegna le ricompense una tantum a chi ha già i ruoli (Supporter, Verificato/Verificata, Guilded). Lo staff è escluso. */
async function grantEventRewardsForExistingRoleMembers(guild) {
  if (!guild?.id) return;
  const active = await isEventActive(guild.id);
  if (!active) return;
  await guild.members.fetch().catch(() => null);
  const supporterId = IDs.roles.Supporter;
  const verificatoId = IDs.roles.Verificato;
  const verificataId = IDs.roles.Verificata;
  const guildedId = IDs.roles.Guilded;
  for (const [, member] of guild.members.cache) {
    if (!member?.user?.id) continue;
    if (isEventStaffMember(member)) continue;
    if (supporterId && member.roles.cache.has(supporterId)) {
      await grantEventRewardOnce(guild.id, member.id, "supporter", { levels: 5, member }).catch(() => null);
    }
    if (
      (verificatoId && member.roles.cache.has(verificatoId)) ||
      (verificataId && member.roles.cache.has(verificataId))
    ) {
      await grantEventRewardOnce(guild.id, member.id, "verificato", { levels: 5, member }).catch(() => null);
    }
    if (guildedId && member.roles.cache.has(guildedId)) {
      await grantEventRewardOnce(guild.id, member.id, "guilded", { levels: 10, member }).catch(() => null);
    }
  }
}

/** Restituisce la settimana dell'evento (1–4) in base a expEventStartedAt. Alla fine della N-esima settimana (es. domenica 21:00) si assegnano i premi della settimana N. */
function getEventWeekNumber(settings) {
  if (!settings?.eventStartedAt || !settings?.eventExpiresAt) return 0;
  const now = Date.now();
  const start = new Date(settings.eventStartedAt).getTime();
  const end = new Date(settings.eventExpiresAt).getTime();
  if (now < start || now > end) return 0;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const week = Math.floor((now - start) / weekMs);
  if (week < 1) return 0;
  return Math.min(4, week);
}

/** Top N utenti per EXP guadagnata da inizio evento (totalExp - snapshot). limit default 10. */
async function getTop10ExpDuringEvent(guildId, limit = 10) {
  if (!guildId) return [];
  const cap = Math.max(1, Math.min(100, Number(limit) || 10));
  const snapshots = await EventUserExpSnapshot.find({ guildId })
    .select("userId totalExpAtStart")
    .lean()
    .then((list) => new Map(list.map((d) => [String(d.userId), Number(d.totalExpAtStart) || 0])))
    .catch(() => new Map());
  const users = await ExpUser.find({ guildId })
    .select("userId totalExp")
    .lean()
    .catch(() => []);
  const withExp = users.map((d) => {
    const total = Math.max(0, Number(d?.totalExp || 0));
    const atStart = snapshots.get(String(d?.userId || "")) ?? 0;
    const during = Math.max(0, total - atStart);
    return { userId: String(d?.userId || ""), expDuringEvent: during };
  });
  return withExp
    .filter((r) => r.expDuringEvent > 0)
    .sort((a, b) => b.expDuringEvent - a.expDuringEvent)
    .slice(0, cap);
}

/** Top 3 per EXP totale durante l'evento, escludendo lo staff. Per annuncio fine evento in #news. */
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

module.exports = {
  isEventActive,
  grantEventLevels,
  grantEventRewardOnce,
  grantEventRewardsForExistingRoleMembers,
  addEventWeekWinner,
  hasEventWeekWinnerGrant,
  getTop3ExpDuringEventExcludingStaff,
  getEventWeekNumber,
  getTop10ExpDuringEvent,
};
