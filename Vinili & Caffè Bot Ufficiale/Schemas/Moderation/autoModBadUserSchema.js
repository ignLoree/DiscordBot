const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const autoModBadUserSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    totalTriggers: { type: Number, default: 0 },
    warnPoints: { type: Number, default: 0 },
    activeStrikes: { type: Number, default: 0 },
    lastTriggerAt: { type: Date, default: null, index: true },
    lastActionAt: { type: Date, default: null },
    lastGuildId: { type: String, default: null },
    lastHeat: { type: Number, default: 0 },
    lastAction: { type: String, default: null },
    activeStrikeReasons: { type: [String], default: [] },
    reasons: { type: [String], default: [] },
  },
  { timestamps: true },
);

module.exports =
  models.AutoModBadUser || model("AutoModBadUser", autoModBadUserSchema);
