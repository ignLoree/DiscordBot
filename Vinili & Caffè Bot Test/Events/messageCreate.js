const { dispatchPrefixMessage } = require("../Utils/Prefix/prefixDispatcher");
const IDs = require("../Utils/Config/ids");

const ALLOWED_GUILD_ID = IDs.guilds?.test || null;

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (message.guild && ALLOWED_GUILD_ID && String(message.guild.id) !== String(ALLOWED_GUILD_ID)) {
      return;
    }
    await dispatchPrefixMessage(message, client);
  },
};
