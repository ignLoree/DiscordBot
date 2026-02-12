const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

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

function extractCustomIdsFromComponents(components = []) {
  const ids = new Set();
  for (const row of components || []) {
    const rowJson = typeof row?.toJSON === 'function' ? row.toJSON() : row;
    const children = Array.isArray(rowJson?.components) ? rowJson.components : [];
    for (const component of children) {
      const id = component?.custom_id || component?.customId || null;
      if (id) ids.add(String(id));
    }
  }
  return ids;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildEmbedSignatureFromPayload(payloadEmbeds = []) {
  const first = Array.isArray(payloadEmbeds) ? payloadEmbeds[0] : null;
  const json = typeof first?.toJSON === 'function' ? first.toJSON() : first;
  if (!json) return '';
  return normalizeText(`${json.title || ''}|${json.description || ''}`).slice(0, 400);
}

function buildEmbedSignatureFromMessage(msgEmbeds = []) {
  const first = Array.isArray(msgEmbeds) ? msgEmbeds[0] : null;
  if (!first) return '';
  return normalizeText(`${first.title || ''}|${first.description || ''}`).slice(0, 400);
}

function hashBuffer(bufferLike) {
  const buffer = Buffer.isBuffer(bufferLike) ? bufferLike : Buffer.from(bufferLike);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function resolvePayloadFileName(file) {
  const json = typeof file?.toJSON === 'function' ? file.toJSON() : file;
  const explicitName = file?.name || file?.data?.name || json?.name || null;
  if (explicitName) return String(explicitName);

  const src = file?.attachment ?? file;
  if (typeof src === 'string') {
    const normalized = src.replace(/\\/g, '/');
    return normalized.split('/').pop() || null;
  }
  return null;
}

function readPayloadFileBuffer(file) {
  const src = file?.attachment ?? file;
  if (Buffer.isBuffer(src)) return src;
  if (src instanceof Uint8Array) return Buffer.from(src);
  if (typeof src === 'string' && fs.existsSync(src)) {
    try {
      return fs.readFileSync(src);
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchAttachmentHash(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
    return hashBuffer(Buffer.from(res.data));
  } catch {
    return null;
  }
}

async function shouldEditMessage(message, { embeds = [], components = [], files = [], attachmentName = null }) {
  const currentEmbeds = toComparableJson(message?.embeds || []);
  const nextEmbeds = toComparableJson(embeds);
  if (currentEmbeds !== nextEmbeds) return true;

  const currentComponents = toComparableJson(message?.components || []);
  const nextComponents = toComparableJson(components);
  if (currentComponents !== nextComponents) return true;

  const payloadFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  if (payloadFiles.length > 0) {
    const currentAttachments = [...(message?.attachments?.values?.() || [])];
    if (currentAttachments.length !== payloadFiles.length) return true;

    for (const payloadFile of payloadFiles) {
      const expectedName = resolvePayloadFileName(payloadFile);
      if (!expectedName) return true;
      const currentAttachment = currentAttachments.find((a) => String(a?.name || '') === expectedName);
      if (!currentAttachment) return true;

      const payloadBuffer = readPayloadFileBuffer(payloadFile);
      if (!payloadBuffer) continue;

      if (Number.isFinite(currentAttachment?.size) && currentAttachment.size !== payloadBuffer.length) {
        return true;
      }

      const payloadHash = hashBuffer(payloadBuffer);
      const currentHash = await fetchAttachmentHash(currentAttachment?.url);
      if (!currentHash || currentHash !== payloadHash) return true;
    }
    return false;
  }

  if (attachmentName) {
    if ((message?.attachments?.size || 0) !== 1) return true;
    const currentName = message.attachments.first()?.name || null;
    if (currentName !== attachmentName) return true;
  }

  return false;
}

async function upsertPanelMessage(channel, client, payload) {
  const messages = await channel.messages.fetch({ limit: 80 }).catch(() => null);
  const botMessages = messages
    ? [...messages.values()].filter((msg) => msg.author?.id === client.user?.id && msg.embeds?.length)
    : [];

  const payloadCustomIds = extractCustomIdsFromComponents(payload?.components || []);
  const payloadSignature = buildEmbedSignatureFromPayload(payload?.embeds || []);

  let existing = null;

  if (payloadCustomIds.size > 0) {
    existing = botMessages.find((msg) => {
      const msgCustomIds = extractCustomIdsFromComponents(msg.components || []);
      if (!msgCustomIds.size) return false;
      for (const id of payloadCustomIds) {
        if (!msgCustomIds.has(id)) return false;
      }
      return true;
    }) || null;
  }

  if (!existing && payloadSignature) {
    existing = botMessages.find((msg) => buildEmbedSignatureFromMessage(msg.embeds || []) === payloadSignature) || null;
  }

  if (!existing) {
    existing = botMessages.find((msg) => msg.author?.id === client.user?.id && msg.embeds?.length) || null;
  }

  if (!existing) {
    await channel.send(payload).catch(() => {});
    return;
  }
  if (await shouldEditMessage(existing, payload)) {
    await existing.edit(payload).catch(() => {});
  }
}

module.exports = { shouldEditMessage, upsertPanelMessage };
