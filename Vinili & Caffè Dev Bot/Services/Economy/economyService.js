const { Wallet } = require('../../Schemas/Economy/wallet');

async function getOrCreateWallet({ guildId, userId }) {
  return Wallet.findOneAndUpdate(
    { guildId, userId },
    { $setOnInsert: { guildId, userId } },
    { upsert: true, new: true }
  );
}

async function addCurrency({ guildId, userId, coffee = 0, vinyl = 0 }) {
  const wallet = await getOrCreateWallet({ guildId, userId });
  wallet.coffee = (wallet.coffee || 0) + coffee;
  wallet.vinyl = (wallet.vinyl || 0) + vinyl;
  await wallet.save();
  return wallet;
}

async function spendCurrency({ guildId, userId, currency, amount }) {
  if (!currency || amount <= 0) throw new Error('Invalid spend request.');
  await getOrCreateWallet({ guildId, userId });
  const update = { $inc: { [currency]: -amount } };
  const wallet = await Wallet.findOneAndUpdate(
    { guildId, userId, [currency]: { $gte: amount } },
    update,
    { new: true }
  );
  return wallet;
}

module.exports = { getOrCreateWallet, addCurrency, spendCurrency };