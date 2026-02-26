const { Schema, model, models } = require("mongoose");

const rolePersistSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    roleId: { type: String, required: true, index: true },
    setBy: { type: String, default: null },
    reason: { type: String, default: "Nessun motivo fornito" },
  },
  { timestamps: true },
);

rolePersistSchema.index({ guildId: 1, userId: 1, roleId: 1 }, { unique: true });

module.exports =
  models.role_persist || model("role_persist", rolePersistSchema);