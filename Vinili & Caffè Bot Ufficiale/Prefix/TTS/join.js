const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { joinTtsChannel } = require("../../Services/TTS/ttsService");

module.exports = {
  name: "join",
  allowEmptyArgs: true,
  async execute(message) {
    await message.channel.sendTyping();
    const voiceChannel = message.member?.voice?.channel;

    if (!voiceChannel) {
      const warn = await safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Devi essere in un canale vocale per usare il TTS.",
      );
      if (warn?.delete) setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }

    if (!voiceChannel.joinable) {
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Non ho i permessi per entrare in quel canale vocale.",
      );
    }

    const result = await joinTtsChannel(voiceChannel);
    if (!result.ok && result.reason === "locked") return;

    return safeMessageReply(
      message,
      `<:vegacheckmark:1443666279058772028> TTS attivo in ${voiceChannel}.`,
    );
  },
};