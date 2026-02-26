const mongoose = require("mongoose");
const { model, Schema } = mongoose;

const voiceDisconnectCounterSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    count: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

voiceDisconnectCounterSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports =
  mongoose.models.VoiceDisconnectCounter ||
  model("VoiceDisconnectCounter", voiceDisconnectCounterSchema);