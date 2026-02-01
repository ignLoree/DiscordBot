const mongoose = require('mongoose');
const SeasonSchema = new mongoose.Schema({
  guildId: { type: String, index: true, required: true },
  seasonId: { type: String, index: true, required: true },
  name: { type: String, required: true },
  theme: { type: String, default: '' },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  isActive: { type: Boolean, default: false },
  config: { type: Object, default: {} }
}, { timestamps: true });
SeasonSchema.index({ guildId: 1, seasonId: 1 }, { unique: true });
module.exports.Season = mongoose.models.Season || mongoose.model('Season', SeasonSchema);