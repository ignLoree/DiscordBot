const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const meButton = require("../../Buttons").me;

module.exports = {
  name: meButton.name,
  allowEmptyArgs: true,
  ME_REFRESH_CUSTOM_ID_PREFIX: meButton.ME_REFRESH_CUSTOM_ID_PREFIX,
  ME_PERIOD_OPEN_CUSTOM_ID_PREFIX: meButton.ME_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  ME_PERIOD_SET_CUSTOM_ID_PREFIX: meButton.ME_PERIOD_SET_CUSTOM_ID_PREFIX,
  ME_PERIOD_BACK_CUSTOM_ID_PREFIX: meButton.ME_PERIOD_BACK_CUSTOM_ID_PREFIX,
  buildMeOverviewPayload: meButton.buildMeOverviewPayload,
  buildMeComponents: meButton.buildMeComponents,
  normalizeLookbackDays: meButton.normalizeLookbackDays,

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const { lookbackDays } = meButton.parseMyActivityArgs(args);
    const payload = await meButton.buildMeOverviewPayload(message.guild, message.author, message.member, lookbackDays, "main");
    await safeMessageReply(message, { ...payload, allowedMentions: { repliedUser: false } });
  },
};