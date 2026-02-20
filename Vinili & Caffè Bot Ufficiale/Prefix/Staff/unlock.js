const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "unlock",
  async execute(message, args, client) {
    return executeDynoModerationCommand("unlock", message, args, client);
  },
};
