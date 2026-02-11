module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    if (!message) return;
    let msg = message;
    try {
      if (message.partial) {
        msg = await message.fetch();
      }
    } catch {
      msg = message;
    }
    if (!msg.guild) return;
    if (msg.author?.bot) return;
    const channelId = msg.channel?.id || msg.channelId;
    if (!channelId) return;
    client.snipes.set(channelId, {
      content: msg.content || 'Nessun contenuto.',
      authorId: msg.author?.id || null,
      authorTag: msg.author?.tag || 'Sconosciuto',
      channel: msg.channel?.toString?.() || `<#${channelId}>`,
      attachment: msg.attachments?.first?.() ? msg.attachments.first().proxyURL : null
    });
  }
};
