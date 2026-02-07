const mongoose = require('mongoose');

const avatarPrivacySchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    blocked: { type: Boolean, default: false },
    views: { type: Number, default: 0 }
  },
  { timestamps: true }
);

avatarPrivacySchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.AvatarPrivacy || mongoose.model('AvatarPrivacy', avatarPrivacySchema);
