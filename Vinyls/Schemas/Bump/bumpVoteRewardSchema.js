"use strict";

const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const bumpVoteRewardSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    source: { type: String, required: true, enum: ["disboard", "discadia_bump", "discadia_vote"] },
    lastActionAt: { type: Date, required: true },
    currentStreak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    totalExpAwarded: { type: Number, default: 0 },
  },
  { timestamps: true },
);

bumpVoteRewardSchema.index({ guildId: 1, userId: 1, source: 1 }, { unique: true });

const BumpVoteReward =
  mongoose.models.BumpVoteReward || model("BumpVoteReward", bumpVoteRewardSchema);

module.exports = BumpVoteReward;
