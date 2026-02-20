const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "moderations",
  async execute(message, args, client) {
    return executeDynoModerationCommand("moderations", message, args, client);
  },
};
