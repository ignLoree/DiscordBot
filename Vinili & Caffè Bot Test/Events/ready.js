const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { restoreTtsConnections } = require("../Services/TTS/ttsService");
const { getClientChannelCached } = require("../Utils/Interaction/entityCache");

const PRESENCE_STATE = "☕📀 discord.gg/viniliecaffe";
const PRESENCE_TYPE_CUSTOM = 4;
const RESTART_CLEANUP_DELAY_MS = 2000;
const RESTART_NOTIFY_FILE = "restart_notify_test.json";

function getRestartNotifyCandidatePaths() {
  return [
    path.resolve(process.cwd(), RESTART_NOTIFY_FILE),
    path.resolve(process.cwd(), "..", RESTART_NOTIFY_FILE),
  ];
}

async function setPresence(client) {
  try {
    client.user.setPresence({
      status: client.config?.status || "idle",
      activities: [
        {
          type: PRESENCE_TYPE_CUSTOM,
          name: "idle",
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
    global.logger.warn(" MONGO_URL non impostato.");
    return;
  }

  try {
    await mongoose.connect(mongodbURL, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    });
  } catch (err) {
    global.logger.error(" MongoDB:", err.message);
  }
}

async function restoreTtsState(client) {
  await restoreTtsConnections(client);
}

async function cleanupMessage(channel, messageId) {
  if (!channel || !messageId) return;
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (msg) {
    const cleanupTimer = setTimeout(() => msg.delete().catch(() => {}), RESTART_CLEANUP_DELAY_MS);
    cleanupTimer.unref?.();
  }
}

async function handleRestartNotification(client) {
  const restartNotifyPath = getRestartNotifyCandidatePaths().find((candidate) => fs.existsSync(candidate));
  if (!restartNotifyPath) return;

  try {
    const raw = fs.readFileSync(restartNotifyPath, "utf8");
    const data = JSON.parse(raw);

    const channel = await getClientChannelCached(client,data ?. channelId,{ttlMs:30_000,});
    if (channel) {
      const elapsedMs = data?.at ? Date.now() - Date.parse(data.at) : null;
      const elapsed = Number.isFinite(elapsedMs)?` in ${Math.max(1,Math.round(elapsedMs /1000))}s`:"";

      const restartMsg = await channel.send(`<:vegacheckmark:1472992042203349084> Bot Test riavviato con successo${elapsed}.`,).catch(()=>null);

      if (restartMsg) {
        const cleanupTimer = setTimeout(
          () => restartMsg.delete().catch(() => {}),
          RESTART_CLEANUP_DELAY_MS,
        );
        cleanupTimer.unref?.();
      }

      await cleanupMessage(channel, data?.notifyMessageId);
      await cleanupMessage(channel, data?.commandMessageId);
    }

    fs.unlinkSync(restartNotifyPath);
  } catch (err) {
    global.logger.error(
      " Errore post-restart (restart notify):",
      err?.message || err,
    );
  }
}

module.exports = {
  name: "clientReady",
  once: true,
  async execute(_readyClient, client) {
    const activeClient = client || _readyClient;
    global.logger.info(`[BOT] ${activeClient.user.username} has been launched!`);

    await setPresence(activeClient);
    await connectMongo(activeClient);
    await restoreTtsState(activeClient);
    await handleRestartNotification(activeClient);
  },
};