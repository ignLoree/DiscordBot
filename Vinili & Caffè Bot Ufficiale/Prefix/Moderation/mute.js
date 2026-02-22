const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "mute",
  async execute(message, args, client) {
    return executeDynoModerationCommand("mute", message, args, client);
  },
};
