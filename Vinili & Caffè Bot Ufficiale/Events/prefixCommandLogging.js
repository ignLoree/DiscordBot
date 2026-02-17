const { Events } = require("discord.js");
const { logCommandUsage } = require("../Utils/Logging/commandUsageLogger");
const IDs = require("../Utils/Config/ids");

function getStandardPrefixes(client) {
  const list = [client?.config?.prefix, "+"]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  return Array.from(new Set(list)).sort((a, b) => b.length - a.length);
}

function getPrefixOverrideMap(client) {
  const size = client?.pcommands?.size || 0;
  const cached = client?._prefixLoggingOverrideCache;
  if (cached?.size === size && cached?.map instanceof Map) return cached.map;

  const map = new Map();
  for (const cmd of client?.pcommands?.values?.() || []) {
    const prefixOverride = String(cmd?.prefixOverride || "").trim();
    const commandName = String(cmd?.name || "").toLowerCase();
    if (!prefixOverride || !commandName) continue;

    if (!map.has(prefixOverride)) map.set(prefixOverride, new Map());
    map.get(prefixOverride).set(commandName, cmd);

    if (Array.isArray(cmd.aliases)) {
      for (const alias of cmd.aliases) {
        const normalizedAlias = String(alias || "")
          .toLowerCase()
          .trim();
        if (!normalizedAlias) continue;
        map.get(prefixOverride).set(normalizedAlias, cmd);
      }
    }
  }

  client._prefixLoggingOverrideCache = { size, map };
  return map;
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
    if (!message || message.author?.bot) return;
    if (message.__fromMessageUpdatePrefix) return;

    const resolved = resolveCommandFromContent(message, client);
    if (!resolved?.command) return;

    try {
      await logCommandUsage(client, {
        channelId: resolvePrefixLogChannelId(client),
        serverName: message.guild?.name || "DM",
        user: message.author.username,
        userId: message.author.id,
        content: message.content,
        userAvatarUrl: message.author.avatarURL({ dynamic: true }),
      });
    } catch {
      client.logs.error(
        "[PREFIX_COMMAND_USED] Error while logging command usage. Check if you have the correct channel ID in your config.",
      );
    }
  },
};
