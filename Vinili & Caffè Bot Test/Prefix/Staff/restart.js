const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const RESTART_FLAG = "restart.json";
const RESTART_NOTIFY_FILE = "restart_notify.json";
const PROCESS_EXIT_DELAY_MS = 1200;

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

function canUseRestart(message) {
  if (!message?.guild || !message?.member) return false;
  const isOwner =
    String(message.guild.ownerId || "") === String(message.author?.id || "");
  const isAdmin = Boolean(
    message.member.permissions?.has?.("Administrator"),
  );
  return isOwner || isAdmin;
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
    if (!canUseRestart(message)) {
      await sendPermissionError(message);
      return true;
    }

    const requestedAt = new Date().toISOString();

    try {
      const notifyMessage = await sendStartNotice(message);
      writeRestartFiles(message, notifyMessage, requestedAt);
      setTimeout(() => process.exit(0), PROCESS_EXIT_DELAY_MS);
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

