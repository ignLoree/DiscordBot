const CDN_ATTACHMENT_PATTERN = /(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//i;

function normalizeDiscordAttachmentUrl(value) {
  if (typeof value !== 'string') return value;
  if (value.startsWith('attachment://')) {
    return value.toLowerCase();
  }
  if (!CDN_ATTACHMENT_PATTERN.test(value)) {
    return value;
  }
  const filenameMatch = value.match(/\/([^/?#]+)(?:\?|#|$)/);
  if (!filenameMatch?.[1]) return value;
  return `attachment://${filenameMatch[1].toLowerCase()}`;
}

function normalizeComparable(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeComparable);
  }
  if (!value || typeof value !== 'object') {
    return normalizeDiscordAttachmentUrl(value);
  }

  const normalized = {};
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, raw] of entries) {
    if (key === 'proxy_url' || key === 'proxyURL' || key === 'id') continue;
    normalized[key] = normalizeComparable(raw);
  }
  return normalized;
}

const toComparableJson = (items = []) => JSON.stringify(
  items.map((item) => normalizeComparable(typeof item?.toJSON === 'function' ? item.toJSON() : item))
);

function shouldEditMessage(message, { embeds = [], components = [], attachmentName = null }) {
  const currentEmbeds = toComparableJson(message?.embeds || []);
  const nextEmbeds = toComparableJson(embeds);
  if (currentEmbeds !== nextEmbeds) return true;

  const currentComponents = toComparableJson(message?.components || []);
  const nextComponents = toComparableJson(components);
  if (currentComponents !== nextComponents) return true;

  if (attachmentName) {
    if ((message?.attachments?.size || 0) !== 1) return true;
    const currentName = message.attachments.first()?.name || null;
    if (currentName !== attachmentName) return true;
  }

  return false;
}

async function upsertPanelMessage(channel, client, payload) {
  const messages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  const existing = messages?.find((msg) => msg.author?.id === client.user?.id && msg.embeds?.length);
  if (!existing) {
    await channel.send(payload).catch(() => {});
    return;
  }
  if (shouldEditMessage(existing, payload)) {
    await existing.edit(payload).catch(() => {});
  }
}

module.exports = { shouldEditMessage, upsertPanelMessage };
