const mongoose = require("mongoose");
const { Schema } = mongoose;

const SponsorMainLeaveSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    leftAt: { type: Date, required: true },
    kickAt: { type: Date, required: true },
    dmSent: { type: Boolean, default: false },
    dmFailed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

SponsorMainLeaveSchema.index(
  { kickAt: 1 },
  { expireAfterSeconds: 48 * 60 * 60 },
);

module.exports =
  mongoose.models.SponsorMainLeave ||
  mongoose.model("SponsorMainLeave", SponsorMainLeaveSchema);