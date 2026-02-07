const mongoose = require('mongoose');

const bannerPrivacySchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    blocked: { type: Boolean, default: false },
    views: { type: Number, default: 0 }
  },
  { timestamps: true }
);

bannerPrivacySchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.BannerPrivacy || mongoose.model('BannerPrivacy', bannerPrivacySchema);
