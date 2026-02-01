const { Schema, model } = require('mongoose');

const artRollSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    day: { type: String, required: true, index: true }, YYYY-MM-DD
    count: { type: Number, default: 0 },
    lastAt: { type: Date, default: null }
  },
  { timestamps: true }
);

artRollSchema.index({ guildId: 1, userId: 1, day: 1 }, { unique: true });

module.exports = model('art_rolls', artRollSchema);
