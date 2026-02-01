const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const SarabandaStatsSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    totalPoints: { type: Number, default: 0 },
    weeklyPoints: { type: Number, default: 0 },
    monthlyPoints: { type: Number, default: 0 },
    weekKey: { type: String, default: '' },
    monthKey: { type: String, default: '' }
  },
  { timestamps: true }
);

SarabandaStatsSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.SarabandaStats || model('SarabandaStats', SarabandaStatsSchema);
