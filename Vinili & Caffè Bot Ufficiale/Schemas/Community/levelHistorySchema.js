const mongoose = require('mongoose');
const { Schema, model, models } = mongoose;

const levelHistorySchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    actorId: { type: String, default: null, index: true },
    action: { type: String, required: true, index: true },
    beforeExp: { type: Number, default: 0 },
    afterExp: { type: Number, default: 0 },
    beforeLevel: { type: Number, default: 0 },
    afterLevel: { type: Number, default: 0 },
    deltaExp: { type: Number, default: 0 },
    note: { type: String, default: null }
  },
  { timestamps: true }
);

levelHistorySchema.index({ guildId: 1, userId: 1, createdAt: -1 });

module.exports = models.LevelHistory || model('LevelHistory', levelHistorySchema);
