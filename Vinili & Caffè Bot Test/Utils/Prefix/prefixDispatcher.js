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
const WRONG_PREFIX_HINT_CHANNEL_IDS = new Set(
  [IDs.channels?.commands, IDs.channels?.staffCmds, IDs.channels?.highCmds]
    .filter(Boolean)
    .map((id) => String(id)),
);

function resolvePrefixCommandByToken(client, token) {
  const safe = String(token || "").trim().toLowerCase();
  if (!safe) return null;
  return (
    client?.pcommands?.get?.(safe) ||
    client?.pcommands?.get?.(client?.aliases?.get?.(safe)) ||
    null
  );
}

function parseWrongPrefixAttempt(content, validPrefix = "-") {
  const text = String(content || "").trim();
  const safePrefix = String(validPrefix || "-");
  if (!text || text.startsWith(safePrefix)) return null;
  const direct = text.match(/^((?:[a-z]{1,3})?[?!./-])\s*([a-z0-9][\w-]*)/i);
  if (direct) {
    return {
      usedPrefix: String(direct[1] || ""),
      token: String(direct[2] || "").toLowerCase(),
    };
  }
  const nearMiss = text.match(
    /^([a-z]{1,3})\s*([?!./-])\s*([a-z0-9][\w-]*)/i,
  );
  if (nearMiss) {
    return {
      usedPrefix: `${String(nearMiss[1] || "")}${String(nearMiss[2] || "")}`,
      token: String(nearMiss[3] || "").toLowerCase(),
    };
  }
  return null;
}

function shouldSendWrongPrefixHint(message, usedPrefix, commandName) {
  const client = message?.client;
  if (!client) return true;
  if (!client._wrongPrefixHintCooldown) {
    client._wrongPrefixHintCooldown = new Map();
  }
  const key = [
    String(message.guildId || "noguild"),
    String(message.channelId || "nochannel"),
    String(message.author?.id || "nouser"),
    String(usedPrefix || ""),
    String(commandName || ""),
  ].join(":");
  const now = Date.now();
  const lastAt = Number(client._wrongPrefixHintCooldown.get(key) || 0);
  if (now - lastAt < 10_000) return false;
  client._wrongPrefixHintCooldown.set(key, now);
  return true;
}

async function maybeSendWrongPrefixHint(message, client, validPrefix = "-") {
  const channelId = String(message?.channelId || "");
  if (WRONG_PREFIX_HINT_CHANNEL_IDS.size && !WRONG_PREFIX_HINT_CHANNEL_IDS.has(channelId)) {
    return false;
  }
  const safePrefix = String(validPrefix || "-");
  const attempt = parseWrongPrefixAttempt(message?.content || "", safePrefix);
  if (!attempt?.token || !attempt?.usedPrefix) return false;
  if (attempt.usedPrefix === safePrefix) return false;
  const command = resolvePrefixCommandByToken(client, attempt.token);
  if (!command) return false;
  const commandName = String(command.name || "").toLowerCase();
  if (commandName === "help") return false;
  if (!shouldSendWrongPrefixHint(message, attempt.usedPrefix, commandName)) {
    return true;
  }
  const hint = await message.channel
    .send({
      content: `\`${attempt.usedPrefix}${attempt.token}\` non e valido. Usa \`${safePrefix}${commandName}\`.`,
    })
    .catch(() => null);
  if (hint) setTimeout(() => hint.delete().catch(() => {}), 6000);
  return true;
}

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
    global.logger?.error?.(" Prefix error log failed:", nestedError);
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
  const safePrefix = String(client?.config?.prefix || "-").trim() || "-";

  const startsWithPrefix = content.startsWith(safePrefix);
  const isMention =
    client.user &&
    BOT_MENTION_REGEX.test(content) &&
    content.replace(BOT_MENTION_REGEX, "").trim().length > 0;
  if (!startsWithPrefix && !isMention) {
    return maybeSendWrongPrefixHint(message, client, safePrefix);
  }

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
      global.logger?.error?.(" Prefix dispatcher error:", err);
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
