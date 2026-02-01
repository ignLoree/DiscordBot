const mongoose = require('mongoose');
const { model, Schema } = mongoose;

const voiceStateSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.VoiceState || model('VoiceState', voiceStateSchema);
