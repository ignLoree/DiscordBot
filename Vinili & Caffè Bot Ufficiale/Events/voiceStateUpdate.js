const { leaveTtsGuild } = require("../Services/TTS/ttsService");
const {
  handleVoiceActivity,
} = require("../Services/Community/activityService");

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState, client) {
    try {
      await handleVoiceActivity(oldState, newState);
    } catch (error) {
      if (client?.logs?.error) {
        client.logs.error("[ACTIVITY VOICE ERROR]", error);
      } else {
        global.logger.error("[ACTIVITY VOICE ERROR]", error);
      }
    }
    if (client?.config?.tts?.stayConnected) return;
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    if (
      oldState.id === client.user.id &&
      oldState.channelId &&
      !newState.channelId
    ) {
      await leaveTtsGuild(guild.id, client);
      return;
    }
    const botMember =
      guild.members.me || guild.members.cache.get(client.user.id);
    const botChannel = botMember?.voice?.channel;
    if (!botChannel) return;
    const humans = botChannel.members.filter((m) => !m.user.bot);
    if (humans.size === 0) {
      await leaveTtsGuild(guild.id, client);
    }
  },
};
