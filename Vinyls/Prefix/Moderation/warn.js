const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "warn",
  async execute(message, args, client) {
    return executeDynoModerationCommand("warn", message, args, client);
  },
};