const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "modlogs",
  async execute(message, args, client) {
    return executeDynoModerationCommand("modlogs", message, args, client);
  },
};
