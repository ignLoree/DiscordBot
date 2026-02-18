const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const joinRaidSampleSchema = new Schema(
  {
    ts: { type: Number, required: true },
    userId: { type: String, required: true },
    createdAt: { type: Number, default: 0 },
    skeleton: { type: String, default: "" },
  },
  { _id: false },
);

const joinRaidFlaggedSchema = new Schema(
  {
    ts: { type: Number, required: true },
    userId: { type: String, required: true },
    reasons: { type: [String], default: [] },
  },
  { _id: false },
);

const joinRaidStateSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    raidUntil: { type: Number, default: 0 },
    samples: { type: [joinRaidSampleSchema], default: [] },
    flagged: { type: [joinRaidFlaggedSchema], default: [] },
    tempBans: {
      type: [
        new Schema(
          {
            userId: { type: String, required: true },
            unbanAt: { type: Number, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

module.exports =
  models.JoinRaidState || model("JoinRaidState", joinRaidStateSchema);
