const mongoose = require("mongoose");
const { Schema, model } = mongoose;
let suggestion = new Schema({
  ChannelID: { type: String, required: true, index: true },
  GuildID: { type: String, required: true, index: true },
  AuthorID: { type: String, required: true, index: true },
  Msg: { type: String, required: true },
  Upmembers: { type: [String], default: [] },
  Downmembers: { type: [String], default: [] },
  upvotes: { type: Number, default: 0 },
  downvotes: { type: Number, default: 0 },
  sID: { type: String, required: true, index: true },
  count: { type: Number, default: 0 },
});
suggestion.index({ GuildID: 1, ChannelID: 1, sID: 1 }, { unique: true });
module.exports = mongoose.models.suggestion || model("suggestion", suggestion);