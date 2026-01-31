const mongoose = require('mongoose');
const EngagementStatsSchema = new mongoose.Schema({
  guildId: { type: String, index: true, required: true },
  userId: { type: String, index: true, required: true },
  winsQuiz: { type: Number, default: 0 },
  winsScramble: { type: Number, default: 0 },
  winsFlag: { type: Number, default: 0 },
  winsPlayer: { type: Number, default: 0 },
  winsTotal: { type: Number, default: 0 }
}, { timestamps: true });
EngagementStatsSchema.index({ guildId: 1, userId: 1 }, { unique: true });
module.exports.EngagementStats = mongoose.model('EngagementStats', EngagementStatsSchema);
