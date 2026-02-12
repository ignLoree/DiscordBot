const { Events } = require('discord.js');
const { logCommandUsage } = require('../Utils/Logging/commandUsageLogger');
const IDs = require('../Utils/Config/ids');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction?.isChatInputCommand?.()) return;
    try {
      await logCommandUsage(client, {
        channelId: IDs.channels.serverBotLogs,
        serverName: interaction.guild?.name || 'DM',
        user: interaction.user.username,
        userId: interaction.user.id,
        content: `${interaction}`,
        userAvatarUrl: interaction.user.avatarURL({ dynamic: true })
      });
    } catch {
      client.logs.error('[SLASH_COMMAND_USED] Error while logging command usage. Check if you have the correct channel ID in your config.');
    }
  }
};
