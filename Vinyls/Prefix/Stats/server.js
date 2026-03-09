const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const serverButton = require("../../Buttons").server;

module.exports = {
  name: serverButton.name,
  allowEmptyArgs: true,
  SERVER_REFRESH_CUSTOM_ID_PREFIX: serverButton.SERVER_REFRESH_CUSTOM_ID_PREFIX,
  buildServerOverviewPayload: serverButton.buildServerOverviewPayload,

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const { lookbackDays } = serverButton.parseServerActivityArgs(args);
    const payload = await serverButton.buildServerOverviewPayload(message.guild, lookbackDays, message.author?.id);
    await safeMessageReply(message, { ...payload, allowedMentions: { repliedUser: false } });
  },
};
