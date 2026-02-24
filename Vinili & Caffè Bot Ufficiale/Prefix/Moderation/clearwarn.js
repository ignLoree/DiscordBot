const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "clearwarn",
  async execute(message, args, client) {
    return executeDynoModerationCommand("clearwarn", message, args, client);
  },
};
