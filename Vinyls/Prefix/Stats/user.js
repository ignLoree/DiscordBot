const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const userButton = require("../../Buttons").user;

module.exports = {
  name: userButton.name,
  allowEmptyArgs: false,
  description: "Mostra le statistiche attività di un utente (mention, ID o username).",
  usage: "+user <@utente|id|username> [1d|7d|14d|21d|30d]",
  examples: ["+user @Utente", "+user 123456789012345678 30d", "+user NomeUtente 7d"],
  USER_REFRESH_CUSTOM_ID_PREFIX: userButton.USER_REFRESH_CUSTOM_ID_PREFIX,
  USER_PERIOD_OPEN_CUSTOM_ID_PREFIX: userButton.USER_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  USER_PERIOD_SET_CUSTOM_ID_PREFIX: userButton.USER_PERIOD_SET_CUSTOM_ID_PREFIX,
  USER_PERIOD_BACK_CUSTOM_ID_PREFIX: userButton.USER_PERIOD_BACK_CUSTOM_ID_PREFIX,
  buildUserOverviewPayload: userButton.buildUserOverviewPayload,
  buildUserComponents: userButton.buildUserComponents,

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const { targetId, lookbackDays } = await userButton.resolveUserTargetAndLookback(message, args);
    if (!targetId) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Usa: `+user <@utente|id|username> [1d|7d|14d|21d|30d]`",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const payload = await userButton.buildUserOverviewPayload(message.guild, targetId, lookbackDays, "main");
    if (Array.isArray(payload.components) && payload.components.length) {
      payload.components = userButton.buildUserComponents(message.author.id, targetId, lookbackDays, "main");
    }
    await safeMessageReply(message, { ...payload, allowedMentions: { repliedUser: false } });
  },
};