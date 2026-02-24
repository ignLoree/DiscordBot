const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

const PRESENCE_STATE = "☕📀 discord.gg/viniliecaffe";
const PRESENCE_TYPE_CUSTOM = 4;
const RESTART_CLEANUP_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setPresence(client) {
  try {
    client.user.setPresence({
      status: client.config?.status || "idle",
      activities: [
        {
          type: PRESENCE_TYPE_CUSTOM,
          name: "irrelevant",
          state: PRESENCE_STATE,
        },
      ],
    });
  } catch (err) {
    client.logs.error(
      "[STATUS] Errore impostazione presence:",
      err?.message || err,
    );
  }
}

async function connectMongo(client) {
  const mongodbURL = process.env.MONGO_URL || client.config.mongoURL;
  if (!mongodbURL) {
    global.logger.warn("[Bot Test] MONGO_URL non impostato.");
    return;
  }

  try {
    await mongoose.connect(mongodbURL, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    });
  } catch (err) {
    global.logger.error("[Bot Test] MongoDB:", err.message);
  }
}

async function refreshLists(client) {
  return client;
}

async function cleanupMessage(channel, messageId) {
  if (!channel || !messageId) return;
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (msg) {
    setTimeout(() => msg.delete().catch(() => {}), RESTART_CLEANUP_DELAY_MS);
  }
}

async function handleRestartNotification(client) {
  const restartNotifyPath = path.resolve(
    process.cwd(),
    "..",
    "restart_notify.json",
  );
  if (!fs.existsSync(restartNotifyPath)) return;

  try {
    const raw = fs.readFileSync(restartNotifyPath, "utf8");
    const data = JSON.parse(raw);

    const channel =
      client.channels.cache.get(data?.channelId) ||
      (await client.channels.fetch(data?.channelId).catch(() => null));
    if (channel) {
      const elapsedMs = data?.at ? Date.now() - Date.parse(data.at) : null;
      const elapsed = Number.isFinite(elapsedMs)
        ? ` in ${Math.max(1, Math.round(elapsedMs / 1000))}s`
        : "";

      const restartMsg = await channel
        .send(
          `<:vegacheckmark:1472992042203349084> Bot Test riavviato con successo${elapsed}.`,
        )
        .catch(() => null);

      if (restartMsg) {
        setTimeout(
          () => restartMsg.delete().catch(() => {}),
          RESTART_CLEANUP_DELAY_MS,
        );
      }

      await cleanupMessage(channel, data?.notifyMessageId);
      await cleanupMessage(channel, data?.commandMessageId);
    }

    fs.unlinkSync(restartNotifyPath);
  } catch (err) {
    global.logger.error(
      "[Bot Test] Errore post-restart (restart_notify.json):",
      err?.message || err,
    );
  }
}

module.exports = {
  name: "clientReady",
  once: true,
  async execute(_readyClient, client) {
    const activeClient = client || _readyClient;
    global.logger.info(`[BOT] ${client.user.username} has been launched!`);

    await setPresence(activeClient);
    await connectMongo(activeClient);
    await refreshLists(activeClient);
    await handleRestartNotification(activeClient);
  },
};
