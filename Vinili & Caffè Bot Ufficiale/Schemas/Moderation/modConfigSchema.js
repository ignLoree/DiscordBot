const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const ModConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  logChannelId: { type: String, default: null },
  dmOnAction: { type: Boolean, default: true },
  caseCounter: { type: Number, default: 0 },
  exemptRoles: { type: [String], default: [] },
  exemptChannels: { type: [String], default: [] }
}, { timestamps: true });
module.exports = mongoose.models.mod_config || model('mod_config', ModConfigSchema);
