const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "modstats",
  allowEmptyArgs: true,
  async execute(message, args, client) {
    return executeDynoModerationCommand("modstats", message, args, client);
  },
};
