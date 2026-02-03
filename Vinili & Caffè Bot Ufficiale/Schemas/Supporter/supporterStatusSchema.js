const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const SupporterStatusSchema = new Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    lastMessageId: { type: String, default: null },
    lastSentAt: { type: Date, default: null },
    hasLink: { type: Boolean, default: false }
});

SupporterStatusSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.SupporterStatus || model('SupporterStatus', SupporterStatusSchema);
