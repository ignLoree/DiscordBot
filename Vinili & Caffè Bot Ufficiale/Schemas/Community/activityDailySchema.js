const mongoose = require('mongoose');
const { Schema, model, models } = mongoose;

const activityDailySchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    textCount: { type: Number, default: 0 },
    voiceSeconds: { type: Number, default: 0 },
    textChannels: { type: Map, of: Number, default: {} },
    voiceChannels: { type: Map, of: Number, default: {} }
  },
  { timestamps: true }
);

activityDailySchema.index({ guildId: 1, dateKey: 1, userId: 1 }, { unique: true });

module.exports = models.ActivityDaily || model('ActivityDaily', activityDailySchema);

