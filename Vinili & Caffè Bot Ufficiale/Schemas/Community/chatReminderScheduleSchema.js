const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const chatReminderScheduleSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    fireAt: { type: Date, required: true },
    kind: { type: String, default: 'first' }
  },
  { timestamps: true }
);

chatReminderScheduleSchema.index({ guildId: 1, fireAt: 1 });

module.exports = mongoose.models.ChatReminderSchedule || model('ChatReminderSchedule', chatReminderScheduleSchema);
