const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "reason",
  async execute(message, args, client) {
    return executeDynoModerationCommand("reason", message, args, client);
  },
};