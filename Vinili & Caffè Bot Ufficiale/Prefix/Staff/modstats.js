const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "modstats",
  async execute(message, args, client) {
    return executeDynoModerationCommand("modstats", message, args, client);
  },
};
