const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const globalSettingsSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    expMultiplier: { type: Number, default: 2 }
  },
  { timestamps: true }
);

module.exports = mongoose.models.GlobalSettings || model('GlobalSettings', globalSettingsSchema);
