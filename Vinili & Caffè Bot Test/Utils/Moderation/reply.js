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

function logReplyError(scope, err) {
  if (isUnknownInteractionError(err) || isAlreadyAcknowledgedError(err)) return;
  if (global?.logger?.error) global.logger.error(`[REPLY:${scope}]`, err);
}

async function safeReply(interaction, payload) {
  if (!interaction) return null;
  if (interaction.deferred && !interaction.replied) {
    try {
      return await interaction.editReply(sanitizeEditPayload(payload));
    } catch (err) {
      if (isUnknownInteractionError(err)) return null;
      logReplyError('editReply', err);
      try {
        return await interaction.followUp(payload);
      } catch (e) {
        if (isUnknownInteractionError(e)) return null;
        try {
          return await interaction.reply(payload);
        } catch (e2) {
          return null;
        }
      }
    }
  }
  if (interaction.replied) {
    try {
      return await interaction.followUp(payload);
    } catch (err) {
      if (isUnknownInteractionError(err)) return null;
      return null;
    }
  }
  try {
    return await interaction.reply(payload);
  } catch (err) {
    if (isUnknownInteractionError(err)) return null;
    logReplyError('reply', err);
    return null;
  }
}

async function safeEditReply(interaction, payload) {
  if (!interaction) return null;
  if (!interaction.deferred && !interaction.replied) return safeReply(interaction, payload);
  try {
    return await interaction.editReply(sanitizeEditPayload(payload));
  } catch (err) {
    if (isUnknownInteractionError(err)) return null;
    return safeReply(interaction, payload);
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
    if (message.channel?.send) {
      try {
        return await message.channel.send(stripMessageReference(payload));
      } catch (e) {
        logReplyError('safeMessageReply', e);
        return null;
      }
    }
    return null;
  }
}

module.exports = { safeReply, safeEditReply, safeMessageReply };
