const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, lastFmRequest, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm, extractPeriod } = require("../../Utils/Music/lastfmPrefix");
const { getTopTracks, sumTopTracksPlaycount } = require("../../Utils/Music/lastfmStats");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const PERIOD_DAYS = {
  "7day": 7,
  "1month": 30,
  "3month": 90,
  "6month": 180,
  "12month": 365
};
module.exports = {
  skipPrefix: true,
  name: "plays",
  aliases: ["p", "scrobbles"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, args);
    const period = extractPeriod(filteredArgs[0] || "overall");
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;
    const member = message.guild?.members.cache.get(target.id);
    const displayName = member?.displayName || target.username;
    try {
      let total = 0;
      let footer = "";
      if (period === "overall") {
        const info = await lastFmRequest("user.getinfo", { user: user.lastFmUsername });
        total = Number(info?.user?.playcount || 0);
      } else {
        const topTracks = await getTopTracks(user.lastFmUsername, period, 200);
        total = sumTopTracksPlaycount(topTracks);
        footer = "Somma top 200 del periodo";
      }
      const perDay = PERIOD_DAYS[period] ? Math.round(total / PERIOD_DAYS[period]) : null;
      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setAuthor({ name: `Plays - ${displayName}`, iconURL: target.displayAvatarURL() })
        .setDescription(`**${formatNumber(total, user.localization?.numberFormat)}** plays`)
        .addFields(
          perDay ? { name: "Media giornaliera", value: `${formatNumber(perDay, user.localization?.numberFormat)} plays/giorno`, inline: true } : { name: "Periodo", value: "Alltime", inline: true }
        );
      if (footer) embed.setFooter({ text: footer });
      return safeChannelSend(message.channel, { embeds: [embed] });
    } catch (error) {
   if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Errore durante il calcolo dei plays.")
        ]
      });
    }
  }
};


