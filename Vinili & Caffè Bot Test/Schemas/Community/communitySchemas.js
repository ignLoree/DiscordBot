const mongoose = require('mongoose');
const { Schema, model, models } = mongoose;

const verificationTenureSchema = new Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  verifiedAt: { type: Date, required: true },
  stage: { type: Number, default: 1 }
});
verificationTenureSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const personalityPanelSchema = new Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  personalityMessageId: { type: String, default: null },
  mentionsMessageId: { type: String, default: null },
  colorsMessageId: { type: String, default: null },
  plusColorsMessageId: { type: String, default: null },
  infoMessageId1: { type: String, default: null },
  infoMessageId2: { type: String, default: null },
  verifyInfoMessageId: { type: String, default: null },
  verifyPanelMessageId: { type: String, default: null },
  ticketInfoMessageId: { type: String, default: null },
  ticketPanelMessageId: { type: String, default: null },
  sponsorTicketPanelMessageId: { type: String, default: null }
});
personalityPanelSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

const VerificationTenure = models.VerificationTenure || model('VerificationTenure', verificationTenureSchema);
const PersonalityPanel = models.PersonalityPanel || model('PersonalityPanel', personalityPanelSchema);

module.exports = { VerificationTenure, PersonalityPanel };
