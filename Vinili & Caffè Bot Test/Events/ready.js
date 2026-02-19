const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const sponsorPanels = require("../Triggers/embeds");
const backupCommand = require("../Commands/Staff/backup");
const {
  startTicketAutoClosePromptLoop,
  startTranscriptCleanupLoop,
} = require("../Services/Ticket/ticketMaintenanceService");

const PRESENCE_STATE = "☕📀 discord.gg/viniliecaffe";
const PRESENCE_TYPE_CUSTOM = 4;
const WARMUP_DELAY_MS = 3000;
const WARMUP_BETWEEN_GUILDS_MS = 300;
const RETRY_DELAY_MS = 5000;
const RESTART_CLEANUP_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSponsorIds(client) {
  if (Array.isArray(client.config?.sponsorGuildIds)) {
    return client.config.sponsorGuildIds;
  }
  return Object.keys(client.config?.sponsorVerifyChannelIds || {});
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

async function registerBackupSlash(client) {
  try {
    const token = client?.config?.token || process.env.DISCORD_TOKEN_TEST;
    const clientId =
      process.env.DISCORD_CLIENT_ID_TEST ||
      process.env.DISCORD_CLIENT_ID ||
      client.user?.id;
    if (!token || !clientId) return;

    const rest = new REST({ version: "10" }).setToken(token);
    const payload = backupCommand?.data?.toJSON?.();
    if (!payload) return;
    await rest.put(Routes.applicationCommands(clientId), {
      body: [payload],
    });
  } catch (err) {
    global.logger.error("[Bot Test] register backup slash:", err?.message || err);
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
    try {
      startTicketAutoClosePromptLoop(client);
      startTranscriptCleanupLoop();
    } catch (err) {
      global.logger.error(
        "[Bot Test] Ticket maintenance loops:",
        err?.message || err,
      );
    }
  } catch (err) {
    global.logger.error("[Bot Test] MongoDB:", err.message);
  }
}

async function warmupGuilds(client, sponsorIds) {
  await sleep(WARMUP_DELAY_MS);

  for (const guildId of sponsorIds) {
    try {
      await client.guilds.fetch(guildId).catch((err) => {
        global.logger.warn(
          "[Bot Test] Fetch guild " + guildId + ": " + (err?.message || err),
        );
        return null;
      });
      await sleep(WARMUP_BETWEEN_GUILDS_MS);
    } catch (err) {
      global.logger.warn(
        "[Bot Test] Warm-up guild " + guildId + ":",
        err?.message || err,
      );
    }
  }
}

async function runPanelsOnce(client) {
  let verifySent = 0;
  let ticketSent = 0;

  try {
    await sponsorPanels.runSponsorPanel(client);
  } catch (err) {
    global.logger.error("[Bot Test] runSponsorPanel:", err);
  }

  try {
    verifySent = await sponsorPanels.runSponsorVerifyPanels(client);
  } catch (err) {
    global.logger.error("[Bot Test] runSponsorVerifyPanels:", err);
  }

  try {
    ticketSent = await sponsorPanels.runSponsorTicketPanels(client);
  } catch (err) {
    global.logger.error("[Bot Test] runSponsorTicketPanels:", err);
  }

  return { verifySent, ticketSent };
}

function logPanelZeroWarnings(client, sponsorIds) {
  global.logger.warn(
    "[Bot Test] Dopo il retry: ancora 0 panel. Verifica che il bot sia invitato in ogni server sponsor (config.sponsorGuildIds), sponsorVerifyChannelIds per la verifica e sponsorTicketChannelIds per i ticket.",
  );

  if (sponsorIds.length === 0 || client.guilds.cache.size === 0) return;

  const inSponsor = sponsorIds.filter((id) => client.guilds.cache.has(id));
  if (inSponsor.length > 0) return;

  global.logger.warn(
    "[Bot Test] Questo bot (Application ID: " +
      (client.application?.id || client.user?.id) +
      ') non e in nessuno dei server sponsor. L\'API Discord restituisce "Unknown Guild": invita QUESTO bot (stesso token/DISCORD_TOKEN_TEST) nei server sponsor, non un altro bot.',
  );
}

async function runPanelsWithRetry(client, sponsorIds) {
  let result = await runPanelsOnce(client);

  if (
    result.verifySent === 0 &&
    result.ticketSent === 0 &&
    client.guilds.cache.size > 0
  ) {
    global.logger.warn(
      "[Bot Test] Nessun panel verify/ticket inviato. Riprovo tra 5 secondi...",
    );
    await sleep(RETRY_DELAY_MS);
    result = await runPanelsOnce(client);
  }

  if (result.verifySent === 0 && result.ticketSent === 0) {
    logPanelZeroWarnings(client, sponsorIds);
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
    await registerBackupSlash(activeClient);
    await connectMongo(activeClient);

    const sponsorIds = getSponsorIds(activeClient);
    await warmupGuilds(activeClient, sponsorIds);
    await runPanelsWithRetry(activeClient, sponsorIds);
    await refreshLists(activeClient);
    await handleRestartNotification(activeClient);
  },
};
