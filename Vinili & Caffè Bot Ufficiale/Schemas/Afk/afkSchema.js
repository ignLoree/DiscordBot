const mongoose = require('mongoose');
const afkSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
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
module.exports = mongoose.models.AFK || mongoose.model('AFK', afkSchema);
