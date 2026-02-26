const { dispatchPrefixMessage } = require("../Utils/Prefix/prefixDispatcher");
const IDs = require("../Utils/Config/ids");
const { handleTtsMessage } = require("../Services/TTS/ttsService");

const ALLOWED_GUILD_IDS = new Set(
  [IDs.guilds?.main, IDs.guilds?.test].filter(Boolean).map((id) => String(id)),
);

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (
      message.guild &&
      ALLOWED_GUILD_IDS.size &&
      !ALLOWED_GUILD_IDS.has(String(message.guild.id))
    ) {
      return;
    }
    try {
      const safePrefix = String(client?.config?.prefix || "-").trim() || "-";
      await handleTtsMessage(message, client, safePrefix);
    } catch (error) {
      global.logger?.error?.("[Bot Test][TTS ERROR]", error);
    }
    await dispatchPrefixMessage(message, client);
  },
};