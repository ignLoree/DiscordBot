const { RaidState } = require('../../Schemas/Pass/raidState');
const { getOrCreatePassUser } = require('./passService');
const { registerProgress } = require('./objectiveService');

async function getOrCreateRaid({ guildId, seasonId }) {
  let r = await RaidState.findOne({ guildId, seasonId });
  if (!r) {
    r = await RaidState.create({
      guildId,
      seasonId,
      active: false,
      boss: {
        hpMax: 0,
        hpNow: 0,
        phase: 1
      },
      contrib: {},
      rewardsUnlocked: []
    });
  }
  return r;
}

async function applyRaidDamage({ raid, userId, amount }) {
  if (!raid.active) throw new Error('<:vegax:1443934876440068179> Nessun raid attivo.');
  raid.boss.hpNow = Math.max(0, raid.boss.hpNow - amount);
  const prev = raid.contrib.get(userId) || 0;
  raid.contrib.set(userId, prev + amount);
  if (raid.boss.hpNow <= raid.boss.hpMax * 0.5 && !raid.rewardsUnlocked.includes('half')) {
    raid.rewardsUnlocked.push('half');
  }
  const shouldAwardBoss = raid.boss.hpNow <= 0 && !raid.rewardsUnlocked.includes('dead');
  if (raid.boss.hpNow <= 0 && !raid.rewardsUnlocked.includes('dead')) {
    raid.rewardsUnlocked.push('dead');
    raid.active = false;
    raid.boss.defeatedAt = new Date();
  }
  await raid.save();
  if (shouldAwardBoss) {
    await awardRaidBossCompletion(raid);
  }
  return raid;
}

async function awardRaidBossCompletion(raid) {
  for (const [uid, dmg] of raid.contrib) {
    if (!dmg || dmg <= 0) continue;
    const u = await getOrCreatePassUser({
      guildId: raid.guildId,
      seasonId: raid.seasonId,
      userId: uid
    });
    await registerProgress({
      guildId: raid.guildId,
      seasonId: raid.seasonId,
      passUser: u,
      type: 'raid_boss',
      amount: 1
    });
    await registerProgress({
      guildId: raid.guildId,
      seasonId: raid.seasonId,
      passUser: u,
      type: 'complete_pass',
      amount: 1
    });
  }
}

module.exports = { getOrCreateRaid, applyRaidDamage };