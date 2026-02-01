const mongoose = require('mongoose');
const { model, Schema } = mongoose;
let pollschema = new Schema({
    pollcount: {
        type: Number,
        default: 0
    },
    domanda: String,
    risposta1: String,
    risposta2: String,
    risposta3: String,
    risposta4: String,
    risposta5: String,
    risposta6: String,
    risposta7: String,
    risposta8: String,
    risposta9: String,
    messageId: { type: String, default: null }
})
module.exports = mongoose.models.pollschema || model('pollschema', pollschema);