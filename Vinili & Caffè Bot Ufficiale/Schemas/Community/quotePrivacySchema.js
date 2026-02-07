const mongoose = require('mongoose');

const quotePrivacySchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    blocked: { type: Boolean, default: false }
  },
  { timestamps: true }
);

quotePrivacySchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.QuotePrivacy || mongoose.model('QuotePrivacy', quotePrivacySchema);
