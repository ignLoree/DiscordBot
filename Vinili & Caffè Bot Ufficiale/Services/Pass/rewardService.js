const { Transaction } = require('../../Schemas/Pass/transaction');
const { addTickets, addFragments } = require('./passService')

async function grantRewards({ guildId, seasonId, userId, passUser, rewards, reason }) {
  if (!rewards) return;
  if (rewards.tickets) {
    await addTickets(passUser, rewards.tickets);
    await Transaction.create({ guildId, seasonId, userId, type: 'grant', currency: 'tickets', amount: rewards.tickets, reason });
  }
  if (rewards.fragments) {
    await addFragments(passUser, rewards.fragments);
    for (const [k, v] of Object.entries(rewards.fragments)) {
      await Transaction.create({ guildId, seasonId, userId, type: 'grant', currency: `fragment:${k}`, amount: v, reason });
    }
  }
}

module.exports = { grantRewards };