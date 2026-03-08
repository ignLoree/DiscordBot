"use strict";

const StaffModel = require("../../Schemas/Staff/staffSchema");
const IDs = require("../../Utils/Config/ids");
const { getOrCreateStaffDoc } = require("../../Utils/Staff/staffDocUtils");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");

const NEGATIVES_PER_STAFF_WARN = 3;
const STAFF_WARN_RESET_MONTHS = 6;
const STAFF_WARN_RESET_MS = STAFF_WARN_RESET_MONTHS * 30 * 24 * 60 * 60 * 1000;

const ROLE_STAFF = String(IDs.roles.Staff);
const ROLE_HIGH_STAFF = String(IDs.roles.HighStaff);
const ROLE_MEMBER = String(IDs.roles.Member || "");
const ROLE_HELPER = String(IDs.roles.Helper);
const ROLE_MODERATOR = String(IDs.roles.Mod);
const ROLE_COORDINATOR = String(IDs.roles.Coordinator);
const ROLE_SUPERVISOR = String(IDs.roles.Supervisor);
const ROLE_ADMIN = String(IDs.roles.Admin);
const ROLE_MANAGER = String(IDs.roles.Manager);
const ROLE_CO_OWNER = String(IDs.roles.CoFounder);

const STAFF_ROLES_HIGH_TO_LOW = [
  ROLE_CO_OWNER,
  ROLE_MANAGER,
  ROLE_ADMIN,
  ROLE_SUPERVISOR,
  ROLE_COORDINATOR,
  ROLE_MODERATOR,
  ROLE_HELPER,
].filter(Boolean);

function getHighestStaffRoleId(member) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_ROLES_HIGH_TO_LOW) {
    if (member.roles.cache.has(roleId)) return roleId;
  }
  return null;
}

function resetStaffWarnsIfSixMonths(staffDoc) {
  const firstAt = staffDoc?.firstWarnStaffAt;
  if (!firstAt || !(firstAt instanceof Date)) return false;
  const elapsed = Date.now() - firstAt.getTime();
  if (elapsed < STAFF_WARN_RESET_MS) return false;
  staffDoc.warnCount = 0;
  staffDoc.warnReasons = [];
  staffDoc.firstWarnStaffAt = null;
  return true;
}

async function addStaffWarnFromNegatives(guildId, userId, negativeCountAfterAdd, reason) {
  const staffDoc = await getOrCreateStaffDoc(guildId, userId);
  if (!staffDoc) return { added: false };

  const reset = resetStaffWarnsIfSixMonths(staffDoc);
  if (reset) await staffDoc.save().catch(() => null);

  if (negativeCountAfterAdd % NEGATIVES_PER_STAFF_WARN !== 0) return { added: false };

  staffDoc.warnCount = Math.max(0, Number(staffDoc.warnCount || 0)) + 1;
  if (!Array.isArray(staffDoc.warnReasons)) staffDoc.warnReasons = [];
  staffDoc.warnReasons.push(String(reason || "3 valutazioni negative").slice(0, 500));
  if (!staffDoc.firstWarnStaffAt) staffDoc.firstWarnStaffAt = new Date();
  await staffDoc.save().catch(() => null);

  const warnCount = staffDoc.warnCount;
  return {
    added: true,
    warnCount,
    shouldAskDepex: warnCount === 2,
    shouldFullDepex: warnCount === 3,
    staffDoc,
  };
}

