const mongoose = require('mongoose');
const { Schema, model } = mongoose;
let suggestion = new Schema({
    ChannelID: String,
    GuildID: String,
    AuthorID: String,
    Msg: String,
    Upmembers: Array,
    Downmembers: Array,
    upvotes: Number,
    downvotes: Number,
    sID: String,
    count: { type: Number, default: 0 }
});
module.exports = mongoose.models.suggestion || model('suggestion', suggestion);