const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const artCardSchema = new Schema(
  {
    cardId: { type: String, required: true, unique: true, index: true },
    url: { type: String, required: true },
    source: { type: String, default: '' },
    artist: { type: String, default: '' },
    tags: { type: [String], default: [] },
    rarity: { type: String, default: 'common' },
    catchCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.models.art_cards || model('art_cards', artCardSchema);
