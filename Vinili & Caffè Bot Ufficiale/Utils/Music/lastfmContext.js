const { EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { DEFAULT_EMBED_COLOR } = require("./lastfm");

function buildMissingUserEmbed(target, requester) {
  const isSelf = target.id === requester.id;
  const subject = isSelf ? "il tuo username di Last.fm" : "lo username di Last.fm dell'utente specificato";
  return new EmbedBuilder()
    .setColor("Red")
    .setDescription(`<:vegax:1443934876440068179> Non ho trovato ${subject}, impostalo usando .login.`);
}

async function getLastFmUserForInteraction(interaction, targetUser) {
  const user = await LastFmUser.findOne({ discordId: targetUser.id });
  if (!user || !user.lastFmUsername || user.lastFmUsername === "pending") {
    await interaction.editReply({
      embeds: [buildMissingUserEmbed(targetUser, interaction.user)],
      flags: 1 << 6
    });
    return null;
  }
  return user;
}
async function getLastFmUserForMessage(message, targetUser) {
  const user = await LastFmUser.findOne({ discordId: targetUser.id });
  if (!user || !user.lastFmUsername || user.lastFmUsername === "pending") {
    await message.channel.send({
      embeds: [buildMissingUserEmbed(targetUser, message.author)]
    });
    return null;
  }
  return user;
}
function buildOverrideUser(lastFmUsername) {
  return {
    lastFmUsername,
    localization: { numberFormat: "standard" }
  };
}
async function getLastFmUserForInteractionOrUsername(interaction, targetUser, lastFmUsername) {
  if (lastFmUsername) {
    return buildOverrideUser(lastFmUsername);
  }
  return getLastFmUserForInteraction(interaction, targetUser);
}
async function getLastFmUserForMessageOrUsername(message, targetUser, lastFmUsername) {
  if (lastFmUsername) {
    return buildOverrideUser(lastFmUsername);
  }
  return getLastFmUserForMessage(message, targetUser);
}
function buildSimpleEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle(title)
    .setDescription(description);
}

module.exports = { getLastFmUserForInteraction, getLastFmUserForMessage, getLastFmUserForInteractionOrUsername, getLastFmUserForMessageOrUsername, buildSimpleEmbed };