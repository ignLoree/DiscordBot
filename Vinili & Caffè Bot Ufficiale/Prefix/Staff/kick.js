const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "kick",
  async execute(message, args, client) {
    return executeDynoModerationCommand("kick", message, args, client);
  },
};