async function applyDepexOneLevel(guild, member) {
  const roleId = getHighestStaffRoleId(member);
  if (!roleId) return { ok: false, reason: "Nessun ruolo staff trovato." };

  if (roleId === ROLE_MODERATOR || roleId === ROLE_HELPER) {
    await member.roles.remove(roleId).catch(() => null);
    await member.roles.remove(ROLE_STAFF).catch(() => null);
    if (ROLE_MEMBER) await member.roles.add(ROLE_MEMBER).catch(() => null);
    return { ok: true, roleRemoved: roleId, fullDepex: true };
  }

  if (roleId === ROLE_COORDINATOR) {
    await member.roles.remove(ROLE_COORDINATOR).catch(() => null);
    await member.roles.add(ROLE_MODERATOR).catch(() => null);
    await member.roles.add(ROLE_STAFF).catch(() => null);
    return { ok: true, roleRemoved: roleId, newRole: ROLE_MODERATOR };
  }
  if (roleId === ROLE_SUPERVISOR) {
    await member.roles.remove(ROLE_SUPERVISOR).catch(() => null);
    await member.roles.add(ROLE_COORDINATOR).catch(() => null);
    await member.roles.add(ROLE_STAFF).catch(() => null);
    return { ok: true, roleRemoved: roleId, newRole: ROLE_COORDINATOR };
  }
  if (roleId === ROLE_ADMIN) {
    await member.roles.remove(ROLE_ADMIN).catch(() => null);
    await member.roles.remove(ROLE_STAFF).catch(() => null);
    await member.roles.remove(ROLE_HIGH_STAFF).catch(() => null);
    await member.roles.add(ROLE_SUPERVISOR).catch(() => null);
    await member.roles.add(ROLE_STAFF).catch(() => null);
    return { ok: true, roleRemoved: roleId, newRole: ROLE_SUPERVISOR };
  }
  if (roleId === ROLE_MANAGER) {
    await member.roles.remove(ROLE_MANAGER).catch(() => null);
    await member.roles.remove(ROLE_STAFF).catch(() => null);
    await member.roles.remove(ROLE_HIGH_STAFF).catch(() => null);
    await member.roles.add(ROLE_ADMIN).catch(() => null);
    await member.roles.add(ROLE_STAFF).catch(() => null);
    await member.roles.add(ROLE_HIGH_STAFF).catch(() => null);
    return { ok: true, roleRemoved: roleId, newRole: ROLE_ADMIN };
  }
  if (roleId === ROLE_CO_OWNER) {
    await member.roles.remove(ROLE_CO_OWNER).catch(() => null);
    await member.roles.remove(ROLE_STAFF).catch(() => null);
    await member.roles.remove(ROLE_HIGH_STAFF).catch(() => null);
    await member.roles.add(ROLE_MANAGER).catch(() => null);
    await member.roles.add(ROLE_STAFF).catch(() => null);
    await member.roles.add(ROLE_HIGH_STAFF).catch(() => null);
    return { ok: true, roleRemoved: roleId, newRole: ROLE_MANAGER };
  }
  return { ok: false, reason: "Ruolo non gestito per depex un livello." };
}

async function applyFullDepex(guild, member, currentRoleId) {
  const resocontoHandlers = require("../../Events/interaction/resocontoHandlers");
  const applyDepexSideEffects = resocontoHandlers?.applyDepexSideEffects;
  if (!currentRoleId) currentRoleId = getHighestStaffRoleId(member);
  if (!currentRoleId) return { ok: false, reason: "Nessun ruolo staff trovato." };
  const roleRemoved = await member.roles.remove(currentRoleId).then(() => true).catch(() => false);
  if (!roleRemoved) return { ok: false, reason: "Impossibile rimuovere il ruolo." };
  if (typeof applyDepexSideEffects !== "function") return { ok: false, reason: "applyDepexSideEffects non disponibile." };
  const sideEffectsApplied = await applyDepexSideEffects(guild, member, currentRoleId);
  if (!sideEffectsApplied) return { ok: false, reason: "Side-effect depex non completati." };
  return { ok: true, roleRemoved: currentRoleId };
}

async function runStaffWarnSixMonthReset(client) {
  const guildId = IDs.guilds?.main;
  if (!guildId) return;
  const now = Date.now();
  const docs = await StaffModel.find(
    { guildId, firstWarnStaffAt: { $ne: null, $lte: new Date(now - STAFF_WARN_RESET_MS) } },
    { userId: 1, warnCount: 1, firstWarnStaffAt: 1 },
  ).lean();
  for (const doc of docs) {
    await StaffModel.updateOne(
      { guildId, userId: doc.userId },
      { $set: { warnCount: 0, warnReasons: [], firstWarnStaffAt: null } },
    ).catch(() => null);
  }
  if (docs.length > 0) {
    global.logger?.info?.(`[STAFF WARN] Reset ${docs.length} staff warn(s) (6 mesi dal primo).`);
  }
}

function startStaffWarnResetLoop(client) {
  runStaffWarnSixMonthReset(client).catch((err) => {
    global.logger?.error?.("[STAFF WARN] Reset 6 mesi fallito:", err);
  });
  const intervalMs = 24 * 60 * 60 * 1000;
  const timer = setInterval(() => {
    runStaffWarnSixMonthReset(client).catch(() => {});
  }, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = {
  NEGATIVES_PER_STAFF_WARN,
  addStaffWarnFromNegatives,
  getHighestStaffRoleId,
  applyDepexOneLevel,
  applyFullDepex,
  runStaffWarnSixMonthReset,
  startStaffWarnResetLoop,
};
