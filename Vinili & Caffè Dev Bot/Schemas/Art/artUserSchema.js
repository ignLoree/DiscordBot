const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const artUserSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    total: { type: Number, default: 0 },
    unique: { type: Number, default: 0 },
    cards: [
      {
        cardId: { type: String, required: true },
        count: { type: Number, default: 1 },
        firstAt: { type: Date, default: Date.now }
      }
    ],
    lastClaimAt: { type: Date, default: null }
  },
  { timestamps: true }
);

artUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.art_users || model('art_users', artUserSchema);
