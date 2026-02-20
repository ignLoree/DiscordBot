const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "lock",
  async execute(message, args, client) {
    return executeDynoModerationCommand("lock", message, args, client);
  },
};
