const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const IDs = require("../Utils/Config/ids");
const {
  checkAndInstallPackages,
} = require("../Utils/Moderation/checkPackages");
const { getChannelSafe } = require("../Utils/Logging/commandUsageLogger");

const POLL_REMINDER_ROLE_ID = IDs.roles.HighStaff;
const POLL_REMINDER_CHANNEL_ID = "1442569285909217301";
const RESTART_CLEANUP_DELAY_MS = 2000;
const RESTART_NOTIFY_FILE = "restart_notify.json";

function setPresence(client) {
  client.user.setStatus(client.config.status);
  client.user.setActivity({
    type: 4,
    name: "irrelevant",
    state: "☕📀 discord.gg/viniliecaffe",
  });
}

function maybeCheckPackages(client) {
  if (typeof checkAndInstallPackages !== "function") return;
  if (process.env.CHECK_PACKAGES_ON_READY !== "1") return;

  Promise.resolve(checkAndInstallPackages(client)).catch((err) => {
    global.logger.error("[PACKAGES] Check failed:", err);
  });
}

function schedulePollReminder(client) {
  cron.schedule(
    "0 19 * * *",
    async () => {
      const guild =
        client.guilds.cache.get(IDs.guilds.main) ||
        (await client.guilds.fetch(IDs.guilds.main).catch(() => null));
      if (!guild) return;

      const channel =
        guild.channels.cache.get(POLL_REMINDER_CHANNEL_ID) ||
        (await guild.channels
          .fetch(POLL_REMINDER_CHANNEL_ID)
          .catch(() => null));
      if (!channel) return;

      await channel.send({
        content: `<:attentionfromvega:1443651874032062505> <@&${POLL_REMINDER_ROLE_ID}> ricordatevi di mettere il poll usando il comando dedicato! </poll create:1467597234387419478>`,
      });
    },
    { timezone: "Europe/Rome" },
  );
}

async function scheduleDelete(message) {
  if (!message) return;
  setTimeout(() => {
    message.delete().catch(() => {});
  }, RESTART_CLEANUP_DELAY_MS);
}

async function handleRestartNotification(client) {
  const restartNotifyPath = path.resolve(
    process.cwd(),
    "..",
    RESTART_NOTIFY_FILE,
  );
  if (!fs.existsSync(restartNotifyPath)) return;

  try {
    const raw = fs.readFileSync(restartNotifyPath, "utf8");
    const data = JSON.parse(raw);
    const channel = await getChannelSafe(client, data?.channelId);
    if (channel) {
      const elapsedMs = data?.at ? Date.now() - Date.parse(data.at) : null;
      const elapsed = Number.isFinite(elapsedMs)
        ? ` in ${Math.max(1, Math.round(elapsedMs / 1000))}s`
        : "";

      const restartMsg = await channel
        .send(
          `<:vegacheckmark:1443666279058772028> Bot riavviato con successo${elapsed}.`,
        )
        .catch(() => null);
      await scheduleDelete(restartMsg);

      if (data?.notifyMessageId) {
        const notifyMsg = await channel.messages
          .fetch(data.notifyMessageId)
          .catch(() => null);
        await scheduleDelete(notifyMsg);
      }

      if (data?.commandMessageId) {
        const commandMsg = await channel.messages
          .fetch(data.commandMessageId)
          .catch(() => null);
        await scheduleDelete(commandMsg);
      }
    }

    fs.unlinkSync(restartNotifyPath);
  } catch (err) {
    global.logger.error(
      "Errore durante il post-restart (restart_notify.json):",
      err?.message || err,
    );
  }
}

module.exports = {
  name: "clientReady",
  once: true,
  async execute(client) {
    try {
      setPresence(client);
      maybeCheckPackages(client);
      schedulePollReminder(client);
      await handleRestartNotification(client);
    } catch (error) {
      const detail = error?.stack || error?.message || error;
      client.logs.error("[STATUS] Error while loading bot status.", detail);
      global.logger.error("[STATUS] Error while loading bot status.", detail);
    }
  },
};
