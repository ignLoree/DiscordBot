const IDs = require("../Utils/Config/ids");

const STICKY_CONFIG = Object.fromEntries(
  [
    [
      IDs.channels.mudae,
      "**__[Clicca qui per leggere i comandi del bot](<https://discord.com/channels/1329080093599076474/1442569182825681077/1442897267681132616>)_**",
    ],
    [
      IDs.channels.poketwo,
      "**__[Clicca qui per leggere i comandi del bot](https://discord.com/channels/1329080093599076474/1442569184281362552/1470197148674162932)__**",
    ],
    [
      IDs.channels.ship,
      "**__[Clicca qui per leggere i comandi del bot](https://discord.com/channels/1329080093599076474/1469685688814407726/1469686181884072022)__**",
    ],
  ].filter(([channelId, text]) => Boolean(channelId && text)),
);

const lastStickyMessageByChannel = new Map();
const stickyProcessingChannels = new Set();
const stickyPendingChannels = new Set();

function logError(...args) {
  global.logger?.error?.("[stickyChannelLinks]", ...args);
}

async function deletePreviousSticky(channel, stickyText, clientUserId) {
  const trackedId = lastStickyMessageByChannel.get(channel.id);
  if (trackedId) {
    const tracked = await channel.messages.fetch(trackedId).catch(() => null);
    if (tracked && tracked.author?.id === clientUserId) {
      await tracked.delete().catch(() => {});
      return;
    }
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
    lastStickyMessageByChannel.set(channel.id, latestMessage.id);
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
    lastStickyMessageByChannel.set(channel.id, sent.id);
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
