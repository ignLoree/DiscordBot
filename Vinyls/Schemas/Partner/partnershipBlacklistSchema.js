const mongoose = require("mongoose");
const { Schema } = mongoose;
const partnershipBlacklistSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    addedBy: { type: String, default: null },
    note: { type: String, default: "" },
    addedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);
module.exports =
  mongoose.models.PartnershipBlacklistGuild ||
  mongoose.model("PartnershipBlacklistGuild", partnershipBlacklistSchema);