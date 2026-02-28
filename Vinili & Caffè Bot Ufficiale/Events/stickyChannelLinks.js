const fs = require("fs");
const path = require("path");
const IDs = require("../Utils/Config/ids");

const STICKY_CONFIG = Object.fromEntries(
  [
    [
      IDs.channels.mudae,
      "**__[Clicca qui per leggere i comandi del bot](<https://discord.com/channels/1329080093599076474/1442569182825681077/1442897267681132616>)__**",
    ],
    [
      IDs.channels.poketwo,
      "**__[Clicca qui per leggere i comandi del bot](https://discord.com/channels/1329080093599076474/1442569184281362552/1470197148674162932)__**",
    ],
    [
      IDs.channels.ship,
      "**__[Clicca qui per leggere i comandi del bot](https://discord.com/channels/1329080093599076474/1469685688814407726/1476550416656498930)__**",
    ],
  ].filter(([channelId, text]) => Boolean(channelId && text)),
);

const lastStickyMessageByChannel = new Map();
const stickyProcessingChannels = new Set();
const stickyPendingChannels = new Set();
const STICKY_STATE_PATH = path.resolve(
  __dirname,
  "../Data/stickyMessageState.json",
);
const STICKY_SETTINGS_PATH = path.resolve(
  __dirname,
  "../Data/stickyMessageSettings.json",
);
const DEFAULT_STICKY_SETTINGS = {
  enabled: false,
};
let stickySettingsCache = { mtimeMs: -1, data: DEFAULT_STICKY_SETTINGS };

function logError(...args) {
  global.logger?.error?.("[stickyChannelLinks]", ...args);
}

function loadStickyState() {
  try {
    if (!fs.existsSync(STICKY_STATE_PATH)) return;
    const raw = fs.readFileSync(STICKY_STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    for (const [channelId, messageId] of Object.entries(parsed)) {
      if (!channelId || !messageId) continue;
      lastStickyMessageByChannel.set(String(channelId), String(messageId));
    }
  } catch (error) {
    logError("load state failed:", error);
  }
}

function loadStickySettings() {
  try {
    if (!fs.existsSync(STICKY_SETTINGS_PATH)) {
      return DEFAULT_STICKY_SETTINGS;
    }
    const stat = fs.statSync(STICKY_SETTINGS_PATH);
    if (stickySettingsCache.mtimeMs === stat.mtimeMs) {
      return stickySettingsCache.data;
    }
    const raw = fs.readFileSync(STICKY_SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const data = {
      enabled: parsed?.enabled === true,
    };
    stickySettingsCache = { mtimeMs: stat.mtimeMs, data };
    return data;
  } catch (error) {
    logError("load settings failed:", error);
    return DEFAULT_STICKY_SETTINGS;
  }
}

function isStickyEnabled() {
  return loadStickySettings().enabled === true;
}

function saveStickyState() {
  try {
    fs.mkdirSync(path.dirname(STICKY_STATE_PATH), { recursive: true });
    const serializable = Object.fromEntries(lastStickyMessageByChannel.entries());
    fs.writeFileSync(
      STICKY_STATE_PATH,
      `${JSON.stringify(serializable, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    logError("save state failed:", error);
  }
}

function setStickyMessage(channelId, messageId) {
  lastStickyMessageByChannel.set(String(channelId), String(messageId));
  saveStickyState();
}

function clearStickyMessage(channelId) {
  if (lastStickyMessageByChannel.delete(String(channelId))) {
    saveStickyState();
  }
}

loadStickyState();

async function deletePreviousSticky(channel, stickyText, clientUserId) {
  const trackedId = lastStickyMessageByChannel.get(channel.id);
  if (trackedId) {
    const tracked = await channel.messages.fetch(trackedId).catch(() => null);
    if (tracked && tracked.author?.id === clientUserId) {
      await tracked.delete().catch(() => {});
      clearStickyMessage(channel.id);
      return;
    }
    clearStickyMessage(channel.id);
  }

  const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (!recent?.size) return;
  const oldSticky = recent.find(
    (msg) =>
      msg.author?.id === clientUserId &&
      String(msg.content || "").trim() === stickyText,
  );
  if (oldSticky) {
    await oldSticky.delete().catch((error) => {
      logError("delete old sticky failed:", error);
    });
    clearStickyMessage(channel.id);
  }
}

async function collapseStickyMessages(
  channel,
  stickyText,
  clientUserId,
  keepMessageId = null,
) {
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!recent?.size) return;
  const matching = recent
    .filter(
      (msg) =>
        msg.author?.id === clientUserId &&
        String(msg.content || "").trim() === stickyText,
    )
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  if (!matching.size) return;

  let keepId = keepMessageId;
  if (!keepId) {
    keepId = matching.first()?.id || null;
  }
  for (const msg of matching.values()) {
    if (msg.id === keepId) continue;
    await msg.delete().catch((error) => {
      logError("collapse sticky delete failed:", error);
    });
  }
}

async function processStickyChannel(channel, stickyText, clientUserId) {
  await deletePreviousSticky(channel, stickyText, clientUserId);

  const latest = await channel.messages
    .fetch({ limit: 1 })
    .catch(() => null);
  const latestMessage = latest?.first();
  if (
    latestMessage &&
    latestMessage.author?.id === clientUserId &&
    String(latestMessage.content || "").trim() === stickyText
  ) {
    setStickyMessage(channel.id, latestMessage.id);
    await collapseStickyMessages(
      channel,
      stickyText,
      clientUserId,
      latestMessage.id,
    );
    return;
  }

  const sent = await channel
    .send({ content: stickyText })
    .catch((error) => {
      logError("send sticky failed:", error);
      return null;
    });
  if (sent) {
    setStickyMessage(channel.id, sent.id);
    await collapseStickyMessages(
      channel,
      stickyText,
      clientUserId,
      sent.id,
    );
  }
}

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (!message?.guild || !message.channelId) return;
    if (!isStickyEnabled()) return;
    const resolvedClient = client || message.client;
    const clientUserId = String(resolvedClient?.user?.id || "");
    if (!clientUserId) return;
    if (message.author?.id === clientUserId) return;

    const stickyText = STICKY_CONFIG[message.channelId];
    if (!stickyText) return;
    const channelId = String(message.channelId);
    if (stickyProcessingChannels.has(channelId)) {
      stickyPendingChannels.add(channelId);
      return;
    }

    const channel = message.channel;
    if (!channel?.isTextBased?.()) return;
    stickyProcessingChannels.add(channelId);
    try {
      let loops = 0;
      do {
        stickyPendingChannels.delete(channelId);
        await processStickyChannel(channel, stickyText, clientUserId);
        loops += 1;
      } while (stickyPendingChannels.has(channelId) && loops < 3);

      if (stickyPendingChannels.has(channelId)) {
        stickyPendingChannels.delete(channelId);
        setTimeout(() => {
          const fakeMessage = {
            guild: message.guild,
            channelId,
            channel,
            author: { id: "sticky-retry" },
            client: resolvedClient,
          };
          module.exports.execute(fakeMessage, resolvedClient).catch((error) => {
            logError("deferred retry failed:", error);
          });
        }, 300);
      }
    } finally {
      stickyProcessingChannels.delete(channelId);
    }
  },
};