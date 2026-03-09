const mongoose = require("mongoose");
const { restoreTtsConnections } = require("../Services/TTS/ttsService");
const { startHourlyReminderLoop } = require("../Services/Community/chatReminderService");

const PRESENCE_STATE = "☕📀 discord.gg/viniliecaffe";
const PRESENCE_TYPE_CUSTOM = 4;

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

module.exports = {
  name: "clientReady",
  once: true,
  async execute(_readyClient, client) {
    const activeClient = client || _readyClient;
    global.logger.info(`[BOT] ${activeClient.user.username} has been launched!`);

    await setPresence(activeClient);
    await connectMongo(activeClient);
    await restoreTtsState(activeClient);
    try {
      startHourlyReminderLoop(activeClient);
    } catch (err) {
      global.logger?.error?.("[CHAT REMINDER] Failed to start hourly loop:", err?.message || err);
    }
  },
};