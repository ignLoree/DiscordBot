const mongoose = require('mongoose');
const TransactionSchema = new mongoose.Schema({
  guildId: { type: String, index: true, required: true },
  seasonId: { type: String, index: true, required: true },
  userId: { type: String, index: true, required: true },
  type: { type: String, enum: ['grant', 'spend', 'penalty'], required: true },
  currency: { type: String, required: true },
  amount: { type: Number, required: true },
  reason: { type: String, default: '' }
}, { timestamps: true });
module.exports.Transaction = mongoose.model('Transaction', TransactionSchema);