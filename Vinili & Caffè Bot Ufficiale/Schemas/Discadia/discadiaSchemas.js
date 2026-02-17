const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const discadiaBumpSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  lastBumpAt: { type: Date, required: true },
  lastBumpUserId: { type: String, default: null },
  reminderSentAt: { type: Date, default: null },
});

const discadiaVoterSchema = new Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  lastVoteAt: { type: Date, required: true },
  lastRemindedAt: { type: Date, default: null },
  voteCount: { type: Number, default: 0 },
});
discadiaVoterSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const DiscadiaBump =
  models.DiscadiaBump || model("DiscadiaBump", discadiaBumpSchema);
const DiscadiaVoter =
  models.DiscadiaVoter || model("DiscadiaVoter", discadiaVoterSchema);

module.exports = { DiscadiaBump, DiscadiaVoter };
