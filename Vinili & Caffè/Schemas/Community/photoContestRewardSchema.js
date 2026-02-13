const mongoose = require('mongoose');
const { Schema, model, models } = mongoose;

const photoContestRewardSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    roleId: { type: String, required: true, index: true },
    channelId: { type: String, default: null, index: true },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

photoContestRewardSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = models.PhotoContestReward || model('PhotoContestReward', photoContestRewardSchema);
