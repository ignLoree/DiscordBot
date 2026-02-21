const securityCommand = require("./security");

module.exports = {
  name: "status",
  aliases: ["health"],

  async execute(message, args = []) {
    return securityCommand.execute(message, ["health", ...args]);
  },
};
