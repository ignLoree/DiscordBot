const mongoose = require('mongoose');
const NodeSchema = new mongoose.Schema({
  guildId: { type: String, index: true, required: true },
  seasonId: { type: String, index: true, required: true },
  id: { type: String, required: true },
  zone: { type: Number, required: true },
  type: { type: String, enum: ['quest', 'choice', 'raid', 'story', 'craft'], required: true },
  title: String,
  description: String,
  requirements: { type: Object, default: {} },
  cost: { type: Object, default: { energy: 0, tickets: 0 } },
  objective: { type: Object, default: {} },
  rewards: { type: Object, default: {} },
  pathTag: { type: String, enum: ['chaos', 'order', 'neutral'], default: 'neutral' }
}, { timestamps: true });
NodeSchema.index({ guildId: 1, seasonId: 1, id: 1 }, { unique: true });
module.exports.NodeModel = mongoose.models.Node || mongoose.model('Node', NodeSchema);