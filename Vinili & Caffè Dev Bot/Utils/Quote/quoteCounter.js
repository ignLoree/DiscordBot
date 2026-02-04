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

module.exports = {
  nextQuoteCount
};
