const { PassUser } = require('../../Schemas/Pass/passUser');
const { Transaction } = require('../../Schemas/Pass/transaction');
const CONFIG = require('../../config');
const { isSameDay, startOfToday } = require('../../Utils/Pass/time')

async function getOrCreatePassUser({ guildId, seasonId, userId }) {
  let u = await PassUser.findOne({ guildId, seasonId, userId });
  if (!u) {
    u = await PassUser.create({
      guildId, seasonId, userId,
      energy: CONFIG.pass.energyMax,
      energyLastRefillAt: new Date(),
      dailyResetAt: startOfToday()
    });
  }
  await maybeDailyReset(u);
  await maybeRefillEnergy(u);
  return u;
}

async function maybeDailyReset(u) {
  const today = startOfToday();
  if (!u.dailyResetAt || !isSameDay(u.dailyResetAt, today)) {
    u.stats.chatTicketsToday = 0;
    u.stats.voiceTicketsToday = 0;
    u.stats.chatCountToday = 0;
    u.stats.voiceMinutesToday = 0;
    u.stats.chatChannelsToday = [];
    u.stats.partyToday = false;
    u.dailyResetAt = today;
    await u.save();
  }
}

async function maybeRefillEnergy(u) {
  const today = startOfToday();
  if (!u.energyLastRefillAt || !isSameDay(u.energyLastRefillAt, today)) {
    u.energy = CONFIG.pass.energyMax;
    u.energyLastRefillAt = today;
    await u.save();
  }
}

async function spendEnergyTickets(u, { energy = 0, tickets = 0, fragments = null, reason = 'cost' }) {
  if (energy > 0 && u.energy < energy) throw new Error('<:vegax:1443934876440068179> Energia insufficiente.');
  if (tickets > 0 && u.tickets < tickets) throw new Error('<:vegax:1443934876440068179> Ticket insufficienti.');
  if (fragments) {
    for (const [k, v] of Object.entries(fragments)) {
      if (v <= 0) continue;
      const curr = u.fragments.get(k) || 0;
      if (curr < v) throw new Error(`<:vegax:1443934876440068179> Frammenti insufficienti: ${k}`);
    }
  }
  u.energy -= energy;
  u.tickets -= tickets;
  if (fragments) {
    for (const [k, v] of Object.entries(fragments)) {
      if (v <= 0) continue;
      const curr = u.fragments.get(k) || 0;
      u.fragments.set(k, curr - v);
    }
  }
  await u.save();
  if (tickets > 0) {
    await Transaction.create({
      guildId: u.guildId,
      seasonId: u.seasonId,
      userId: u.userId,
      type: 'spend',
      currency: 'tickets',
      amount: tickets,
      reason
    });
  }
  if (fragments) {
    for (const [k, v] of Object.entries(fragments)) {
      if (v <= 0) continue;
      await Transaction.create({
        guildId: u.guildId,
        seasonId: u.seasonId,
        userId: u.userId,
        type: 'spend',
        currency: `fragment:${k}`,
        amount: v,
        reason
      });
    }
  }
}

async function spendTickets(u, amount) {
  if (amount <= 0) return;
  if (u.tickets < amount) throw new Error('<:vegax:1443934876440068179> Ticket insufficienti.');
  u.tickets -= amount;
  await u.save();
}

async function spendFragments(u, fragmentsObj) {
  if (!fragmentsObj) return;
  for (const [k, v] of Object.entries(fragmentsObj)) {
    if (v <= 0) continue;
    const curr = u.fragments.get(k) || 0;
    if (curr < v) throw new Error(`<:vegax:1443934876440068179> Frammenti insufficienti: ${k}`);
  }
  for (const [k, v] of Object.entries(fragmentsObj)) {
    if (v <= 0) continue;
    const curr = u.fragments.get(k) || 0;
    u.fragments.set(k, curr - v);
  }
  await u.save();
}

async function addTickets(u, amount) {
  u.tickets += amount;
  await u.save();
}

async function addFragments(u, fragmentsObj) {
  if (!fragmentsObj) return;
  for (const [k, v] of Object.entries(fragmentsObj)) {
    const curr = u.fragments.get(k) || 0;
    u.fragments.set(k, curr + v);
  }
  await u.save();
}

module.exports = { getOrCreatePassUser, spendEnergyTickets, spendTickets, spendFragments, addTickets, addFragments };