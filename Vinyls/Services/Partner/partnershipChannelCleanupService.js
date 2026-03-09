const cron = require("node-cron");
const IDs = require("../../Utils/Config/ids");
const TIME_ZONE = "Europe/Rome";
const BULK_DELETE_LIMIT = 100;
const DELETE_ONE_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRomeMidnightTodayUtc() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = fmt.formatToParts(now);
  const y = parseInt(parts.find((p) => p.type === "year")?.value || "0", 10);
  const m = parseInt(parts.find((p) => p.type === "month")?.value || "0", 10);
  const d = parseInt(parts.find((p) => p.type === "day")?.value || "0", 10);
  const utcMidnightSameDay = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const t = new Date(utcMidnightSameDay);
  const romeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hour12: false, minute: "numeric", second: "numeric" });
  const romeParts = romeFmt.formatToParts(t);
  const hour = parseInt(romeParts.find((p) => p.type === "hour")?.value || "0", 10);
  const min = parseInt(romeParts.find((p) => p.type === "minute")?.value || "0", 10);
  const sec = parseInt(romeParts.find((p) => p.type === "second")?.value || "0", 10);
  const offsetMs = (hour * 3600 + min * 60 + sec) * 1000;
  return utcMidnightSameDay - offsetMs;
}

async function runPartnershipChannelCleanup(client) {
  const channelId = IDs.channels?.partnersChat;
  if (!channelId) {
    global.logger?.warn?.("[PARTNERS CLEANUP] Canale #partners non configurato (partnersChat).");
    return;
  }

  const channel = client.channels?.cache?.get(channelId) ?? (await client.channels?.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.("[PARTNERS CLEANUP] Canale #partners non trovato o non testuale.");
    return;
  }

  const dayStartMs = getRomeMidnightTodayUtc();
  const botId = client.user?.id;
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

      const toDelete = [];
      let pastMidnight = false;
      for (const [, msg] of messages) {
        if (msg.createdTimestamp < dayStartMs) {
          pastMidnight = true;
          break;
        }
        if (msg.author?.id !== botId) continue;
        toDelete.push(msg);
      }
      if (pastMidnight || messages.size < BULK_DELETE_LIMIT) hasMore = false;

      const bulkable = toDelete.filter((m) => m.createdTimestamp > Date.now() - 14 * 24 * 60 * 60 * 1000);
      const single = toDelete.filter((m) => m.createdTimestamp <= Date.now() - 14 * 24 * 60 * 60 * 1000);
      if (bulkable.length > 0) {
        const ids = bulkable.map((m) => m.id);
        await channel.bulkDelete(ids, true).catch((err) => {
          global.logger?.warn?.("[PARTNERS CLEANUP] bulkDelete fallito:", err?.message);
        });
        totalDeleted += bulkable.length;
      }
      for (const msg of single) {
        await msg.delete().catch(() => {});
        totalDeleted++;
        await sleep(DELETE_ONE_DELAY_MS);
      }

      if (hasMore) lastId = messages.last()?.id ?? null;
      if (!lastId) hasMore = false;
    }

    if (totalDeleted > 0) {
      global.logger?.info?.("[PARTNERS CLEANUP] #partners: eliminati", totalDeleted, "messaggi comando (solo oggi).");
    }
  } catch (err) {
    global.logger?.error?.("[PARTNERS CLEANUP] Errore:", err);
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