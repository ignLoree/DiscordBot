const mongoose = require('mongoose');
const { model, Schema } = mongoose;

const lastFmStreakSchema = new Schema({
  userId: { type: String, required: true, index: true },
  lastFmUsername: { type: String, required: true },
  trackKey: { type: String, required: true },
  startedAt: { type: Date, required: true },
  lastPlayedAt: { type: Date, required: true },
  artistName: { type: String, required: true },
  albumName: { type: String, required: true },
  trackName: { type: String, required: true },
  artistPlays: { type: Number, required: true },
  albumPlays: { type: Number, required: true },
  trackPlays: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

lastFmStreakSchema.index({ userId: 1, trackKey: 1, startedAt: 1 }, { unique: true });

module.exports = mongoose.models.LastFmStreak || model('LastFmStreak', lastFmStreakSchema);
