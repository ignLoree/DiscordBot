const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "unmute",
  async execute(message, args, client) {
    return executeDynoModerationCommand("unmute", message, args, client);
  },
};