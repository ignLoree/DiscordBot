const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const StaffSchema = new Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    rolesHistory: [
        {
            oldRole: String,
            newRole: String,
            reason: String,
            date: { type: Date, default: Date.now }
        }
    ],
    idCount: { type: Number, default: 0 },
    warnCount: { type: Number, default: 0 },
    warnReasons: { type: [String], default: [] },
    positiveCount: { type: Number, default: 0 },
    negativeCount: { type: Number, default: 0 },
    positiveReasons: { type: [String], default: [] },
    negativeReasons: { type: [String], default: [] },
    valutazioniCount: { type: Number, default: 0 },
    partnerCount: { type: Number, default: 0 },
    partnerActions: [
        {
            action: String,
            partner: String,
            managerId: String,
            date: { type: Date, default: Date.now }
        }
    ],
    pauses: [
        {
            dataRichiesta: String,
            dataRitorno: String,
            motivazione: String,
            giorniUsati: { type: Number, default: 0 },
            giorniAggiuntivi: { type: Number, default: 0 },
            ruolo: String,
            stafferInPausa: { type: Number, default: 0 },
            status: { type: String, default: 'pending' }
        }
    ]
});
module.exports = mongoose.models.Staff || model('Staff', StaffSchema);