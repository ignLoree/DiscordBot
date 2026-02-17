const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const QuoteCountSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
});

module.exports =
  mongoose.models.QuoteCount || model("QuoteCount", QuoteCountSchema);
