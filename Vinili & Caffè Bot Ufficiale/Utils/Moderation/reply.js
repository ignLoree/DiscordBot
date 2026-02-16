function sanitizeEditPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, 'flags')) return payload;
  const next = { ...payload };
  delete next.flags;
  return next;
}

function isUnknownInteractionError(err) {
  return err?.code === 10062;
}

function isAlreadyAcknowledgedError(err) {
  return err?.code === 40060;
}

function isInteractionNotRepliedError(err) {
  return err?.code === 'InteractionNotReplied';
}

function stripMessageReference(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const next = { ...payload };
  delete next.reply;
  delete next.messageReference;
  delete next.failIfNotExists;
  if (next.allowedMentions && typeof next.allowedMentions === 'object') {
    next.allowedMentions = { ...next.allowedMentions, repliedUser: false };
  }
  return next;
}

function isUnknownMessageReferenceError(err) {
  return err?.code === 50035 && Boolean(err?.rawError?.errors?.message_reference);
}

function logReplyError(scope, err) {
  if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return;
  if (global?.logger?.error) {
    global.logger.error(`[REPLY:${scope}]`, err);
  }
}

async function safeReply(interaction, payload) {
  if (!interaction) return null;

  if (interaction.deferred && !interaction.replied) {
    try {
      return await interaction.editReply(sanitizeEditPayload(payload));
    } catch (err) {
      if (isUnknownInteractionError(err)) return null;
      logReplyError('editReply(primary)', err);
      if (interaction.deferred || interaction.replied) {
        try {
          return await interaction.followUp(payload);
        } catch (followUpErr) {
          if (isUnknownInteractionError(followUpErr) || isAlreadyAcknowledgedError(followUpErr)) return null;
          logReplyError('followUp(fallback)', followUpErr);
        }
      }
      try {
        return await interaction.reply(payload);
      } catch (replyErr) {
        if (isUnknownInteractionError(replyErr) || isAlreadyAcknowledgedError(replyErr)) return null;
        logReplyError('reply(final-fallback)', replyErr);
        return null;
      }
    }
  }

  if (interaction.replied) {
    try {
      return await interaction.followUp(payload);
    } catch (err) {
      if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return null;
      logReplyError('followUp(primary)', err);
      return null;
    }
  }

  try {
    return await interaction.reply(payload);
  } catch (err) {
    if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return null;
    logReplyError('reply(primary)', err);
    return null;
  }
}

async function safeEditReply(interaction, payload) {
  if (!interaction) return null;

  if (!interaction.deferred && !interaction.replied) {
    return safeReply(interaction, payload);
  }

  if (interaction.deferred || interaction.replied) {
    try {
      return await interaction.editReply(sanitizeEditPayload(payload));
    } catch (err) {
      if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return null;
      if (isInteractionNotRepliedError(err)) {
        return safeReply(interaction, payload);
      }
      logReplyError('editReply(primary)', err);
      if (interaction.deferred || interaction.replied) {
        try {
          return await interaction.followUp(payload);
        } catch (followUpErr) {
          if (isUnknownInteractionError(followUpErr) || isAlreadyAcknowledgedError(followUpErr)) return null;
          logReplyError('followUp(fallback)', followUpErr);
        }
      }
      try {
        return await interaction.reply(payload);
      } catch (replyErr) {
        if (isUnknownInteractionError(replyErr) || isAlreadyAcknowledgedError(replyErr)) return null;
        logReplyError('reply(final-fallback)', replyErr);
        return null;
      }
    }
  }

  try {
    return await interaction.reply(payload);
  } catch (err) {
    if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return null;
    logReplyError('reply(fallback)', err);
    return null;
  }
}

async function safeMessageReply(message, payload) {
  if (!message) return null;
  if (typeof message.reply !== 'function') {
    if (message.channel?.send) {
      try {
        return await message.channel.send(stripMessageReference(payload));
      } catch (err) {
        if (err?.code === 10008) return null;
        logReplyError('message.channel.send(fallback)', err);
        return null;
      }
    }
    return null;
  }
  try {
    return await message.reply(payload);
  } catch (err) {
    if (err?.code === 10008) return null;
    if (isUnknownMessageReferenceError(err)) {
      try {
        return await message.channel.send(stripMessageReference(payload));
      } catch (fallbackErr) {
        if (fallbackErr?.code === 10008) return null;
        logReplyError('message.reply(reference-fallback)', fallbackErr);
        return null;
      }
    }
    logReplyError('message.reply', err);
  }
  return null;
}

async function safeChannelSend(channel, payload) {
  if (!channel) return null;
  try {
    return await channel.send(payload);
  } catch (err) {
    if (err?.code === 10008) return null;
    if (isUnknownMessageReferenceError(err)) {
      try {
        return await channel.send(stripMessageReference(payload));
      } catch (fallbackErr) {
        if (fallbackErr?.code === 10008) return null;
        logReplyError('channel.send(reference-fallback)', fallbackErr);
        return null;
      }
    }
    logReplyError('channel.send', err);
  }
  return null;
}

module.exports = { safeReply, safeEditReply, safeMessageReply, safeChannelSend };
