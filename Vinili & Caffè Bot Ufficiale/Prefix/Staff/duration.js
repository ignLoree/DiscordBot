const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "duration",
  async execute(message, args, client) {
    return executeDynoModerationCommand("duration", message, args, client);
  },
};
