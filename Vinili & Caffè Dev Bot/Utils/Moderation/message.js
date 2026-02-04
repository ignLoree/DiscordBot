async function safeMessageReply(message, payload) {
  if (!message) return null;
  try {
    return await message.reply(payload);
  } catch (err) {
    if (err?.code === 10008) return null;
  }
  return null;
}

async function safeChannelSend(channel, payload) {
  if (!channel) return null;
  try {
    return await channel.send(payload);
  } catch (err) {
    if (err?.code === 10008) return null;
  }
  return null;
}

module.exports = { safeMessageReply, safeChannelSend };
