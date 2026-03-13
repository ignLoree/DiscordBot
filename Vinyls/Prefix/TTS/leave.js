const { EmbedBuilder } = require("discord.js");
const { getVoiceConnection } = require("@discordjs/voice");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { leaveTtsGuild } = require("../../Services/TTS/ttsService");
const { forceDisconnectGuildVoice } = require("../../Services/Music/musicService");
const { clearVoiceSession } = require("../../Services/Voice/voiceSessionService");

module.exports = {
  name: "leave",
  allowEmptyArgs: true,
  async execute(message) {
    await message.channel.sendTyping();

    await forceDisconnectGuildVoice(message.client, message.guild.id).catch(() => null);
    const ttsVc = getVoiceConnection(String(message.guild.id));
    if (ttsVc) ttsVc.destroy();
    const me =
      message.guild.members.me ||
      (await message.guild.members.fetch(message.client.user.id).catch(() => null));
    if (me?.voice?.channel) {
      await me.voice.setChannel(null).catch(() => null);
    }

    const ttsResult = await leaveTtsGuild(message.guild.id, message.client);
    clearVoiceSession(message.guild.id);

    if (!ttsResult.ok && ttsResult.reason === "not_connected" && !wasInVoice) {
      const notConnectedEmbed = new EmbedBuilder()
      .setColor("#ED4245")
      .setDescription("Il bot non è connesso a nessun canale vocale.");
      return safeMessageReply(message, { embeds: [notConnectedEmbed] });
    }

    const okEmbed = new EmbedBuilder()
    .setColor("#ED4245")
    .setDescription("Grazie per aver usato il servizio.");
    return safeMessageReply(message, { embeds: [okEmbed] });
  },
};