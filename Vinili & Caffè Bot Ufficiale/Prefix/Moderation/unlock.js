const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "unlock",
  allowEmptyArgs: true,
  async execute(message, args, client) {
    return executeDynoModerationCommand("unlock", message, args, client);
  },
};