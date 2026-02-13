const mongoose = require('mongoose');
const afkSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    originalName: String,
});

afkSchema.index({ guildId: 1, userId: 1 }, { unique: true });
module.exports = mongoose.models.AFK || mongoose.model('AFK', afkSchema);
