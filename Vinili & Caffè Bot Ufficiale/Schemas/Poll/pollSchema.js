const mongoose = require('mongoose');
const { model, Schema } = mongoose;
let pollschema = new Schema({
    guildId: { type: String, index: true, required: true },
    pollcount: {
        type: Number,
        default: 0
    },
    domanda: { type: String, default: null },
    risposta1: String,
    risposta2: String,
    risposta3: String,
    risposta4: String,
    risposta5: String,
    risposta6: String,
    risposta7: String,
    risposta8: String,
    risposta9: String,
    risposta10: String,
    messageId: { type: String, default: null }
});
pollschema.index({ guildId: 1, domanda: 1 });
pollschema.index({ guildId: 1, pollcount: 1 });
module.exports = mongoose.models.pollschema || model('pollschema', pollschema);
