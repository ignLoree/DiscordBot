const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const VerificationTenureSchema = new Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  verifiedAt: { type: Date, required: true },
  stage: { type: Number, default: 1 }
});

VerificationTenureSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.VerificationTenure || model('VerificationTenure', VerificationTenureSchema);
