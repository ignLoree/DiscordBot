const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const expUserSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    totalExp: { type: Number, default: 0 },
    weeklyExp: { type: Number, default: 0 },
    level: { type: Number, default: 0 },
    weeklyKey: { type: String, default: '' }
  },
  { timestamps: true }
);

expUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.ExpUser || model('ExpUser', expUserSchema);
