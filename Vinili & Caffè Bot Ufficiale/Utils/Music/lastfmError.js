const { EmbedBuilder } = require("discord.js");
const { FMBOT_COLORS } = require("./fmbotStyle");

function buildLastfmErrorEmbed(code) {
  const errorCode = code || "Failure";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Problem while contacting Last.fm")
    .setDescription(
      "Can't retrieve data because Last.fm returned an error. Please try again later.\n" +
      "Please note that Vinili & Caffè isn't affiliated with Last.fm.\n\n"
    )
    .setFooter({ text:`Last.fm error code: ${errorCode}`})
}

function buildArtistNotFoundEmbed(query) {
  const label = String(query || "").trim() || "that artist";
  return new EmbedBuilder()
    .setColor(FMBOT_COLORS.lastfmRed)
    .setDescription(`Last.fm did not return a result for ${label}.`);
}

function buildAlbumNotFoundEmbed(query) {
  const label = String(query || "").trim() || "that album";
  return new EmbedBuilder()
    .setColor(FMBOT_COLORS.lastfmRed)
    .setDescription(`Last.fm did not return a result for ${label}.`);
}

function buildTrackNotFoundEmbed(query) {
  const label = String(query || "").trim() || "that track";
  return new EmbedBuilder()
    .setColor(FMBOT_COLORS.lastfmRed)
    .setDescription(`Last.fm did not return a result for ${label}.`);
}

async function sendArtistNotFound(message, query) {
  await message.channel.send({ embeds: [buildArtistNotFoundEmbed(query)] });
  return true;
}

async function sendAlbumNotFound(message, query) {
  await message.channel.send({ embeds: [buildAlbumNotFoundEmbed(query)] });
  return true;
}

async function sendTrackNotFound(message, query) {
  await message.channel.send({ embeds: [buildTrackNotFoundEmbed(query)] });
  return true;
}

async function handleLastfmError(message, error) {
  if (!error || error.name !== "LastFmRequestError") return false;
  const code = error.lastfmCode || error.lastfmMessage || "Failure";
  await message.channel.send({ embeds: [buildLastfmErrorEmbed(code)] });
  return true;
}

module.exports = {
  handleLastfmError,
  buildLastfmErrorEmbed,
  buildArtistNotFoundEmbed,
  buildAlbumNotFoundEmbed,
  buildTrackNotFoundEmbed,
  sendArtistNotFound,
  sendAlbumNotFound,
  sendTrackNotFound
};
