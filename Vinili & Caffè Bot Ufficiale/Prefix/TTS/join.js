const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { joinTtsChannel } = require("../../Services/TTS/ttsService");
const { setVoiceSession, getVoiceSession } = require("../../Services/Voice/voiceSessionService");

module.exports = {
  name: "join",
  allowEmptyArgs: true,
  async execute(message) {
    await message.channel.sendTyping();
    const voiceChannel = message.member?.voice?.channel;

    if (!voiceChannel) {
      const warnEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("Devi essere in un canale vocale.");
      const warn = await safeMessageReply(
        message,
        { embeds: [warnEmbed] },
      );
      if (warn?.delete) setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }

    if (!voiceChannel.joinable) {
      const noPermEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("Non ho i permessi per entrare in quel canale vocale.");
      return safeMessageReply(
        message,
        { embeds: [noPermEmbed] },
      );
    }

    const activeSession = getVoiceSession(message.guild?.id);
    const botVoiceChannel = message.guild?.members?.me?.voice?.channel || null;
    if (
      activeSession?.mode === "music" &&
      botVoiceChannel &&
      botVoiceChannel.id !== voiceChannel.id
    ) {
      const inUseEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription(
          `You already own a session in ${botVoiceChannel}, use the join command if you want it here instead!`,
        );
      return safeMessageReply(message, { embeds: [inUseEmbed] });
    }

    const ttsResult = await joinTtsChannel(voiceChannel);
    if (!ttsResult.ok && ttsResult.reason === "locked") return;
    setVoiceSession(message.guild?.id, {
      mode: "tts",
      channelId: voiceChannel.id,
    });

    const okEmbed = new EmbedBuilder()
      .setColor("#57F287")
      .setDescription("Connesso al canale vocale.");
    return safeMessageReply(
      message,
      { embeds: [okEmbed] },
    );
  },
};