const { Mission } = require('../../Schemas/Pass/mission');
const { startOfToday, isSameDay } = require('../../Utils/Pass/time');
const { grantRewards } = require('./rewardService');
const { registerProgress } = require('./objectiveService');
const { sendPassDm } = require('./notifyService');

function startOfWeek() {
  const d = new Date();
  const day = d.getDay() || 7;
  if (day !== 1) d.setHours(-24 * (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

async function resetMissionsIfNeeded(passUser) {
  const today = startOfToday();
  const weekStart = startOfWeek();
  if (!passUser.lastDailyResetAt || !isSameDay(passUser.lastDailyResetAt, today)) {
    for (const [id] of passUser.missionsProgress) {
      if (id.startsWith('daily')) passUser.missionsProgress.delete(id);
    }
    passUser.completedMissions = passUser.completedMissions.filter(id => !id.startsWith('daily'));
    passUser.lastDailyResetAt = today;
  }
  if (!passUser.lastWeeklyResetAt || passUser.lastWeeklyResetAt < weekStart) {
    for (const [id] of passUser.missionsProgress) {
      if (id.startsWith('weekly')) passUser.missionsProgress.delete(id);
    }
    passUser.completedMissions = passUser.completedMissions.filter(id => !id.startsWith('weekly'));
    passUser.lastWeeklyResetAt = weekStart;
  }
  await passUser.save();
}

async function refreshMissionWindows({ guildId, seasonId }) {
  const now = new Date();
  const missions = await Mission.find({ guildId, seasonId });
  for (const m of missions) {
    if (m.kind !== 'daily' && m.kind !== 'weekly') continue;
    const start = m.kind === 'daily' ? startOfToday() : startOfWeek();
    const end = new Date(start);
    if (m.kind === 'daily') end.setDate(end.getDate() + 1);
    if (m.kind === 'weekly') end.setDate(end.getDate() + 7);
    if (!m.activeTo || m.activeTo < now || !m.activeFrom || m.activeFrom > now) {
      m.activeFrom = start;
      m.activeTo = end;
      await m.save();
    }
  }
}

async function registerMissionProgress({
  guildId,
  seasonId,
  passUser,
  type,
  amount = 1
}) {
  await refreshMissionWindows({ guildId, seasonId });
  await resetMissionsIfNeeded(passUser);
  await updateMissionProgressByType({ guildId, seasonId, passUser, type, amount });
}
async function updateMissionProgressByType({
  guildId,
  seasonId,
  passUser,
  type,
  amount
}) {
  const now = new Date();
  const missions = await Mission.find({
    guildId,
    seasonId,
    'objective.kind': type,
    activeFrom: { $lte: now },
    activeTo: { $gte: now }
  });
  for (const m of missions) {
    const completedNow = await applyMissionProgress({
      guildId,
      seasonId,
      passUser,
      mission: m,
      amount
    });
    if (completedNow) {
      await handleMissionCompletion({
        guildId,
        seasonId,
        passUser,
        mission: m
      });
    }
  }
}

async function applyMissionProgress({
  guildId,
  seasonId,
  passUser,
  mission,
  amount
}) {
  const { id, legacyId } = getDocIds(mission);
  await normalizeMissionIds(passUser, id, legacyId);
  if (isCompleted(passUser.completedMissions, id, legacyId)) return false;
  const target = mission.objective?.target;
  if (typeof target !== 'number') return false;
  const current = getProgressValue(passUser.missionsProgress, id, legacyId);
  const updated = current + amount;
  passUser.missionsProgress.set(id, updated);
  await passUser.save();
  if (updated < target) return false;
  if (!passUser.completedMissions.includes(id)) passUser.completedMissions.push(id);
  if (legacyId) {
    passUser.completedMissions = passUser.completedMissions.filter(m => m !== legacyId);
  }
  await passUser.save();
  await grantRewards({
    guildId,
    seasonId,
    userId: passUser.userId,
    passUser,
    rewards: mission.rewards,
    reason: `mission_complete:${id}`
  });
  await sendPassDm(
    passUser.userId,
    `<:vegacheckmark:1443666279058772028> Hai completato la missione ${mission.title || id}. Ricordati di fare /pass per visualizzare i tuoi progressi!`
  );
  return true;
}
async function handleMissionCompletion({
  guildId,
  seasonId,
  passUser,
  mission
}) {
  if (mission.kind === 'daily') {
    await registerProgress({
      guildId,
      seasonId,
      passUser,
      type: 'daily_missions',
      amount: 1
    });
    await updateMissionProgressByType({
      guildId,
      seasonId,
      passUser,
      type: 'daily_complete',
      amount: 1
    });
    const today = startOfToday();
    const last = passUser.stats.lastDailyMissionCompletedAt;
    if (!last || !isSameDay(last, today)) {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      if (last && isSameDay(last, yesterday)) {
        passUser.stats.dailyMissionStreak = (passUser.stats.dailyMissionStreak || 0) + 1;
      } else {
        passUser.stats.dailyMissionStreak = 1;
      }
      passUser.stats.lastDailyMissionCompletedAt = today;
      await passUser.save();
      if (passUser.stats.dailyMissionStreak >= 5) {
        await registerProgress({
          guildId,
          seasonId,
          passUser,
          type: 'streak5',
          amount: 1
        });
      }
    }
  }
  if (mission.kind === 'weekly') {
    await registerProgress({
      guildId,
      seasonId,
      passUser,
      type: 'weekly_missions',
      amount: 1
    });
  }
}

function getDocIds(doc) {
  if (!doc) return { id: undefined, legacyId: undefined };
  let id;
  if (typeof doc.get === 'function') {
    id = doc.get('id');
  }
  if (!id) id = doc.id;
  let legacyId;
  if (doc._id && typeof doc._id.toString === 'function') {
    legacyId = doc._id.toString();
  }
  if (legacyId === id) legacyId = undefined;
  return { id, legacyId };
}
function getProgressValue(progressMap, id, legacyId) {
  if (!progressMap || !id) return 0;
  const val = progressMap.get(id);
  if (typeof val === 'number') return val;
  if (legacyId) {
    const legacyVal = progressMap.get(legacyId);
    if (typeof legacyVal === 'number') return legacyVal;
  }
  return 0;
}
function isCompleted(list, id, legacyId) {
  if (!Array.isArray(list) || !id) return false;
  if (list.includes(id)) return true;
  if (legacyId && list.includes(legacyId)) return true;
  return false;
}
async function normalizeMissionIds(passUser, id, legacyId) {
  if (!passUser || !id || !legacyId) return;
  let changed = false;
  if (passUser.missionsProgress.has(legacyId) && !passUser.missionsProgress.has(id)) {
    passUser.missionsProgress.set(id, passUser.missionsProgress.get(legacyId));
    passUser.missionsProgress.delete(legacyId);
    changed = true;
  }
  if (passUser.completedMissions.includes(legacyId) && !passUser.completedMissions.includes(id)) {
    passUser.completedMissions.push(id);
    passUser.completedMissions = passUser.completedMissions.filter(m => m !== legacyId);
    changed = true;
  }
  if (changed) await passUser.save();
}

module.exports = { registerMissionProgress, resetMissionsIfNeeded, refreshMissionWindows };