async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred && !interaction.replied) {
      return await interaction.editReply(payload);
    }
    if (interaction.replied) {
      return await interaction.followUp(payload);
    }
    return await interaction.reply(payload);
  } catch (err) {
    if (err?.code === 10062) return null;
  }
  return null;
}

async function safeEditReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }
    return await interaction.reply(payload);
  } catch (err) {
    if (err?.code === 10062) return null;
  }
  return null;
}

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

module.exports = { safeReply, safeEditReply, safeMessageReply, safeChannelSend };
