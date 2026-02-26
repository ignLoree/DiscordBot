const mongoose = require("mongoose");
const { model, Schema } = mongoose;
let countschema = new Schema({
  Guild: String,
  Channel: String,
  Count: Number,
  LastUser: String,
});
module.exports =
  mongoose.models.countschema || model("countschema", countschema);