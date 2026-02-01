const mongoose = require('mongoose');
const { model, Schema } = mongoose;
const crownHistorySchema = new Schema({
  discordId: { type: String, required: true },
  playcount: { type: Number, default: 0 },
  claimedAt: { type: Date, default: Date.now }
}, { _id: false });
const crownSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  artistKey: { type: String, required: true, index: true },
  artistName: { type: String, required: true },
  holderId: { type: String, required: true },
  playcount: { type: Number, default: 0 },
  claimedAt: { type: Date, default: Date.now },
  history: { type: [crownHistorySchema], default: [] }
});
crownSchema.index({ guildId: 1, artistKey: 1 }, { unique: true });
module.exports = mongoose.models.LastFmCrown || model('LastFmCrown', crownSchema);
