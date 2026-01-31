const { EmbedBuilder } = require("discord.js");
const { extractPeriod } = require("../../Utils/Music/lastfmPrefix");
const { buildFeaturedPayload } = require("../../Utils/Music/lastfmFeatured");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const PERIOD_KEYS = new Set(["7day", "1month", "3month", "6month", "12month", "overall", "week", "month", "quarter", "half", "year", "all"]);

module.exports = {
  skipPrefix: true,
  name: "featured",
  async execute(message, args) {
    await message.channel.sendTyping();
    const scopeArg = args.find(arg => ["server", "global"].includes(arg.toLowerCase()));
    const scope = scopeArg || (message.guild ? "server" : "global");
    const periodArg = args.find(arg => PERIOD_KEYS.has(arg.toLowerCase()));
    const period = extractPeriod(periodArg || "7day");
    try {
      const payload = await buildFeaturedPayload({
        scope,
        period,
        guild: message.guild || null
      });
      if (payload.error) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(payload.error)
          ]
        });
      }
      return message.channel.send({ embeds: [payload.embed] });
    } catch (error) {
   if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Errore durante il recupero del featured.")
        ]
      });
    }
  }
};
