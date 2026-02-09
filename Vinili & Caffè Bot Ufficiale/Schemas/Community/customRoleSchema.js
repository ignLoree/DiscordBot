const { Schema, model, models } = require('mongoose');

const customRoleSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    roleId: { type: String, required: true },
    customVocEmoji: { type: String, default: null }
  },
  {
    timestamps: true
  }
);

customRoleSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = models.CustomRole || model('CustomRole', customRoleSchema);

