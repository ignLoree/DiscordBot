const { Events } = require('discord.js');
const { logCommandUsage } = require('../Utils/Logging/commandUsageLogger');
const IDs = require('../Utils/Config/ids');

function isCommandInteraction(interaction) {
  return interaction?.isChatInputCommand?.()
    || interaction?.isMessageContextMenuCommand?.()
    || interaction?.isUserContextMenuCommand?.();
}

function getCommandContent(interaction) {
  if (interaction?.isChatInputCommand?.()) return `${interaction}`;
  if (interaction?.isMessageContextMenuCommand?.()) return `Context (messaggio): ${interaction.commandName}`;
  if (interaction?.isUserContextMenuCommand?.()) return `Context (utente): ${interaction.commandName}`;
  return interaction?.commandName || 'unknown';
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!isCommandInteraction(interaction)) return;
    const channelId = IDs.channels.commandLogChannel || IDs.channels.serverBotLogs;
    try {
      await logCommandUsage(client, {
        channelId,
        serverName: interaction.guild?.name || 'DM',
        user: interaction.user.username,
        userId: interaction.user.id,
        content: getCommandContent(interaction),
        userAvatarUrl: interaction.user.avatarURL({ dynamic: true })
      });
    } catch {
      client.logs.error('[COMMAND_USED] Error while logging command usage. Check if you have the correct channel ID in your config.');
    }
  }
};
