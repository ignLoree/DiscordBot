const mongoose = require("mongoose");
const ticketSchema = new mongoose.Schema({
    userId: String,
    channelId: String,
    ticketType: String,
    open: Boolean,
    claimedBy: String,
    createdAt: { type: Date, default: Date.now },
    transcript: String,
    messageId: String,
    descriptionPromptMessageId: String,
    descriptionSubmitted: { type: Boolean, default: false },
    descriptionText: String,
    descriptionSubmittedAt: Date,
    autoClosePromptSentAt: Date
});
module.exports = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
