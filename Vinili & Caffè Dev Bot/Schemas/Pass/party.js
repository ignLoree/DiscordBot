const mongoose = require('mongoose');
const PartySchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  seasonId: { type: String, required: true },
  partyId: { type: String, required: true },
  ownerId: { type: String, required: true },
  goal: { type: String, required: true },
  members: { type: [String], default: [] },
  maxMembers: { type: Number, default: 5 },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});
PartySchema.index({ guildId: 1, seasonId: 1, partyId: 1 }, { unique: true });
module.exports.Party = mongoose.models.Party || mongoose.model('Party', PartySchema);