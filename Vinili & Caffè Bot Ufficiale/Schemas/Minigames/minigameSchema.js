const mongoose = require("mongoose");

const minigameUserSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    totalExp: { type: Number, default: 0 },
  },
  { timestamps: true },
);
minigameUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const minigameStateSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    target: { type: String, default: null },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    rewardExp: { type: Number, default: 0 },
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    gameMessageId: { type: String, default: null },
    targetChannelId: { type: String, default: null },
    customId: { type: String, default: null },
    mainMessageId: { type: String, default: null },
  },
  { timestamps: true },
);
minigameStateSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

const minigameRotationSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true, index: true },
    dateKey: { type: String, required: true },
    queue: { type: [String], default: [] },
  },
  { timestamps: true },
);
minigameRotationSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

const MinigameUser =
  mongoose.models.MinigameUser ||
  mongoose.model("MinigameUser", minigameUserSchema);
const MinigameState =
  mongoose.models.MinigameState ||
  mongoose.model("MinigameState", minigameStateSchema);
const MinigameRotation =
  mongoose.models.MinigameRotation ||
  mongoose.model("MinigameRotation", minigameRotationSchema);

module.exports = { MinigameUser, MinigameState, MinigameRotation };
