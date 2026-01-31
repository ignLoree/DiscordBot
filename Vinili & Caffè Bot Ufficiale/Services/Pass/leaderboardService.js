const { PassUser } = require('../../Schemas/Pass/passUser');

async function topPass({ guildId, seasonId, limit = 10 }) {
  const rows = await PassUser.aggregate([
    { $match: { guildId, seasonId } },
    { $addFields: { completedCount: { $size: '$completedNodes' } } },
    { $sort: { completedCount: -1, tickets: -1 } },
    { $limit: limit },
    { $project: { userId: 1, completedCount: 1, tickets: 1 } }
  ]);
  return rows;
}

async function topRaid({ guildId, seasonId, limit = 10 }) {
  const rows = await PassUser.find({ guildId, seasonId })
    .sort({ 'stats.raidDamage': -1 })
    .limit(limit)
    .select({ userId: 1, 'stats.raidDamage': 1 })
    .lean();
  return rows.map(r => ({ userId: r.userId, raidDamage: r.stats?.raidDamage || 0 }));
}

module.exports = { topPass, topRaid };