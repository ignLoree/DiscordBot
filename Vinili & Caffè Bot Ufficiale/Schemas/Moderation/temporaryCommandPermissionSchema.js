const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const temporaryCommandPermissionSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    commandKey: { type: String, required: true, index: true },
    grantedBy: { type: String, default: null },
  },
  { timestamps: true },
);

temporaryCommandPermissionSchema.index(
  { guildId: 1, userId: 1, commandKey: 1 },
  { unique: true },
);
temporaryCommandPermissionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);

module.exports =
  models.temporary_command_permission ||
  model("temporary_command_permission", temporaryCommandPermissionSchema);
