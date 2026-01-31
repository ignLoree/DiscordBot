const { model, Schema } = require("mongoose");

const voiceSessionSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  channelId: { type: String, required: true },
  startedAt: { type: Date, required: true, default: Date.now }
});

voiceSessionSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = model("VoiceSession", voiceSessionSchema);
