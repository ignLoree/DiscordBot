const mongoose = require('mongoose');
const { Schema, model, models } = mongoose;

const mentionReactionSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    reactions: { type: [String], default: [] }
  },
  { timestamps: true }
);

mentionReactionSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = models.MentionReaction || model('MentionReaction', mentionReactionSchema);
