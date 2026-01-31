const { EmbedBuilder } = require("discord.js");

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

async function handleLastfmError(message, error) {
  if (!error || error.name !== "LastFmRequestError") return false;
  const code = error.lastfmCode || error.lastfmMessage || "Failure";
  await message.channel.send({ embeds: [buildLastfmErrorEmbed(code)] });
  return true;
}

module.exports = { handleLastfmError, buildLastfmErrorEmbed };
