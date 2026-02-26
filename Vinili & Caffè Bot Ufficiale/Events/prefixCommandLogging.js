const { Events } = require("discord.js");
const { logCommandUsage } = require("../Utils/Logging/commandUsageLogger");
const IDs = require("../Utils/Config/ids");

function getStandardPrefixes(client) {
  void client;
  return ["+"];
}

function getPrefixOverrideMap(client) {
  void client;
  return new Map();
}

function resolveCommandFromContent(message, client) {
  const content = String(message?.content || "");
  if (!content) return null;

  const overrideMap = getPrefixOverrideMap(client);
  let matchedOverridePrefix = null;
  for (const prefix of overrideMap.keys()) {
    if (!content.startsWith(prefix)) continue;
    if (
      !matchedOverridePrefix ||
      prefix.length > matchedOverridePrefix.length
    ) {
      matchedOverridePrefix = prefix;
    }
  }

  if (matchedOverridePrefix) {
    const raw = content.slice(matchedOverridePrefix.length).trim();
    const commandToken = String(raw.split(/\s+/)[0] || "").toLowerCase();
    if (!commandToken) return null;
    const resolved =
      overrideMap.get(matchedOverridePrefix)?.get(commandToken) || null;
    if (!resolved) return null;
    return { command: resolved, usedPrefix: matchedOverridePrefix };
  }

  const prefixes = getStandardPrefixes(client);
  const matchedPrefix = prefixes.find((prefix) => content.startsWith(prefix));
  if (!matchedPrefix) return null;

  const raw = content.slice(matchedPrefix.length).trim();
  const commandToken = String(raw.split(/\s+/)[0] || "").toLowerCase();
  if (!commandToken) return null;

  const resolved =
    client?.pcommands?.get?.(commandToken) ||
    client?.pcommands?.get?.(client?.aliases?.get?.(commandToken)) ||
    null;
  if (!resolved) return null;

  return { command: resolved, usedPrefix: matchedPrefix };
}

function resolvePrefixLogChannelId(client) {
  void client;
  return IDs.channels.commandLogChannel || null;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (!message) return;
    if (message.__fromMessageUpdatePrefix) return;
    if (message.system || message.webhookId || message.author?.bot) return;

    const resolvedClient = client || message.client;
    if (!resolvedClient) return;

    const resolved = resolveCommandFromContent(message, resolvedClient);
    if (!resolved?.command) return;

    try {
      if (!message.author?.id) return;
      await logCommandUsage(resolvedClient, {
        channelId: resolvePrefixLogChannelId(resolvedClient),
        serverName: message.guild?.name || "DM",
        user: message.author.tag || message.author.username || "unknown",
        userId: message.author.id,
        content: message.content,
        userAvatarUrl: message.author.displayAvatarURL?.({ size: 128 }),
      });
    } catch (error) {
      global.logger?.error?.("[prefixCommandLogging] failed:", error);
    }
  },
};