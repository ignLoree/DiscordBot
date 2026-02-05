const mongoose = require('mongoose');

const minigameStateSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    target: { type: String, default: null },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    rewardExp: { type: Number, default: 0 },
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    gameMessageId: { type: String, default: null },
    targetChannelId: { type: String, default: null },
    customId: { type: String, default: null },
    mainMessageId: { type: String, default: null }
  },
  { timestamps: true }
);

minigameStateSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

module.exports = mongoose.models.MinigameState || mongoose.model('MinigameState', minigameStateSchema);
