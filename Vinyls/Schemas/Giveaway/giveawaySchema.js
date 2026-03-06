const mongoose = require("mongoose");
const { model, Schema } = mongoose;

const giveawaySchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, index: true },
    messageId: { type: String, required: false, default: null },
    prize: { type: String, required: true },
    endAt: { type: Date, required: true, index: true },
    winnerCount: { type: Number, required: true, default: 1 },
    hostId: { type: String, required: true },
    hostTag: { type: String, default: "" },
    participants: { type: [String], default: [] },
    ended: { type: Boolean, default: false, index: true },
    winnerIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

giveawaySchema.index({ ended: 1, endAt: 1 });
giveawaySchema.index({ messageId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models?.Giveaway || model("Giveaway", giveawaySchema);