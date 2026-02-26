const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const modConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },
    logChannelId: { type: String, default: null },
    dmOnAction: { type: Boolean, default: true },
    caseCounter: { type: Number, default: 0 },
    exemptRoles: { type: [String], default: [] },
    exemptChannels: { type: [String], default: [] },
  },
  { timestamps: true },
);

const modCaseSchema = new Schema(
  {
    guildId: { type: String, required: true },
    caseId: { type: Number, required: true, index: true },
    action: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    modId: { type: String, required: true },
    reason: { type: String, default: "Nessun motivo fornito" },
    durationMs: { type: Number, default: null },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    context: {
      channelId: { type: String, default: null },
      messageId: { type: String, default: null },
    },
    edits: {
      type: [
        {
          field: { type: String, required: true },
          previous: { type: String, default: "" },
          next: { type: String, default: "" },
          editedBy: { type: String, default: null },
          editedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    closedAt: { type: Date, default: null },
    closeReason: { type: String, default: null },
  },
  { timestamps: true },
);
modCaseSchema.index({ guildId: 1, caseId: 1 }, { unique: true });
modCaseSchema.index({ guildId: 1, userId: 1, createdAt: -1 });
modCaseSchema.index({ guildId: 1, modId: 1, createdAt: -1 });
modCaseSchema.index({ guildId: 1, action: 1, active: 1, expiresAt: 1 });

const ModConfig = models.mod_config || model("mod_config", modConfigSchema);
const ModCase = models.mod_case || model("mod_case", modCaseSchema);

module.exports = { ModConfig, ModCase };