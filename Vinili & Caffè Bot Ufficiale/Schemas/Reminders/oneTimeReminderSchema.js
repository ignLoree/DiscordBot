const mongoose = require('mongoose');
const { model, Schema } = mongoose;

const oneTimeReminderSchema = new Schema({
  key: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  message: { type: String, required: true },
  sendAt: { type: Date, required: true },
  sentAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.OneTimeReminder || model('OneTimeReminder', oneTimeReminderSchema);
