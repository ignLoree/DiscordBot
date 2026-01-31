const mongoose = require('mongoose');
const RaidStateSchema = new mongoose.Schema({
  guildId: { type: String, index: true, required: true },
  seasonId: { type: String, index: true, required: true },
  active: { type: Boolean, default: false },
  boss: {
    hpMax: { type: Number, default: 10000 },
    hpNow: { type: Number, default: 10000 },
    phase: { type: Number, default: 1 },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    defeatedAt: { type: Date, default: null }
  },
  contrib: { type: Map, of: Number, default: {} },
  rewardsUnlocked: { type: [String], default: [] }
}, { timestamps: true });
RaidStateSchema.index({ guildId: 1, seasonId: 1 }, { unique: true });
module.exports.RaidState = mongoose.model('RaidState', RaidStateSchema);
