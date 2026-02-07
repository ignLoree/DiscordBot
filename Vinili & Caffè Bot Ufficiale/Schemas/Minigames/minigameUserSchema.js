const mongoose = require('mongoose');

const minigameUserSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    totalExp: { type: Number, default: 0 }
  },
  { timestamps: true }
);

minigameUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.MinigameUser || mongoose.model('MinigameUser', minigameUserSchema);
