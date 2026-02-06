const QuoteCount = require("../../Schemas/Quote/quoteCountSchema");

async function nextQuoteCount(guildId) {
  if (!guildId) return 1;
  const doc = await QuoteCount.findOneAndUpdate(
    { guildId },
    { $inc: { count: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc?.count || 1;
}

async function decrementQuoteCount(guildId) {
  if (!guildId) return 0;
  const doc = await QuoteCount.findOneAndUpdate(
    { guildId },
    { $inc: { count: -1 } },
    { new: true }
  );
  if (!doc) return 0;
  if (doc.count < 0) {
    await QuoteCount.updateOne({ guildId }, { $set: { count: 0 } });
    return 0;
  }
  return doc.count;
}

module.exports = { nextQuoteCount, decrementQuoteCount };
