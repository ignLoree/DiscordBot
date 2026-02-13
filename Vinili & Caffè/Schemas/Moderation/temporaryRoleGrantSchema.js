const mongoose = require('mongoose');
const { Schema, model, models } = mongoose;

const temporaryRoleGrantSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  roleId: { type: String, required: true, index: true },
  grantedBy: { type: String, default: null },
  removeOnExpire: { type: Boolean, default: true },
  expiresAt: { type: Date, required: true, index: true }
}, { timestamps: true });

temporaryRoleGrantSchema.index({ guildId: 1, userId: 1, roleId: 1 }, { unique: true });

module.exports = models.temporary_role_grant || model('temporary_role_grant', temporaryRoleGrantSchema);
