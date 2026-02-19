const { Events } = require("discord.js");
const { logCommandUsage } = require("../Utils/Logging/commandUsageLogger");
const IDs = require("../Utils/Config/ids");

const COMMAND_LOG_CHANNEL_ID = IDs.channels.commandLogChannel;

function isCommandInteraction(interaction) {
  return (
    interaction?.isChatInputCommand?.() ||
    interaction?.isMessageContextMenuCommand?.() ||
    interaction?.isUserContextMenuCommand?.()
  );
}

function getCommandContent(interaction) {
  if (interaction?.isChatInputCommand?.()) return `${interaction}`;
  if (interaction?.isMessageContextMenuCommand?.())
    return `Context (messaggio): ${interaction.commandName}`;
  if (interaction?.isUserContextMenuCommand?.())
    return `Context (utente): ${interaction.commandName}`;
  return interaction?.commandName || "unknown";
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction) return;
    if (!isCommandInteraction(interaction)) return;

    const resolvedClient = client || interaction.client || null;
    if (!resolvedClient?.channels) return;

    try {
      const user = interaction.user;
      if (!user) return;

      await logCommandUsage(resolvedClient, {
        channelId: COMMAND_LOG_CHANNEL_ID,
        serverName: interaction.guild?.name || "DM",
        user: user.tag || user.username || "unknown",
        userId: user.id || "unknown",
        content: getCommandContent(interaction),
        userAvatarUrl: user.displayAvatarURL?.({ size: 128 }),
      });
    } catch (error) {
      global.logger?.error?.(
        "[interactionCreateCommandLogging] failed:",
        error,
      );
    }
  },
};
