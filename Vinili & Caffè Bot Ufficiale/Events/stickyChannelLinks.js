const STICKY_CONFIG = {
  '1442569182825681077': '[Clicca qui per leggere i comandi del bot](<https://discord.com/channels/1329080093599076474/1442569182825681077/1442897267681132616>)',
  '1442569184281362552': 'https://discord.com/channels/1329080093599076474/1442569184281362552/1470197148674162932',
  '1469685688814407726': 'https://discord.com/channels/1329080093599076474/1469685688814407726/1469686181884072022'
};

const lastStickyMessageByChannel = new Map();

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

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (!message?.guild || !message.channelId) return;
    if (message.author?.id === client.user?.id) return;

    const stickyText = STICKY_CONFIG[message.channelId];
    if (!stickyText) return;

    const channel = message.channel;
    await deletePreviousSticky(channel, stickyText, client.user.id);

    const sent = await channel.send({ content: stickyText }).catch(() => null);
    if (sent) {
      lastStickyMessageByChannel.set(channel.id, sent.id);
    }
  }
};
