const mongoose = require('mongoose');
const EngagementStateSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  lastRunAt: { type: Date, default: null },
  lastQuizLoopAt: { type: Date, default: null },
  lastResetDate: { type: String, default: null },
  usedItemIds: { type: [String], default: [] }
}, { timestamps: true });
EngagementStateSchema.index({ guildId: 1 }, { unique: true });
module.exports.EngagementState = mongoose.models.EngagementState || mongoose.model('EngagementState', EngagementStateSchema);
