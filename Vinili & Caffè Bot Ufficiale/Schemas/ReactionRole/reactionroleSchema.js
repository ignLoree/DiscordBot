const mongoose = require('mongoose');
const { model, Schema } = mongoose;
let reaction = new Schema({
    Guild: { type: String, required: true, index: true },
    Message: { type: String, required: true, index: true },
    Emoji: { type: String, required: true },
    Role: { type: String, required: true }
});
reaction.index({ Guild: 1, Message: 1, Emoji: 1 }, { unique: true });
module.exports = mongoose.models.rrs || model('rrs', reaction)
