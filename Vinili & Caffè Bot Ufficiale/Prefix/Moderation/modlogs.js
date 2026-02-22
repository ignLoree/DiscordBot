const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "modlogs",
  allowEmptyArgs: true,
  async execute(message, args, client) {
    return executeDynoModerationCommand("modlogs", message, args, client);
  },
};
