const { Schema, model } = require('mongoose');
const ModConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  logChannelId: { type: String, default: null },
  dmOnAction: { type: Boolean, default: true },
  caseCounter: { type: Number, default: 0 },
  exemptRoles: { type: [String], default: [] },
  exemptChannels: { type: [String], default: [] }
}, { timestamps: true });
module.exports = model('mod_config', ModConfigSchema);
