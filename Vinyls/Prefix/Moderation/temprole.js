const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "temprole",
  args: true,
  description: "Assign/unassign a role that persists for a limited time.",
  usage: "+temprole [user] [time] [role], [optional reason]",
  subcommands: ["add", "remove"],
  async execute(message, args, client) {
    return executeDynoModerationCommand("temprole", message, args, client);
  },
};