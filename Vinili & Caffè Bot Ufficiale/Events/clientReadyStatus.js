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

function logError(client, label, error) {
  const detail = error?.stack || error?.message || error;
  if (client?.logs?.error) client.logs.error(label, detail);
  if (global?.logger?.error) global.logger.error(label, detail);
  else console.error(label, detail);
}

function setPresence(client) {
  if (!client?.user) return;
  try {
    const status = String(client?.config?.status || "online");
    client.user.setStatus(status);
    client.user.setActivity({
      type: 4,
      name: "irrelevant",
      state: "discord.gg/viniliecaffe",
    });
  } catch (error) {
    logError(client, "[STATUS] Failed to set presence.", error);
  }
}

function maybeCheckPackages(client) {
  if (typeof checkAndInstallPackages !== "function") return;
  if (process.env.CHECK_PACKAGES_ON_READY !== "1") return;

  Promise.resolve(checkAndInstallPackages(client)).catch((err) => {
    logError(client, "[PACKAGES] Check failed:", err);
  });
}

function schedulePollReminder(client) {
  if (client?._pollReminderTask?.stop) {
    try {
      client._pollReminderTask.stop();
    } catch {}
  }

  client._pollReminderTask = cron.schedule(
    "0 19 * * *",
    async () => {
      try {
        const guild =
          client.guilds.cache.get(IDs.guilds.main) ||
          (await client.guilds.fetch(IDs.guilds.main).catch(() => null));
        if (!guild) return;

        const channel =
          guild.channels.cache.get(POLL_REMINDER_CHANNEL_ID) ||
          (await guild.channels
            .fetch(POLL_REMINDER_CHANNEL_ID)
            .catch(() => null));
        if (!channel?.isTextBased?.()) return;
        if (!POLL_REMINDER_ROLE_ID) return;

        await channel.send({
          content: `<:attentionfromvega:1443651874032062505> <@&${POLL_REMINDER_ROLE_ID}> ricordatevi di mettere il poll usando il comando dedicato! </poll create:1473280351462752399>`,
        });
      } catch (error) {
        logError(client, "[STATUS] Poll reminder failed.", error);
      }
    },
    { timezone: "Europe/Rome" },
  );
}

function scheduleDelete(message) {
  if (!message) return;
  setTimeout(() => {
    message.delete().catch(() => {});
  }, RESTART_CLEANUP_DELAY_MS);
}

async function handleRestartNotification(client) {
  const candidatePaths = [
    path.resolve(process.cwd(), RESTART_NOTIFY_FILE),
    path.resolve(process.cwd(), "..", RESTART_NOTIFY_FILE),
  ];
  const restartNotifyPath = candidatePaths.find((p) => fs.existsSync(p));
  if (!restartNotifyPath) return;

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
      scheduleDelete(restartMsg);

      if (data?.notifyMessageId) {
        const notifyMsg = await channel.messages
          .fetch(data.notifyMessageId)
          .catch(() => null);
        scheduleDelete(notifyMsg);
      }

      if (data?.commandMessageId) {
        const commandMsg = await channel.messages
          .fetch(data.commandMessageId)
          .catch(() => null);
        scheduleDelete(commandMsg);
      }
    }
  } catch (err) {
    logError(
      client,
      "Errore durante il post-restart (restart_notify.json):",
      err,
    );
  } finally {
    if (fs.existsSync(restartNotifyPath)) {
      try {
        fs.unlinkSync(restartNotifyPath);
      } catch {}
    }
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
      logError(client, "[STATUS] Error while loading bot status.", error);
    }
  },
};
