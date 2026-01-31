const { Schema, model } = require('mongoose');
const DisboardBumpSchema = new Schema({
    guildId: { type: String, required: true, unique: true },
    lastBumpAt: { type: Date, required: true },
    lastBumpUserId: { type: String, default: null },
    reminderSentAt: { type: Date, default: null }
});
module.exports = model('DisboardBump', DisboardBumpSchema);
