const mongoose = require('mongoose');
const WalletSchema = new mongoose.Schema({
  guildId: { type: String, index: true, required: true },
  userId: { type: String, index: true, required: true },
  coffee: { type: Number, default: 0 },
  vinyl: { type: Number, default: 0 }
}, { timestamps: true });
WalletSchema.index({ guildId: 1, userId: 1 }, { unique: true });
module.exports.Wallet = mongoose.models.Wallet || mongoose.model('Wallet', WalletSchema);
