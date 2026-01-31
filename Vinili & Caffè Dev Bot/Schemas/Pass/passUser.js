const mongoose = require('mongoose');
const PassUserSchema = new mongoose.Schema({
  guildId: { type: String, index: true, required: true },
  seasonId: { type: String, index: true, required: true },
  userId: { type: String, index: true, required: true },
  energy: { type: Number, default: 0 },
  energyLastRefillAt: { type: Date, default: null },
  tickets: { type: Number, default: 0 },
  fragments: { type: Map, of: Number, default: {} },
  completedNodes: { type: [String], default: [] },
  claimedRewards: { type: [String], default: [] },
  progress: { type: Map, of: Number, default: {} },
  missionsProgress: { type: Map, of: Number, default: {} },
  completedMissions: { type: [String], default: [] },
  path: { type: String, enum: ['none', 'chaos', 'order'], default: 'none' },
  stats: {
    chatCountToday: { type: Number, default: 0 },
    chatTicketsToday: { type: Number, default: 0 },
    voiceTicketsToday: { type: Number, default: 0 },
    voiceMinutesToday: { type: Number, default: 0 },
    raidDamage: { type: Number, default: 0 },
    chatChannelsToday: { type: [String], default: [] },
    partyToday: { type: Boolean, default: false },
    lastPartyAt: { type: Date, default: null },
    lastQuizWinAt: { type: Date, default: null },
    lastPartyQuizComboAt: { type: Date, default: null },
    dailyMissionStreak: { type: Number, default: 0 },
    lastDailyMissionCompletedAt: { type: Date, default: null }
  },
  cooldowns: {
    lastChatRewardAt: { type: Date, default: null }
  },
  dailyResetAt: { type: Date, default: null },
  lastDailyResetAt: Date,
  lastWeeklyResetAt: Date
}, { timestamps: true });
PassUserSchema.index({ guildId: 1, seasonId: 1, userId: 1 }, { unique: true });
module.exports.PassUser = mongoose.model('PassUser', PassUserSchema);
