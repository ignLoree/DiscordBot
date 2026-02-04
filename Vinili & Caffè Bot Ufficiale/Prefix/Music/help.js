const { safeChannelSend } = require('../../Utils/Moderation/message');
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { buildOverviewEmbed, buildHelpComponents } = require("../../Utils/Help/prefixHelpView");

module.exports = {
  skipPrefix: false,
  name: "help",
  aliases: ["commands"],
  async execute(message, args, client) {
    await message.channel.sendTyping();
    const config2 = client?.config2 || {};
    const prefixes = {
      music: config2.musicPrefix || "."
    };

    const member = message.guild?.members.cache.get(message.author.id);
    const displayName = member?.displayName || message.author.username;

    const lastFmUser = await LastFmUser.findOne({ discordId: message.author.id });
    const lastFmUsername = lastFmUser?.lastFmUsername && lastFmUser.lastFmUsername !== "pending"
      ? lastFmUser.lastFmUsername
      : null;

    const color = config2.embedColor || "#6f4e37";
    const embed = buildOverviewEmbed({ color, prefixes, lastFmUsername });
    const components = buildHelpComponents({
      selectedValue: "general",
      selectedLabel: "General",
      userId: message.author.id
    });

    const sent = await safeChannelSend(message.channel, { embeds: [embed], components });
    if (!message.client.prefixHelpStates) {
      message.client.prefixHelpStates = new Map();
    }
    message.client.prefixHelpStates.set(sent.id, {
      userId: message.author.id,
      displayName,
      prefixes,
      color,
      lastFmUsername,
      commandAliases: getCommandAliases(client),
      selectedTrackCommand: null,
      selectedCategory: "general",
      expiresAt: Date.now() + 30 * 60 * 1000
    });
  }
};

function getCommandAliases(client) {
  const size = client?.pcommands?.size || 0;
  const cached = client._prefixMusicAliasesCache;
  if (cached && cached.size === size && cached.aliases) return cached.aliases;
  const commandAliases = {};
  for (const command of client.pcommands.values()) {
    if (!command?.name || String(command.folder || "").toLowerCase() !== "music") continue;
    commandAliases[command.name] = Array.isArray(command.aliases) ? command.aliases : [];
  }
  client._prefixMusicAliasesCache = { aliases: commandAliases, size };
  return commandAliases;
}



