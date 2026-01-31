const { Schema, model } = require('mongoose');
const ModCaseSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  caseId: { type: Number, required: true, index: true },
  action: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  modId: { type: String, required: true },
  reason: { type: String, default: 'Nessun motivo fornito' },
  durationMs: { type: Number, default: null },
  expiresAt: { type: Date, default: null },
  active: { type: Boolean, default: true },
  context: {
    channelId: { type: String, default: null },
    messageId: { type: String, default: null }
  }
}, { timestamps: true });
ModCaseSchema.index({ guildId: 1, caseId: 1 }, { unique: true });
module.exports = model('mod_case', ModCaseSchema);
