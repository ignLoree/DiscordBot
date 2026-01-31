const { Schema, model } = require('mongoose');

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

module.exports = model('art_cards', artCardSchema);
