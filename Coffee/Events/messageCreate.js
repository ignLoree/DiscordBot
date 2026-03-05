const { dispatchPrefixMessage } = require("../Utils/Prefix/prefixDispatcher");
const IDs = require("../Utils/Config/ids");
const { handleTtsMessage } = require("../Services/TTS/ttsService");
const { recordReminderActivity } = require("../Services/Community/chatReminderService");

const ALLOWED_GUILD_IDS = new Set([IDs.guilds ?. main,IDs.guilds ?. test].filter(Boolean).map((id)=>String(id)),);

const REMINDER_CHANNEL_ID = IDs.channels?.chat || null;

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
    if (!message.author?.bot && message.guild && REMINDER_CHANNEL_ID && String(message.channelId) === String(REMINDER_CHANNEL_ID)) {
      try {
        recordReminderActivity(message.channelId);
      } catch (error) {
        global.logger?.error?.("[REMINDER ACTIVITY ERROR]", error);
      }
    }
    try {
      const safePrefix = String(client?.config?.prefix || "-").trim() || "-";
      await handleTtsMessage(message, client, safePrefix);
    } catch (error) {
      global.logger?.error?.("[TTS ERROR]", error);
    }
    await dispatchPrefixMessage(message, client);
  },
};