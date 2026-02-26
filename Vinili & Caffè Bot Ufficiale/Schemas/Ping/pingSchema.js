const mongoose = require("mongoose");
const { Schema, model } = mongoose;
let ping = new Schema({
  GuildID: String,
  AuthorID: String,
  Msg: String,
});
module.exports = mongoose.models.ping || model("ping", ping);