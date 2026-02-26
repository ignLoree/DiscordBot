const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "delwarn",
  async execute(message, args, client) {
    return executeDynoModerationCommand("delwarn", message, args, client);
  },
};