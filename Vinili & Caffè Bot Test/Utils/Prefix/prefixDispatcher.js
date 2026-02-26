const { EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");
const { buildErrorLogEmbed } = require("../Logging/errorLogEmbed");
const { checkPrefixPermission, getPrefixRequiredRoles, buildGlobalPermissionDeniedEmbed, } = require("../Moderation/commandPermissions");
const { showPrefixUsageGuide } = require("../Moderation/prefixUsageGuide");

const BOT_MENTION_REGEX = /<@!?\d+>/;
const OFFICIAL_MAIN_GUILD_ID = IDs.guilds?.main || null;
const TEST_GUILD_ID = IDs.guilds?.test || null;
const ALLOWED_GUILD_IDS = new Set(
  [OFFICIAL_MAIN_GUILD_ID, TEST_GUILD_ID]
    .filter(Boolean)
    .map((id) => String(id)),
);

async function logPrefixErrorToChannel(message, client, commandName, error) {
  try {
    const channelId = IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
    if (!channelId) return;
    const errorChannel =
      client.channels?.cache?.get(channelId) ||
      (await client.channels?.fetch?.(channelId).catch(() => null));
    if (!errorChannel?.isTextBased?.()) return;

    const embed = buildErrorLogEmbed({
      contextLabel: "Comando",
      contextValue: String(commandName || "unknown"),
      userTag: message?.author?.tag || "unknown",
      error,
      serverName: message?.guild
        ? `${message.guild.name} [${message.guild.id}]`
        : null,
    });
    await errorChannel.send({ embeds: [embed] }).catch(() => null);
  } catch (nestedError) {
    global.logger?.error?.("[Bot Test] Prefix error log failed:", nestedError);
  }
}

async function dispatchPrefixMessage(message, client) {
  if (!message?.guild || message.author?.bot) return false;
  if (
    ALLOWED_GUILD_IDS.size &&
    !ALLOWED_GUILD_IDS.has(String(message.guild.id || ""))
  ) {
    return false;
  }

  const content = (message.content || "").trim();
  if (!content) return false;
  const safePrefix = String(client?.config?.prefix || "+").trim() || "+";

  const startsWithPrefix = content.startsWith(safePrefix);
  const isMention =
    client.user &&
    BOT_MENTION_REGEX.test(content) &&
    content.replace(BOT_MENTION_REGEX, "").trim().length > 0;
  if (!startsWithPrefix && !isMention) return false;

  const usedPrefix = startsWithPrefix ? safePrefix : null;
  const tokens = usedPrefix
    ? content.slice(usedPrefix.length).trim().split(/\s+/).filter(Boolean)
    : [];
  if (!tokens.length) return false;

  const invokedName = String(tokens.shift() || "").toLowerCase();
  const command =
    client.pcommands.get(invokedName) ||
    client.pcommands.get(client.aliases.get(invokedName));
  const args = tokens;

  if (command) {
    const hasSubcommands = Boolean(
      (Array.isArray(command?.subcommands) && command.subcommands.length > 0) ||
      (command?.subcommandAliases &&
        typeof command.subcommandAliases === "object" &&
        Object.keys(command.subcommandAliases).length > 0),
    );
    if (!args.length && (Boolean(command?.args) || hasSubcommands)) {
      await showPrefixUsageGuide({
        message,
        command,
        prefix: usedPrefix || safePrefix,
      });
      return true;
    }
    const subcommandName = args[0] ? String(args[0]).toLowerCase() : null;
    const allowed = await checkPrefixPermission(
      message,
      String(command.name || invokedName).toLowerCase(),
      subcommandName,
    );
    if (!allowed) {
      const requiredRoles = getPrefixRequiredRoles(
        String(command.name || invokedName).toLowerCase(),
        subcommandName,
      );
      await message
        .reply({
          embeds: [buildGlobalPermissionDeniedEmbed(requiredRoles || [], "comando")],
        })
        .catch(() => {});
      return true;
    }

    try {
      const result = await command.execute(message, args, client, {
        invokedName,
      });
      if (result !== false) return true;
    } catch (err) {
      global.logger?.error?.("[Bot Test] Prefix dispatcher error:", err);
      await logPrefixErrorToChannel(
        message,
        client,
        command?.name || invokedName,
        err,
      );
      return true;
    }
  }

  const availableCommands = Array.from(client.pcommands.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `\`${safePrefix}${name}\``)
    .join(", ");

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      "**Bot Test** – i comandi principali sono sul **bot ufficiale**.\n" +
        (availableCommands ? `Comandi disponibili qui: ${availableCommands}` : ""),
    );
  await message.reply({ embeds: [embed] }).catch(() => {});
  return true;
}

module.exports = { dispatchPrefixMessage };
