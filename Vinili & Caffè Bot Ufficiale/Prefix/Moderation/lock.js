const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "lock",
  allowEmptyArgs: true,
  async execute(message, args, client) {
    return executeDynoModerationCommand("lock", message, args, client);
  },
};