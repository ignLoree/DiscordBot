const mongoose = require("mongoose");
const { Schema, model } = mongoose;
const DisboardBumpSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  lastBumpAt: { type: Date, required: true },
  lastBumpUserId: { type: String, default: null },
  reminderSentAt: { type: Date, default: null },
});
module.exports =
  mongoose.models.DisboardBump || model("DisboardBump", DisboardBumpSchema);