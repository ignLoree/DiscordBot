const { Schema, model } = require('mongoose');
let ping = new Schema({
    GuildID: String,
    AuthorID: String,
    Msg: String,
});
module.exports = model('ping', ping);