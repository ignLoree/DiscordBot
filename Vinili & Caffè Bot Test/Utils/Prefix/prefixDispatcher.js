const { EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");

const PREFIXES = ["-"];
const BOT_MENTION_REGEX = /<@!?\d+>/;
const MAIN_GUILD_ID = IDs.guilds?.main || null;
const TEST_GUILD_ID = IDs.guilds?.test || "1462458562507964584";

function isSponsorGuild(guildId) {
  const list = IDs.guilds?.sponsorGuildIds || [];
  return Array.isArray(list) && list.includes(guildId);
}

function isAllowedGuildTest(guildId) {
  if (!guildId) return false;
  if (guildId === MAIN_GUILD_ID) return false;
  return guildId === TEST_GUILD_ID || isSponsorGuild(guildId);
}

async function dispatchPrefixMessage(message, client) {
  if (!message?.guild || message.author?.bot) return false;

  const content = (message.content || "").trim();
  if (!content) return false;

  const startsWithPrefix = PREFIXES.some((p) => content.startsWith(p));
  const isMention =
    client.user &&
    BOT_MENTION_REGEX.test(content) &&
    content.replace(BOT_MENTION_REGEX, "").trim().length > 0;
  if (!startsWithPrefix && !isMention) return false;

  if (!isAllowedGuildTest(message.guild.id)) return false;

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

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      "<:ticket:1472994083524837396> **Bot Test** gestisce solo **ticket** e **verifica** su questo server.\n" +
        "I comandi (prefix e slash) sono sul **bot principale** (Vinili & Caffe Bot).\n" +
        "Usa i **bottoni** e il **menù** nel canale ticket per aprire un ticket.",
    );
  await message.reply({ embeds: [embed] }).catch(() => {});
  return true;
}

module.exports = { dispatchPrefixMessage };
