const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const voteRoleSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

voteRoleSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.VoteRole || model('VoteRole', voteRoleSchema);
