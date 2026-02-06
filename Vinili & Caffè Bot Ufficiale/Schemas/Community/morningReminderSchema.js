const mongoose = require('mongoose');

const MorningReminderStateSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  lastSentAt: { type: Date, default: null },
  lastSentDate: { type: String, default: null },
  usedQuestionIndexes: { type: [Number], default: [] },
  usedQuestions: { type: [String], default: [] },
  sessionToken: { type: String, default: null }
}, { timestamps: true });

MorningReminderStateSchema.index({ guildId: 1 }, { unique: true });

module.exports.MorningReminderState = mongoose.models.MorningReminderState || mongoose.model('MorningReminderState', MorningReminderStateSchema);
