const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const reviewRewardSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    rewardedBy: { type: String, default: null },
    rewardedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

reviewRewardSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.ReviewReward || model('ReviewReward', reviewRewardSchema);

