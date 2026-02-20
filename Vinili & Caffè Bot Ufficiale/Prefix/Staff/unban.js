const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "unban",
  async execute(message, args, client) {
    return executeDynoModerationCommand("unban", message, args, client);
  },
};
