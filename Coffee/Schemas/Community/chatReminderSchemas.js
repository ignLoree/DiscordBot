const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const chatReminderScheduleSchema = new Schema(
  {
    guildId: { type: String, required: true },
    fireAt: { type: Date, required: true },
    kind: { type: String, default: "first" },
  },
  { timestamps: true },
);
chatReminderScheduleSchema.index({ guildId: 1, fireAt: 1 });

const chatReminderRotationSchema = new Schema(
  {
    guildId: { type: String, required: true },
    dateKey: { type: String, required: true },
    queue: { type: [Number], default: [] },
    lastSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);
chatReminderRotationSchema.index({ guildId: 1 }, { unique: true });

const ChatReminderSchedule =
  models.ChatReminderSchedule ||
  model("ChatReminderSchedule", chatReminderScheduleSchema);
const ChatReminderRotation =
  models.ChatReminderRotation ||
  model("ChatReminderRotation", chatReminderRotationSchema);

module.exports = { ChatReminderSchedule, ChatReminderRotation };