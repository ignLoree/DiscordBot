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
});
module.exports = mongoose.model("Ticket", ticketSchema);
