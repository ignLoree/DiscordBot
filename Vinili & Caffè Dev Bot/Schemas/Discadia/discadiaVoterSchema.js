const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const DiscadiaVoterSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  lastVoteAt: { type: Date, required: true },
  lastRemindedAt: { type: Date, default: null },
  voteCount: { type: Number, default: 0 }
});

DiscadiaVoterSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.DiscadiaVoter || model('DiscadiaVoter', DiscadiaVoterSchema);
