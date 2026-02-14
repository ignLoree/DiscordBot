const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

const CDN_ATTACHMENT_PATTERN = /(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//i;

function normalizeDiscordAttachmentUrl(value) {
  if (typeof value !== 'string') return value;
  if (value.startsWith('attachment://')) return value.toLowerCase();

  if (!CDN_ATTACHMENT_PATTERN.test(value)) return value;

  const filenameMatch = value.match(/\/([^/?#]+)(?:\?|#|$)/);
  if (!filenameMatch?.[1]) return value;

  return `attachment://${filenameMatch[1].toLowerCase()}`;
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
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

function simplifyEmbed(embed) {
  const raw = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed;
  if (!raw || typeof raw !== 'object') return null;

  const img = raw.image?.url ? normalizeDiscordAttachmentUrl(raw.image.url) : null;
  const thumb = raw.thumbnail?.url ? normalizeDiscordAttachmentUrl(raw.thumbnail.url) : null;
  const author = raw.author
    ? {
        name: normalizeText(raw.author.name),
        icon_url: raw.author.icon_url ? normalizeDiscordAttachmentUrl(raw.author.icon_url) : null,
        url: raw.author.url ? String(raw.author.url) : null
      }
    : null;

  const footer = raw.footer
    ? {
        text: normalizeText(raw.footer.text),
        icon_url: raw.footer.icon_url ? normalizeDiscordAttachmentUrl(raw.footer.icon_url) : null
      }
    : null;

  const fields = Array.isArray(raw.fields)
    ? raw.fields.map((f) => ({
        name: normalizeText(f?.name),
        value: normalizeText(f?.value),
        inline: Boolean(f?.inline)
      }))
    : [];

  return {
    title: normalizeText(raw.title),
    description: normalizeText(raw.description),
    color: Number.isFinite(raw.color) ? raw.color : null,
    url: raw.url ? String(raw.url) : null,
    image: img,
    thumbnail: thumb,
    author,
    footer,
    fields
  };
}

function simplifyComponents(components = []) {
  const rows = Array.isArray(components) ? components : [];
  return rows.map((row) => {
    const r = typeof row?.toJSON === 'function' ? row.toJSON() : row;
    const children = Array.isArray(r?.components) ? r.components : [];
    return children.map((c) => ({
      type: c?.type ?? null,
      style: c?.style ?? null,
      custom_id: c?.custom_id || c?.customId || null,
      label: normalizeText(c?.label),
      url: c?.url ? String(c.url) : null,
      disabled: Boolean(c?.disabled),
      emoji: c?.emoji
        ? {
            id: c.emoji.id ? String(c.emoji.id) : null,
            name: c.emoji.name ? String(c.emoji.name) : null,
            animated: Boolean(c.emoji.animated)
          }
        : null
    }));
  });
}

function toComparableEmbeds(embeds = []) {
  const arr = Array.isArray(embeds) ? embeds : [];
  return JSON.stringify(arr.map(simplifyEmbed).filter(Boolean));
}

function toComparableComponents(components = []) {
  return JSON.stringify(simplifyComponents(components));
}

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

function buildEmbedSignatureFromPayload(payloadEmbeds = []) {
  const first = Array.isArray(payloadEmbeds) ? payloadEmbeds[0] : null;
  const raw = typeof first?.toJSON === 'function' ? first.toJSON() : first;
  if (!raw) return '';
  return normalizeText(`${raw.title || ''}|${raw.description || ''}`).toLowerCase().slice(0, 400);
}

function buildEmbedSignatureFromMessage(msgEmbeds = []) {
  const first = Array.isArray(msgEmbeds) ? msgEmbeds[0] : null;
  if (!first) return '';
  return normalizeText(`${first.title || ''}|${first.description || ''}`).toLowerCase().slice(0, 400);
}

function normalizeEmbed(e) {
  if (!e) return null;

  return {
    title: e.title || null,
    description: e.description || null,
    color: e.color || null,
    footer: e.footer?.text || null,
    author: e.author?.name || null,
    image: e.image?.url || null,
    thumbnail: e.thumbnail?.url || null,
    fields: Array.isArray(e.fields)
      ? e.fields.map(f => ({
          name: f.name,
          value: f.value,
          inline: !!f.inline
        }))
      : []
  };
}

function normalizeComponents(rows = []) {
  return rows.map(row => ({
    components: row.components.map(c => ({
      type: c.type,
      customId: c.customId || null,
      label: c.label || null,
      style: c.style || null,
      url: c.url || null,
      emoji: c.emoji?.id || c.emoji?.name || null
    }))
  }));
}

async function shouldEditMessage(message, payload) {
  if (!message) return true;

  const oldEmbed = normalizeEmbed(message.embeds?.[0]);
  const newEmbed = normalizeEmbed(payload.embeds?.[0]);

  const oldComponents = normalizeComponents(message.components || []);
  const newComponents = normalizeComponents(payload.components || []);

  const embedChanged = JSON.stringify(oldEmbed) !== JSON.stringify(newEmbed);
  const componentsChanged = JSON.stringify(oldComponents) !== JSON.stringify(newComponents);

  return embedChanged || componentsChanged;
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
    existing =
      botMessages.find((msg) => {
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