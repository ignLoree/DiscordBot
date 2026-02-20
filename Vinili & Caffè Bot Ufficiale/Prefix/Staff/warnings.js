const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "warnings",
  async execute(message, args, client) {
    return executeDynoModerationCommand("warnings", message, args, client);
  },
};
