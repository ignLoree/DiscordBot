const { lastFmRequest, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm } = require("../../Utils/Music/lastfmPrefix");
const { resolveArtistName } = require("../../Utils/Music/lastfmResolvers");
const { parseGoalAmount, getNextMilestone } = require("../../Utils/Music/lastfmGoals");
const { handleLastfmError, sendArtistNotFound } = require("../../Utils/Music/lastfmError");

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function getArtistPlaysInPeriod(lastFmUsername, artistName, from, to) {
  const chart = await lastFmRequest("user.getweeklyartistchart", {
    user: lastFmUsername,
    from,
    to
  });
  const artists = chart?.weeklyartistchart?.artist || [];
  const list = Array.isArray(artists) ? artists : [artists];
  const target = normalizeName(artistName);
  const match = list.find(item => normalizeName(item?.name || item?.["#text"] || item?.artist || "") === target);
  return Number(match?.playcount || 0);
}

function formatDecimal(value) {
  return Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function formatEtaDate(daysLeft) {
  const date = new Date(Date.now() + daysLeft * 86400000);
  return date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

module.exports = {
  skipPrefix: false,
  name: "artistpace",
  aliases: ["apace", "ap"],
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, args);
    const goalInput = filteredArgs[0];
    const artistQuery = filteredArgs.slice(goalInput ? 1 : 0).join(" ").trim();
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;

    const displayName = message.guild?.members.cache.get(target.id)?.displayName
      || target.username
      || user.lastFmUsername;

    try {
      const artistName = await resolveArtistName(user.lastFmUsername, artistQuery || null);
      if (!artistName) {
        return sendArtistNotFound(message, artistQuery);
      }

      const info = await lastFmRequest("artist.getinfo", {
        artist: artistName,
        username: user.lastFmUsername,
        autocorrect: 1
      });
      const total = Number(info?.artist?.stats?.userplaycount || 0);
      const goal = parseGoalAmount(goalInput) || getNextMilestone(total);
      const remaining = Math.max(0, goal - total);

      const now = Math.floor(Date.now() / 1000);
      const from = now - 30 * 24 * 60 * 60;
      const playsLast30 = await getArtistPlaysInPeriod(user.lastFmUsername, artistName, from, now);
      const avg = playsLast30 / 30;
      const daysLeft = avg > 0 ? Math.ceil(remaining / avg) : null;
      const eta = remaining <= 0 ? "oggi" : (daysLeft ? formatEtaDate(daysLeft) : "n/d");

      const mention = target?.id ? `<@${target.id}>` : displayName;
      const line1 = `${mention} My estimate is that you will reach **${formatNumber(goal, user.localization?.numberFormat)}** plays on **${artistName}** on **${eta}**.`;
      const line2 = `*Based on your average of ${formatDecimal(avg)} plays per day in the last 30 days — ${formatNumber(playsLast30, user.localization?.numberFormat)} plays in this time period — ${formatNumber(total, user.localization?.numberFormat)} alltime*`;

      return message.channel.send({ content: `${line1}\n${line2}` });
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        content: "<:vegax:1443934876440068179> Errore durante il calcolo del pace artista."
      });
    }
  }
};
