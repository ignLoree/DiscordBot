const { dispatchPrefixMessage } = require("../Utils/Prefix/prefixDispatcher");
const IDs = require("../Utils/Config/ids");
const { handleTtsMessage } = require("../Services/TTS/ttsService");

const ALLOWED_GUILD_ID = IDs.guilds?.test || null;

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (message.guild && ALLOWED_GUILD_ID && String(message.guild.id) !== String(ALLOWED_GUILD_ID)) {
      return;
    }
    try {
      await handleTtsMessage(message, client, "-");
    } catch (error) {
      global.logger?.error?.("[Bot Test][TTS ERROR]", error);
    }
    await dispatchPrefixMessage(message, client);
  },
};
