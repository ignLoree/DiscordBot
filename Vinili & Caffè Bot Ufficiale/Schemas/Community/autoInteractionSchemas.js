const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const autoResponderSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    trigger: { type: String, required: true },
    triggerLower: { type: String, required: true },
    response: { type: String, default: "" },
    reactions: { type: [String], default: [] },
    enabled: { type: Boolean, default: true },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);
autoResponderSchema.index({ guildId: 1, triggerLower: 1 }, { unique: true });

const mentionReactionSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    reactions: { type: [String], default: [] },
  },
  { timestamps: true },
);
mentionReactionSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const AutoResponder =
  models.AutoResponder || model("AutoResponder", autoResponderSchema);
const MentionReaction =
  models.MentionReaction || model("MentionReaction", mentionReactionSchema);

module.exports = {
  AutoResponder,
  MentionReaction,
};
