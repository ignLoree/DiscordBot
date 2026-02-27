const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { armTtsChannel } = require("../../Services/TTS/ttsService");
const { getPlayer } = require("../../Services/Music/musicService");

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

    const ttsResult = await armTtsChannel(voiceChannel);
    if (!ttsResult.ok && ttsResult.reason === "locked") return;

    const player = await getPlayer(message.client).catch(() => null);
    if (player) {
      const queue = player.nodes.create(message.guild, {
        metadata: { channel: message.channel },
        leaveOnEmpty: false,
        leaveOnEmptyCooldown: 0,
        leaveOnEnd: false,
        leaveOnEndCooldown: 0,
        selfDeaf: true,
        volume: 50,
      });
      queue.metadata = { ...(queue.metadata || {}), channel: message.channel };
      if (!queue.connection) {
        await queue.connect(voiceChannel).catch(() => null);
      }
    }

    const okEmbed = new EmbedBuilder()
      .setColor("#57F287")
      .setDescription("Connesso al canale vocale.");
    return safeMessageReply(
      message,
      { embeds: [okEmbed] },
    );
  },
};
