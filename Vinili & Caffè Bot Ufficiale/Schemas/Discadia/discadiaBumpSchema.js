const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const DiscadiaBumpSchema = new Schema({
    guildId: { type: String, required: true, unique: true },
    lastBumpAt: { type: Date, required: true },
    lastBumpUserId: { type: String, default: null },
    reminderSentAt: { type: Date, default: null }
});

module.exports = mongoose.models.DiscadiaBump || model('DiscadiaBump', DiscadiaBumpSchema);
