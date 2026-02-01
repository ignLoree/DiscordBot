const mongoose = require('mongoose');
const { model, Schema } = mongoose;
let reaction = new Schema({
    Guild: String,
    Message: String,
    Emoji: String,
    Role: String
});
module.exports = mongoose.models.rrs || model('rrs', reaction)