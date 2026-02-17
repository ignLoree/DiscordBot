const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const IDs = require("../../Utils/Config/ids");

const DEV_ID = "295500038401163264";
const TEST_GUILD_ID = IDs.guilds?.test || "1462458562507964584";
const RESTART_FLAG = "restart.json";
const RESTART_NOTIFY_FILE = "restart_notify.json";

function errorEmbed(description) {
  return new EmbedBuilder().setColor("Red").setDescription(description);
}

async function sendPermissionError(message) {
  await message
    .reply({
      embeds: [
        errorEmbed(
          "<:vegax:1472992044140990526> Non hai i permessi per usare questo comando.",
        ),
      ],
      allowedMentions: { repliedUser: false },
    })
    .catch(() => {});
}

async function sendGuildError(message) {
  await message
    .reply({
      embeds: [
        errorEmbed(
          "<:vegax:1472992044140990526> Il comando `-rs` è utilizzabile solo nel **server test**.",
        ),
      ],
      allowedMentions: { repliedUser: false },
    })
    .catch(() => {});
}

async function sendStartNotice(message) {
  return message
    .reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(
            "<:attentionfromvega:1443651874032062505> Riavvio **Bot Test** richiesto. Ti avviso qui quando è completato.",
          ),
      ],
      allowedMentions: { repliedUser: false },
    })
    .catch(() => null);
}

function writeRestartFiles(message, notifyMessage, requestedAt) {
  const channelId = message.channelId || message.channel?.id || null;
  const notifyPath = path.resolve(process.cwd(), "..", RESTART_NOTIFY_FILE);
  const flagPath = path.resolve(process.cwd(), "..", RESTART_FLAG);

  fs.writeFileSync(
    notifyPath,
    JSON.stringify(
      {
        channelId,
        guildId: message.guild?.id || null,
        by: message.author.id,
        at: requestedAt,
        scope: "full",
        commandMessageId: message.id || null,
        notifyMessageId: notifyMessage?.id || null,
      },
      null,
      2,
    ),
    "utf8",
  );

  fs.writeFileSync(
    flagPath,
    JSON.stringify(
      {
        at: requestedAt,
        by: message.author.id,
        bot: "test",
      },
      null,
      2,
    ),
    "utf8",
  );
}

module.exports = {
  name: "restart",
  aliases: ["rs"],
  async execute(message) {
    if (message.author?.id !== DEV_ID) {
      await sendPermissionError(message);
      return true;
    }

    if (message.guild?.id !== TEST_GUILD_ID) {
      await sendGuildError(message);
      return true;
    }

    const requestedAt = new Date().toISOString();

    try {
      const notifyMessage = await sendStartNotice(message);
      writeRestartFiles(message, notifyMessage, requestedAt);
    } catch (err) {
      global.logger?.error?.("[Bot Test] -rs write flag:", err);
      await message
        .reply({
          embeds: [
            errorEmbed(
              "<:vegax:1472992044140990526> Errore durante la scrittura del file di restart.",
            ),
          ],
          allowedMentions: { repliedUser: false },
        })
        .catch(() => null);
    }

    return true;
  },
};
