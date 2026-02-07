const mongoose = require('mongoose');

const minigameRotationSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true, index: true },
    dateKey: { type: String, required: true },
    queue: { type: [String], default: [] }
  },
  { timestamps: true }
);

minigameRotationSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

module.exports = mongoose.models.MinigameRotation || mongoose.model('MinigameRotation', minigameRotationSchema);
