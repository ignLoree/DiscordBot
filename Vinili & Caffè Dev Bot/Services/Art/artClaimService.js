const ArtSpawn = require('../../Schemas/Art/artSpawnSchema');
const ArtCard = require('../../Schemas/Art/artCardSchema');
const ArtUser = require('../../Schemas/Art/artUserSchema');

async function claimArtFromMessage({ messageId, userId, guildId }) {
  const spawn = await ArtSpawn.findOne({ messageId });
  if (!spawn) return { ok: false, reason: 'not_found' };
  if (spawn.expiresAt && spawn.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (spawn.claimedBy) {
    return { ok: false, reason: 'claimed', claimedBy: spawn.claimedBy };
  }

  spawn.claimedBy = userId;
  spawn.claimedAt = new Date();
  await spawn.save();

  const card = await ArtCard.findOne({ cardId: spawn.cardId });
  if (card) {
    card.catchCount = (card.catchCount || 0) + 1;
    await card.save();
  }

  const user = await ArtUser.findOneAndUpdate(
    { guildId, userId },
    { $setOnInsert: { guildId, userId, total: 0, unique: 0, cards: [] } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const existing = user.cards.find((c) => c.cardId === spawn.cardId);
  if (existing) {
    existing.count += 1;
  } else {
    user.cards.push({ cardId: spawn.cardId, count: 1, firstAt: new Date() });
    user.unique += 1;
  }
  user.total += 1;
  await user.save();

  return { ok: true, spawn, card, user };
}

module.exports = { claimArtFromMessage };
