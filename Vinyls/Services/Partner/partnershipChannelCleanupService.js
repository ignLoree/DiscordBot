const cron = require("node-cron");
const IDs = require("../../Utils/Config/ids");
const BULK_DELETE_LIMIT = 100;
const MESSAGE_MAX_AGE_BULK_MS = 14 * 24 * 60 * 60 * 1000;
const DELETE_ONE_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPartnershipChannelCleanup(client) {
  const channelId = IDs.channels?.partnersChat;
  if (!channelId) {
    global.logger?.warn?.("[PARTNERSHIP CLEANUP] Canale #partners non configurato (partnersChat).");
    return;
  }

  const channel = client.channels?.cache?.get(channelId) ?? (await client.channels?.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.("[PARTNERSHIP CLEANUP] Canale #partners non trovato o non testuale.");
    return;
  }

  const now = Date.now();
  let totalDeleted = 0;

  try {
    let lastId = null;
    let hasMore = true;

    while (hasMore) {
      const options = { limit: BULK_DELETE_LIMIT };
      if (lastId) options.before = lastId;

      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) {
        hasMore = false;
        break;
      }

      const toBulk = [];
      const toSingle = [];
      const botId = client.user?.id;

      for (const [, msg] of messages) {
        if (msg.author?.id !== botId) continue;
        const age = now - msg.createdTimestamp;
        if (age < MESSAGE_MAX_AGE_BULK_MS) {
          toBulk.push(msg);
        } else {
          toSingle.push(msg);
        }
      }

      if (toBulk.length > 0) {
        const ids = toBulk.map((m) => m.id);
        await channel.bulkDelete(ids, true).catch((err) => {
          global.logger?.warn?.("[PARTNERSHIP CLEANUP] bulkDelete parziale fallito:", err?.message);
        });
        totalDeleted += toBulk.length;
      }

      for (const msg of toSingle) {
        await msg.delete().catch(() => {});
        totalDeleted++;
        await sleep(DELETE_ONE_DELAY_MS);
      }

      if (messages.size < BULK_DELETE_LIMIT) {
        hasMore = false;
      } else {
        lastId = messages.last()?.id ?? null;
        if (!lastId) hasMore = false;
      }
    }

    if (totalDeleted > 0) {
      global.logger?.info?.("[PARTNERSHIP CLEANUP] Canale #partners ripulito: eliminati", totalDeleted, "messaggi.");
    }
  } catch (err) {
    global.logger?.error?.("[PARTNERSHIP CLEANUP] Errore durante la pulizia:", err);
  }
}

let cleanupTask = null;

function startPartnershipChannelCleanupLoop(client) {
  if (cleanupTask) return cleanupTask;

  cleanupTask = cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        await runPartnershipChannelCleanup(client);
      } catch (err) {
        global.logger?.error?.("[PARTNERSHIP CLEANUP] Esecuzione schedulata fallita:", err);
      }
    },
    { timezone: "Europe/Rome" },
  );

  return cleanupTask;
}

module.exports = { startPartnershipChannelCleanupLoop, runPartnershipChannelCleanup };