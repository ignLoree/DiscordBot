async function resolveMessage(message) {
  if (!message?.partial) return message;
  try {
    return await message.fetch();
  } catch {
    return message;
  }
}

function buildSnipePayload(message, channelId) {
  const firstAttachment = message.attachments?.first?.() || null;
  return {
    content: message.content || "Nessun contenuto.",
    authorId: message.author?.id || null,
    authorTag: message.author?.tag || "Sconosciuto",
    channel: message.channel?.toString?.() || `<#${channelId}>`,
    attachment: firstAttachment?.proxyURL || null,
  };
}

module.exports = {
  name: "messageDelete",
  async execute(message, client) {
    if (!message) return;

    const resolved = await resolveMessage(message);
    if (!resolved?.guild) return;
    if (resolved.author?.bot) return;

    const channelId = resolved.channel?.id || resolved.channelId;
    if (!channelId) return;

    client.snipes.set(channelId, buildSnipePayload(resolved, channelId));
  },
};
