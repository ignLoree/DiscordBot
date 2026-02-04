const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { DEFAULT_EMBED_COLOR } = require("../../Utils/Music/lastfm");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
module.exports = {
  skipPrefix: false,
  name: "remove",
  async execute(message) {
    await message.channel.sendTyping();
    await LastFmUser.deleteOne({ discordId: message.author.id });
    const embed = new EmbedBuilder()
      .setColor(DEFAULT_EMBED_COLOR)
      .setDescription("Account Last.fm rimosso dal database.");
    return safeChannelSend(message.channel, { embeds: [embed] });
  }
};


