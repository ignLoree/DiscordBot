const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { leaveTtsGuild } = require("../../Services/TTS/ttsService");
const { getPlayer } = require("../../Services/Music/musicService");

module.exports = {
  name: "leave",
  allowEmptyArgs: true,
  async execute(message) {
    await message.channel.sendTyping();
    let musicDisconnected = false;
    const player = await getPlayer(message.client).catch(() => null);
    if (player) {
      const queue = player.nodes.get(message.guild.id);
      if (queue) {
        queue.delete();
        musicDisconnected = true;
      }
    }

    const ttsResult = await leaveTtsGuild(message.guild.id, message.client);

    if (!ttsResult.ok && ttsResult.reason === "not_connected" && !musicDisconnected) {
      const notConnectedEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("Il bot non è connesso a nessun canale vocale.");
      return safeMessageReply(
        message,
        { embeds: [notConnectedEmbed] },
      );
    }
    const okEmbed = new EmbedBuilder()
      .setColor("#ED4245")
      .setDescription("Grazie per aver usato il servizio.");
    return safeMessageReply(
      message,
      { embeds: [okEmbed] },
    );
  },
};
