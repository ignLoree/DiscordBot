const { Season } = require('../../Schemas/Pass/season');

async function getActiveSeason(guildId) {
  return Season.findOne({ guildId, isActive: true }).lean();
}

async function requireActiveSeason(guildId) {
  const s = await Season.findOne({ guildId, isActive: true });
  if (!s) throw new Error('<:vegax:1443934876440068179> Nessuna stagione attiva');
  return s;
}

module.exports = { getActiveSeason, requireActiveSeason };