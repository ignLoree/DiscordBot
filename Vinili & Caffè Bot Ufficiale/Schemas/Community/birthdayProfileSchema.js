const { model, models, Schema } = require("mongoose");

const birthdayProfileSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    day: { type: Number, required: true, min: 1, max: 31 },
    month: { type: Number, required: true, min: 1, max: 12 },
    birthYear: { type: Number, required: true, min: 1900, max: 3000 },
    showAge: { type: Boolean, default: true },
    lastCelebratedYear: { type: Number, default: null },
    registrationMessageId: { type: String, default: null },
    registrationChannelId: { type: String, default: null },
  },
  { timestamps: true },
);

birthdayProfileSchema.index({ guildId: 1, userId: 1 }, { unique: true });
birthdayProfileSchema.index({ guildId: 1, month: 1, day: 1 });

module.exports =
  models.BirthdayProfile || model("BirthdayProfile", birthdayProfileSchema);