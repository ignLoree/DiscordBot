const { model, Schema } = require('mongoose');
let lastFmUserSchema = new Schema({
  discordId: { type: String, required: true, unique: true },
  lastFmUsername: { type: String, required: true },
  privacyGlobal: { type: Boolean, default: true },
  fmMode: { type: String, default: "default" },
  responseMode: { type: String, default: "embed" },
  localization: {
    timezone: { type: String, default: "UTC" },
    numberFormat: { type: String, default: "standard" }
  },
  lastFmToken: { type: String, default: null },
  lastFmTokenCreatedAt: { type: Date, default: null },
  lastFmSessionKey: { type: String, default: null }
});
module.exports = model('LastFmUser', lastFmUserSchema);
