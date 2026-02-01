const moment = require('moment');
const SarabandaStats = require('../../Schemas/Sarabanda/sarabandaStats');

function getWeekKey(date = new Date()) {
  return moment(date).format('GGGG-[W]WW');
}

function getMonthKey(date = new Date()) {
  return moment(date).format('YYYY-MM');
}

async function addPoints({ guildId, userId, points }) {
  const now = new Date();
  const weekKey = getWeekKey(now);
  const monthKey = getMonthKey(now);

  const doc = await SarabandaStats.findOne({ guildId, userId });
  if (!doc) {
    const created = new SarabandaStats({
      guildId,
      userId,
      totalPoints: points,
      weeklyPoints: points,
      monthlyPoints: points,
      weekKey,
      monthKey
    });
    await created.save();
    return created;
  }

  if (doc.weekKey !== weekKey) {
    doc.weekKey = weekKey;
    doc.weeklyPoints = 0;
  }
  if (doc.monthKey !== monthKey) {
    doc.monthKey = monthKey;
    doc.monthlyPoints = 0;
  }

  doc.totalPoints += points;
  doc.weeklyPoints += points;
  doc.monthlyPoints += points;
  await doc.save();
  return doc;
}

async function getLeaderboard(guildId, period = 'total', limit = 10) {
  let field = 'totalPoints';
  if (period === 'weekly') field = 'weeklyPoints';
  if (period === 'monthly') field = 'monthlyPoints';
  return SarabandaStats.find({ guildId })
    .sort({ [field]: -1 })
    .limit(limit)
    .lean();
}

module.exports = { addPoints, getLeaderboard };
