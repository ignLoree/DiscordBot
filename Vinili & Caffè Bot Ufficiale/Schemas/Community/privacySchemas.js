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

const quotePrivacySchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    blocked: { type: Boolean, default: false }
  },
  { timestamps: true }
);
quotePrivacySchema.index({ guildId: 1, userId: 1 }, { unique: true });

const AvatarPrivacy = mongoose.models.AvatarPrivacy || mongoose.model('AvatarPrivacy', avatarPrivacySchema);
const BannerPrivacy = mongoose.models.BannerPrivacy || mongoose.model('BannerPrivacy', bannerPrivacySchema);
const QuotePrivacy = mongoose.models.QuotePrivacy || mongoose.model('QuotePrivacy', quotePrivacySchema);

module.exports = { AvatarPrivacy, BannerPrivacy, QuotePrivacy };
