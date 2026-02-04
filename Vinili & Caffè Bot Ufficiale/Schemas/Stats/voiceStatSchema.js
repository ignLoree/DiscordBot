const mongoose = require('mongoose');
const { model, Schema } = mongoose;

const voiceStatSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  date: { type: String, required: true, index: true },
  channelId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  seconds: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

voiceStatSchema.index({ guildId: 1, date: 1, channelId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.VoiceStat || model('VoiceStat', voiceStatSchema);
