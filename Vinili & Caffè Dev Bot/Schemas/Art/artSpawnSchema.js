const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const artSpawnSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, index: true },
    messageId: { type: String, required: true, unique: true, index: true },
    cardId: { type: String, required: true },
    rarity: { type: String, default: 'common' },
    source: { type: String, default: '' },
    spawnedBy: { type: String, default: null },
    claimedBy: { type: String, default: null },
    claimedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.models.art_spawns || model('art_spawns', artSpawnSchema);
