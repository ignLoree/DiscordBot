const IDs = require("../Utils/Config/ids");
const { leaveTtsGuild } = require("../Services/TTS/ttsService");

const ALLOWED_GUILD_ID = IDs.guilds?.test || null;

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState, client) {
    const guild = newState?.guild || oldState?.guild;
    if (!guild) return;
    if (
      ALLOWED_GUILD_ID &&
      String(guild.id || "") !== String(ALLOWED_GUILD_ID)
    ) {
      return;
    }
    if (!client?.user?.id) return;
    if (client?.config?.tts?.stayConnected) return;

    if (
      oldState.id === client.user.id &&
      oldState.channelId &&
      !newState.channelId
    ) {
      await leaveTtsGuild(guild.id, client).catch((err) => {
        global.logger?.warn?.(
          "[voiceStateUpdate] leaveTtsGuild failed:",
          err?.message || err,
        );
      });
      return;
    }

    const botMember = guild.members.me || guild.members.cache.get(client.user.id);
    const botChannel = botMember?.voice?.channel;
    if (!botChannel) return;

    const humans = botChannel.members.filter((m) => !m.user.bot);
    if (humans.size === 0) {
      await leaveTtsGuild(guild.id, client).catch((err) => {
        global.logger?.warn?.(
          "[voiceStateUpdate] leaveTtsGuild failed:",
          err?.message || err,
        );
      });
    }
  },
};