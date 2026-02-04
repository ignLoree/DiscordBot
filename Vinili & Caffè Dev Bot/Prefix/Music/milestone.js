const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");
const { DEFAULT_EMBED_COLOR, lastFmRequest, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm } = require("../../Utils/Music/lastfmPrefix");
const { getRecentTracks, calculateAverageDailyPlays } = require("../../Utils/Music/lastfmStats");
const { parseGoalAmount, getNextMilestone } = require("../../Utils/Music/lastfmGoals");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");

module.exports = {
  skipPrefix: true,
  name: "milestone",
  aliases: ["ms"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, args);
    const goalInput = filteredArgs[0];
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;
    const member = message.guild?.members.cache.get(target.id);
    const displayName = member?.displayName || target.username;
    try {
      const info = await lastFmRequest("user.getinfo", { user: user.lastFmUsername });
      const total = Number(info?.user?.playcount || 0);
      const goal = parseGoalAmount(goalInput) || getNextMilestone(total);
      const remaining = Math.max(0, goal - total);
      const recent = await getRecentTracks(user.lastFmUsername, 200);
      const avg = calculateAverageDailyPlays(recent) || 0;
      const daysLeft = avg > 0 ? Math.ceil(remaining / avg) : null;
      const eta = daysLeft ? `<t:${Math.floor((Date.now() + daysLeft * 86400000) / 1000)}:R>` : "n/d";
      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setAuthor({ name: `Milestone - ${displayName}`, iconURL: target.displayAvatarURL() })
        .setDescription(`Obiettivo: **${formatNumber(goal, user.localization?.numberFormat)}** plays`)
        .addFields(
          { name: "Play attuali", value: formatNumber(total, user.localization?.numberFormat), inline: true },
          { name: "Plays mancanti", value: formatNumber(remaining, user.localization?.numberFormat), inline: true },
          { name: "ETA", value: eta, inline: true }
        )
        .setFooter({ text: avg ? `Media: ${avg} plays/giorno` : "Media non disponibile" });
      return safeChannelSend(message.channel, { embeds: [embed] });
    } catch (error) {
   if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Errore durante il calcolo del milestone.")
        ]
      });
    }
  }
};


