const mongoose = require('mongoose');
const MissionSchema = new mongoose.Schema({
  guildId: { type: String, index: true, required: true },
  seasonId: { type: String, index: true, required: true },
  id: { type: String, required: true },
  kind: { type: String, enum: ['daily', 'weekly', 'event'], required: true },
  title: String,
  description: String,
  objective: { kind: String, target: Number },
  rewards: { type: Object, default: {} },
  activeFrom: { type: Date, required: true },
  activeTo: { type: Date, required: true }
}, { timestamps: true });
MissionSchema.index({ guildId: 1, seasonId: 1, id: 1 }, { unique: true });
module.exports.Mission = mongoose.model('Mission', MissionSchema);
