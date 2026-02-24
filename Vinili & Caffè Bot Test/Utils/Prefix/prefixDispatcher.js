const { EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");
const { checkPrefixPermission, getPrefixRequiredRoles, buildGlobalPermissionDeniedEmbed, } = require("../Moderation/commandPermissions");
const { showPrefixUsageGuide } = require("../Moderation/prefixUsageGuide");

const PREFIXES = ["-"];
const BOT_MENTION_REGEX = /<@!?\d+>/;
const OFFICIAL_MAIN_GUILD_ID = IDs.guilds?.main || null;
const TEST_GUILD_ID = IDs.guilds?.test || null;

async function dispatchPrefixMessage(message, client) {
  if (!message?.guild || message.author?.bot) return false;
  if (
    OFFICIAL_MAIN_GUILD_ID &&
    String(message.guild.id || "") === String(OFFICIAL_MAIN_GUILD_ID)
  ) {
    return false;
  }
  if (
    TEST_GUILD_ID &&
    String(message.guild.id || "") !== String(TEST_GUILD_ID)
  ) {
    return false;
  }

  const content = (message.content || "").trim();
  if (!content) return false;

  const startsWithPrefix = PREFIXES.some((p) => content.startsWith(p));
  const isMention =
    client.user &&
    BOT_MENTION_REGEX.test(content) &&
    content.replace(BOT_MENTION_REGEX, "").trim().length > 0;
  if (!startsWithPrefix && !isMention) return false;

  const usedPrefix = PREFIXES.find((p) => content.startsWith(p));
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
        prefix: usedPrefix || "-",
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
      return true;
    }
  }

  const availableCommands = Array.from(client.pcommands.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `\`${PREFIXES[0]}${name}\``)
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
