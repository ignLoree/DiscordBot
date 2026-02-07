const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const PersonalityPanelSchema = new Schema({
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
  ticketPanelMessageId: { type: String, default: null }
});

PersonalityPanelSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

module.exports = mongoose.models.PersonalityPanel || model('PersonalityPanel', PersonalityPanelSchema);
