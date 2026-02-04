const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { LASTFM_API_KEY } = require("../../Utils/Music/lastfm");
const { buildWelcomePayload, buildAlreadyConnectedPayload } = require("../../Utils/Music/lastfmLoginUi");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");

module.exports = {
  skipPrefix: false,
  name: "login",
  async execute(message) {
    await message.channel.sendTyping();
    let user = await LastFmUser.findOne({ discordId: message.author.id });

    if (!user) {
      user = await LastFmUser.create({
        discordId: message.author.id,
        lastFmUsername: "pending"
      });
    }

    if (!LASTFM_API_KEY) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> API key Last.fm non configurata. Contatta un high staff.")
        ]
      });
    }

    if (user.lastFmSessionKey && user.lastFmUsername && user.lastFmUsername !== "pending") {
      return safeChannelSend(message.channel, buildAlreadyConnectedPayload());
    }

    return safeChannelSend(message.channel, buildWelcomePayload());
  }
};


