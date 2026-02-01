const mongoose = require('mongoose');
const GameStateSchema = new mongoose.Schema({
  guildId: { type: String, index: true, required: true },
  seasonId: { type: String, index: true, required: true },
  usedQuizIds: { type: [String], default: [] },
  usedMinigameIds: { type: [String], default: [] },
  usedExternalQuizHashes: { type: [String], default: [] }
}, { timestamps: true });
GameStateSchema.index({ guildId: 1, seasonId: 1 }, { unique: true });
module.exports.GameState = mongoose.models.GameState || mongoose.model('GameState', GameStateSchema);
