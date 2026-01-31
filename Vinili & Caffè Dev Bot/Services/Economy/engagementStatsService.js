const { EngagementStats } = require('../../Schemas/Engagement/engagementStats');

async function getOrCreateStats({ guildId, userId }) {
  return EngagementStats.findOneAndUpdate(
    { guildId, userId },
    { $setOnInsert: { guildId, userId } },
    { upsert: true, new: true }
  );
}

async function addWin({ guildId, userId, type }) {
  const stats = await getOrCreateStats({ guildId, userId });
  if (type === 'quiz') stats.winsQuiz += 1;
  if (type === 'scramble') stats.winsScramble += 1;
  if (type === 'flag') stats.winsFlag += 1;
  if (type === 'player') stats.winsPlayer += 1;
  stats.winsTotal += 1;
  await stats.save();
  return stats;
}

module.exports = { getOrCreateStats, addWin };