const { model, Schema } = require('mongoose');
let countschema = new Schema({
    Guild: String,
    Channel: String,
    Count: Number,
    LastUser: String,
})
module.exports = mongoose.models.countschema || model('countschema', countschema);