const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { leaveTtsGuild } = require("../../Services/TTS/ttsService");
const { destroyQueue, getQueue } = require("../../Services/Music/musicService");
const { clearVoiceSession } = require("../../Services/Voice/voiceSessionService");

module.exports = {
  name: "leave",
  allowEmptyArgs: true,
  async execute(message) {
    await message.channel.sendTyping();

    let musicDisconnected = false;
    if (getQueue(message.guild?.id)) {
      musicDisconnected = await destroyQueue(message.guild.id, { manual: true }).catch(() => false);
    }

    const ttsResult = await leaveTtsGuild(message.guild.id, message.client);
    clearVoiceSession(message.guild.id);

    if (!ttsResult.ok && ttsResult.reason === "not_connected" && !musicDisconnected) {
      const notConnectedEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("Il bot non e connesso a nessun canale vocale.");
      return safeMessageReply(message, { embeds: [notConnectedEmbed] });
    }

    const okEmbed = new EmbedBuilder()
      .setColor("#ED4245")
      .setDescription("Grazie per aver usato il servizio.");
    return safeMessageReply(message, { embeds: [okEmbed] });
  },
};