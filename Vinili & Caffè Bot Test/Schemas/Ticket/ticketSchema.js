const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    guildId: { type: String, default: null, index: true },
    userId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, unique: true, index: true },
    ticketType: { type: String, default: 'supporto' },
    open: { type: Boolean, required: true, default: true, index: true },
    claimedBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    transcript: { type: String, default: '' },
    messageId: { type: String, default: null },
    descriptionPromptMessageId: { type: String, default: null },
    descriptionSubmitted: { type: Boolean, default: false },
    descriptionText: { type: String, default: '' },
    descriptionSubmittedAt: { type: Date, default: null },
    autoClosePromptSentAt: { type: Date, default: null },
    closeReason: { type: String, default: null },
    closedAt: { type: Date, default: null }
});
ticketSchema.index({ guildId: 1, userId: 1, open: 1 });
ticketSchema.index({ userId: 1, open: 1 });

module.exports = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
