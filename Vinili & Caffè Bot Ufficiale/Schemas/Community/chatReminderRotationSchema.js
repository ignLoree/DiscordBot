const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const chatReminderRotationSchema = new Schema(
  {
    guildId: { type: String, required: true },
    dateKey: { type: String, required: true },
    queue: { type: [Number], default: [] },
    lastSentAt: { type: Date, default: null }
  },
  { timestamps: true }
);

chatReminderRotationSchema.index({ guildId: 1 }, { unique: true });

module.exports = mongoose.models.ChatReminderRotation || model('ChatReminderRotation', chatReminderRotationSchema);
