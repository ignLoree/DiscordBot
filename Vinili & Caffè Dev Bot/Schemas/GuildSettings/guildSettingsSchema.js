const mongoose = require('mongoose');
const GuildSettingsSchema = new mongoose.Schema({
    Guild: {
        type: String,
        required: true,
        unique: true
    },
    Prefix: {
        type: String,
        default: "!"
    }
}, { timestamps: true });
module.exports = mongoose.model('GuildSettings', GuildSettingsSchema);
