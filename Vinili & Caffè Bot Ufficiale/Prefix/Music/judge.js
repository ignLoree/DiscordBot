const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { buildJudgePayload } = require("../../Utils/Music/lastfmJudge");
const { extractTargetUserWithLastfm, extractPeriod } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const PERIOD_KEYS = new Set(["7day", "1month", "3month", "6month", "12month", "overall", "week", "month", "quarter", "half", "year", "all"]);
const MODE_KEYS = new Map([
  ["roast", "roast"],
  ["compliment", "compliment"],
  ["neutro", "neutral"],
  ["neutral", "neutral"]
]);
module.exports = {
  skipPrefix: true,
  name: "judge",
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, args: cleanedArgs, lastfm } = extractTargetUserWithLastfm(message, args);
    let mode = "neutral";
    if (cleanedArgs.length && MODE_KEYS.has(cleanedArgs[0].toLowerCase())) {
      mode = MODE_KEYS.get(cleanedArgs[0].toLowerCase());
      cleanedArgs.shift();
    }
    const periodArg = cleanedArgs.find(arg => PERIOD_KEYS.has(arg.toLowerCase()));
    const period = extractPeriod(periodArg || "7day");
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;
    const member = message.guild?.members.cache.get(target.id);
    const displayName = member?.displayName || target.username;
    try {
      const payload = await buildJudgePayload({
        lastFmUsername: user.lastFmUsername,
        displayName,
        period,
        mode,
        numberFormat: user.localization?.numberFormat
      });
      if (payload.error) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(payload.error)
          ]
        });
      }
      return safeChannelSend(message.channel, { embeds: [payload.embed] });
    } catch (error) {
   if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Errore durante il giudizio del gusto musicale.")
        ]
      });
    }
  }
};


