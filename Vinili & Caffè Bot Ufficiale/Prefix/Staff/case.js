const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "case",
  async execute(message, args, client) {
    return executeDynoModerationCommand("case", message, args, client);
  },
};
