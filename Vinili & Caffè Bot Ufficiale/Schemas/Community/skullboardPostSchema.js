const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const SkullboardPostSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  messageId: { type: String, required: true, index: true },
  postMessageId: { type: String, default: null }
});

SkullboardPostSchema.index({ guildId: 1, messageId: 1 }, { unique: true });

module.exports = mongoose.models.SkullboardPost || model('SkullboardPost', SkullboardPostSchema);
