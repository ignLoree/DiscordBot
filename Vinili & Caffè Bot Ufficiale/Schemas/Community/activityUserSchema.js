const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const activityUserSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    messages: {
      total: { type: Number, default: 0 },
      daily: { type: Number, default: 0 },
      weekly: { type: Number, default: 0 },
      dailyKey: { type: String, default: '' },
      weeklyKey: { type: String, default: '' }
    },
    voice: {
      totalSeconds: { type: Number, default: 0 },
      dailySeconds: { type: Number, default: 0 },
      weeklySeconds: { type: Number, default: 0 },
      dailyKey: { type: String, default: '' },
      weeklyKey: { type: String, default: '' },
      sessionStartedAt: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

activityUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.ActivityUser || model('ActivityUser', activityUserSchema);
