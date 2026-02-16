const IDs = require('../Utils/Config/ids');

const STICKY_CONFIG = {
  [IDs.channels.mudae]: '**__[Clicca qui per leggere i comandi del bot](<https://discord.com/channels/1329080093599076474/1442569182825681077/1442897267681132616>)_**',
  [IDs.channels.poketwo]: '**__[Clicca qui per leggere i comandi del bot](https://discord.com/channels/1329080093599076474/1442569184281362552/1470197148674162932)__**',
  [IDs.channels.ship]: '**__[Clicca qui per leggere i comandi del bot](https://discord.com/channels/1329080093599076474/1469685688814407726/1469686181884072022)__**'
};

const lastStickyMessageByChannel = new Map();
const stickyProcessingChannels = new Set();

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
    (msg) => msg.author?.id === clientUserId && String(msg.content || '').trim() === stickyText
  );
  if (oldSticky) {
    await oldSticky.delete().catch(() => {});
  }
}

async function collapseStickyMessages(channel, stickyText, clientUserId, keepMessageId = null) {
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!recent?.size) return;
  const matching = recent
    .filter((msg) => msg.author?.id === clientUserId && String(msg.content || '').trim() === stickyText)
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  if (!matching.size) return;

  let keepId = keepMessageId;
  if (!keepId) {
    keepId = matching.first()?.id || null;
  }
  for (const msg of matching.values()) {
    if (msg.id === keepId) continue;
    await msg.delete().catch(() => {});
  }
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (!message?.guild || !message.channelId) return;
    if (message.author?.id === client.user?.id) return;

    const stickyText = STICKY_CONFIG[message.channelId];
    if (!stickyText) return;
    if (stickyProcessingChannels.has(message.channelId)) return;

    const channel = message.channel;
    stickyProcessingChannels.add(message.channelId);
    try {
      await deletePreviousSticky(channel, stickyText, client.user.id);

      const latest = await channel.messages.fetch({ limit: 1 }).catch(() => null);
      const latestMessage = latest?.first();
      if (
        latestMessage &&
        latestMessage.author?.id === client.user.id &&
        String(latestMessage.content || '').trim() === stickyText
      ) {
        lastStickyMessageByChannel.set(channel.id, latestMessage.id);
        await collapseStickyMessages(channel, stickyText, client.user.id, latestMessage.id);
        return;
      }

      const sent = await channel.send({ content: stickyText }).catch(() => null);
      if (sent) {
        lastStickyMessageByChannel.set(channel.id, sent.id);
        await collapseStickyMessages(channel, stickyText, client.user.id, sent.id);
      }
    } finally {
      stickyProcessingChannels.delete(message.channelId);
    }
  }
};
