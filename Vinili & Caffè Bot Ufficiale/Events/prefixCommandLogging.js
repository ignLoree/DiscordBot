const { Events } = require('discord.js');
const { logCommandUsage } = require('../Utils/Logging/commandUsageLogger');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (!message || message.author?.bot) return;
    const content = message.content || '';
    if (!content) return;
    const prefix = client.config.prefix;
    const musicPrefix = client.config.musicPrefix || prefix;
    const modPrefix = client.config.moderationPrefix || '?';
    if (!content.startsWith(prefix) && !content.startsWith(musicPrefix) && !content.startsWith(modPrefix)) return;
    try {
      await logCommandUsage(client, {
        channelId: client.config.prefixCommandLoggingChannel,
        serverName: message.guild?.name || 'DM',
        user: message.author.username,
        userId: message.author.id,
        content,
        userAvatarUrl: message.author.avatarURL({ dynamic: true })
      });
    } catch {
      client.logs.error('[PREFIX_COMMAND_USED] Error while logging command usage. Check if you have the correct channel ID in your config.');
    }
  }
};
