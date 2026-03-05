const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "ban",
  async execute(message, args, client) {
    return executeDynoModerationCommand("ban", message, args, client);
  },
};