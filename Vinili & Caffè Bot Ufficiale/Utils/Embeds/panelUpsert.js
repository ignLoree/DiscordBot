const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");

const CDN_ATTACHMENT_PATTERN =
  /(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//i;

function normalizeDiscordAttachmentUrl(value) {
  if (typeof value !== "string") return value;
  if (value.startsWith("attachment://")) return value.toLowerCase();

  if (!CDN_ATTACHMENT_PATTERN.test(value)) return value;

  const filenameMatch = value.match(/\/([^/?#]+)(?:\?|#|$)/);
  if (!filenameMatch?.[1]) return value;

  return `attachment://${filenameMatch[1].toLowerCase()}`;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function hashBuffer(bufferLike) {
  const buffer = Buffer.isBuffer(bufferLike)
    ? bufferLike
    : Buffer.from(bufferLike);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function resolvePayloadFileName(file) {
  const json = typeof file?.toJSON === "function" ? file.toJSON() : file;
  const explicitName = file?.name || file?.data?.name || json?.name || null;
  if (explicitName) return String(explicitName);

  const src = file?.attachment ?? file;
  if (typeof src === "string") {
    const normalized = src.replace(/\\/g, "/");
    return normalized.split("/").pop() || null;
  }
  return null;
}

function readPayloadFileBuffer(file) {
  const src = file?.attachment ?? file;
  if (Buffer.isBuffer(src)) return src;
  if (src instanceof Uint8Array) return Buffer.from(src);
  if (typeof src === "string" && fs.existsSync(src)) {
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
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 20000,
    });
    return hashBuffer(Buffer.from(res.data));
  } catch {
    return null;
  }
}

function simplifyEmbed(embed) {
  const raw = typeof embed?.toJSON === "function" ? embed.toJSON() : embed;
  if (!raw || typeof raw !== "object") return null;

  const img = raw.image?.url
    ? normalizeDiscordAttachmentUrl(raw.image.url)
    : null;
  const thumb = raw.thumbnail?.url
    ? normalizeDiscordAttachmentUrl(raw.thumbnail.url)
    : null;
  const author = raw.author
    ? {
        name: normalizeText(raw.author.name),
        icon_url: raw.author.icon_url
          ? normalizeDiscordAttachmentUrl(raw.author.icon_url)
          : null,
        url: raw.author.url ? String(raw.author.url) : null,
      }
    : null;

  const footer = raw.footer
    ? {
        text: normalizeText(raw.footer.text),
        icon_url: raw.footer.icon_url
          ? normalizeDiscordAttachmentUrl(raw.footer.icon_url)
          : null,
      }
    : null;

  const fields = Array.isArray(raw.fields)
    ? raw.fields.map((f) => ({
        name: normalizeText(f?.name),
        value: normalizeText(f?.value),
        inline: Boolean(f?.inline),
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
    fields,
  };
}

function simplifyComponents(components = []) {
  const rows = Array.isArray(components) ? components : [];
  return rows.map((row) => {
    const r = typeof row?.toJSON === "function" ? row.toJSON() : row;
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
            animated: Boolean(c.emoji.animated),
          }
        : null,
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

function scoreEmbedSimilarity(message, payload) {
  const msgFirst =
    simplifyEmbed(Array.isArray(message?.embeds) ? message.embeds[0] : null) || {};
  const nextFirst =
    simplifyEmbed(Array.isArray(payload?.embeds) ? payload.embeds[0] : null) || {};

  let score = 0;

  if (msgFirst.title && nextFirst.title && msgFirst.title === nextFirst.title) score += 6;
  if (
    msgFirst.author?.name &&
    nextFirst.author?.name &&
    msgFirst.author.name === nextFirst.author.name
  ) {
    score += 4;
  }
  if (
    msgFirst.footer?.text &&
    nextFirst.footer?.text &&
    msgFirst.footer.text === nextFirst.footer.text
  ) {
    score += 3;
  }
  if (msgFirst.image && nextFirst.image && msgFirst.image === nextFirst.image) score += 2;
  if (
    msgFirst.thumbnail &&
    nextFirst.thumbnail &&
    msgFirst.thumbnail === nextFirst.thumbnail
  ) {
    score += 2;
  }
  if (
    Number(Array.isArray(message?.embeds) ? message.embeds.length : 0) ===
    Number(Array.isArray(payload?.embeds) ? payload.embeds.length : 0)
  ) {
    score += 1;
  }
  if (
    Number(Array.isArray(message?.components) ? message.components.length : 0) ===
    Number(Array.isArray(payload?.components) ? payload.components.length : 0)
  ) {
    score += 1;
  }

  const msgDesc = normalizeText(msgFirst.description || "").toLowerCase();
  const nextDesc = normalizeText(nextFirst.description || "").toLowerCase();
  if (msgDesc && nextDesc) {
    const msgHead = msgDesc.slice(0, 80);
    const nextHead = nextDesc.slice(0, 80);
    if (msgHead && nextHead && (msgHead === nextHead || msgHead.includes(nextHead) || nextHead.includes(msgHead))) {
      score += 2;
    }
  }

  return score;
}

function extractCustomIdsFromComponents(components = []) {
  const ids = new Set();
  for (const row of components || []) {
    const rowJson = typeof row?.toJSON === "function" ? row.toJSON() : row;
    const children = Array.isArray(rowJson?.components)
      ? rowJson.components
      : [];
    for (const component of children) {
      const id = component?.custom_id || component?.customId || null;
      if (id) ids.add(String(id));
    }
  }
  return ids;
}

function buildStableEmbedIdentity(rawEmbed) {
  if (!rawEmbed || typeof rawEmbed !== "object") return "";
  // Keep identity stable when only descriptive text changes.
  const title = normalizeText(rawEmbed.title || "").toLowerCase();
  const author = normalizeText(rawEmbed.author?.name || "").toLowerCase();
  const footer = normalizeText(rawEmbed.footer?.text || "").toLowerCase();
  const image = normalizeText(
    normalizeDiscordAttachmentUrl(rawEmbed.image?.url || ""),
  ).toLowerCase();
  const thumbnail = normalizeText(
    normalizeDiscordAttachmentUrl(rawEmbed.thumbnail?.url || ""),
  ).toLowerCase();
  const firstField = normalizeText(rawEmbed.fields?.[0]?.name || "").toLowerCase();

  const parts = [title, author, footer, image, thumbnail, firstField].filter(
    Boolean,
  );
  if (!parts.length) return "";
  return parts.join("|").slice(0, 400);
}

function buildEmbedSignatureFromPayload(payloadEmbeds = []) {
  const first = Array.isArray(payloadEmbeds) ? payloadEmbeds[0] : null;
  const raw = typeof first?.toJSON === "function" ? first.toJSON() : first;
  return buildStableEmbedIdentity(raw);
}

function buildEmbedSignatureFromMessage(msgEmbeds = []) {
  const first = Array.isArray(msgEmbeds) ? msgEmbeds[0] : null;
  const raw = typeof first?.toJSON === "function" ? first.toJSON() : first;
  return buildStableEmbedIdentity(raw);
}

async function shouldEditMessage(message, payload) {
  if (!message) return true;

  const currentEmbeds = toComparableEmbeds(message?.embeds || []);
  const nextEmbeds = toComparableEmbeds(payload?.embeds || []);
  if (currentEmbeds !== nextEmbeds) return true;

  const currentComponents = toComparableComponents(message?.components || []);
  const nextComponents = toComparableComponents(payload?.components || []);
  if (currentComponents !== nextComponents) return true;

  return false;
}

async function upsertPanelMessage(channel, client, payload) {
  const messageId = payload?.messageId || null;
  if (messageId) {
    const direct = await channel.messages.fetch(messageId).catch(() => null);
    if (direct) {
      const editPayload = { ...payload };
      delete editPayload.messageId;
      delete editPayload.attachmentName;

      if (await shouldEditMessage(direct, editPayload)) {
        await direct.edit(editPayload).catch((error) => {
          global.logger?.error?.("[panelUpsert] edit by messageId failed:", error);
        });
      }
      return direct;
    }
  }

  const messages = await channel.messages
    .fetch({ limit: 100 })
    .catch(() => null);
  const botMessages = messages
    ? [...messages.values()].filter(
        (msg) => msg.author?.id === client.user?.id && msg.embeds?.length,
      )
    : [];

  const payloadCustomIds = extractCustomIdsFromComponents(
    payload?.components || [],
  );
  const payloadComponentsComparable = toComparableComponents(
    payload?.components || [],
  );
  const payloadSignature = buildEmbedSignatureFromPayload(
    payload?.embeds || [],
  );

  let existing = null;

  if (payloadCustomIds.size > 0) {
    existing =
      botMessages.find((msg) => {
        const msgCustomIds = extractCustomIdsFromComponents(
          msg.components || [],
        );
        if (!msgCustomIds.size) return false;
        for (const id of payloadCustomIds) {
          if (!msgCustomIds.has(id)) return false;
        }
        return true;
      }) || null;
  }

  if (!existing && payloadComponentsComparable && payloadComponentsComparable !== "[]") {
    existing =
      botMessages.find(
        (msg) =>
          toComparableComponents(msg.components || []) ===
          payloadComponentsComparable,
      ) || null;
  }

  if (!existing && payloadSignature) {
    existing =
      botMessages.find(
        (msg) =>
          buildEmbedSignatureFromMessage(msg.embeds || []) === payloadSignature,
      ) || null;
  }

  if (!existing) {
    const payloadEmbedsCount = Array.isArray(payload?.embeds)
      ? payload.embeds.length
      : 0;
    const payloadComponentsCount = Array.isArray(payload?.components)
      ? payload.components.length
      : 0;

    const structuralCandidates = botMessages.filter((msg) => {
      const msgEmbedsCount = Array.isArray(msg?.embeds) ? msg.embeds.length : 0;
      const msgComponentsCount = Array.isArray(msg?.components)
        ? msg.components.length
        : 0;
      return (
        msgEmbedsCount === payloadEmbedsCount &&
        msgComponentsCount === payloadComponentsCount
      );
    });

    if (structuralCandidates.length === 1) {
      existing = structuralCandidates[0];
    }
  }

  if (!existing && botMessages.length) {
    const ranked = botMessages
      .map((msg) => ({ msg, score: scoreEmbedSimilarity(msg, payload) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const at = Number(a.msg?.createdTimestamp || 0);
        const bt = Number(b.msg?.createdTimestamp || 0);
        return bt - at;
      });
    if (ranked[0]?.score >= 3) {
      existing = ranked[0].msg;
    }
  }

  const cleanPayload = { ...payload };
  delete cleanPayload.messageId;
  delete cleanPayload.attachmentName;

  if (!existing) {
    const sent = await channel.send(cleanPayload).catch((error) => {
      global.logger?.error?.("[panelUpsert] send failed:", error);
      return null;
    });
    return sent;
  }

  if (await shouldEditMessage(existing, cleanPayload)) {
    await existing.edit(cleanPayload).catch((error) => {
      global.logger?.error?.("[panelUpsert] edit failed:", error);
    });
  }

  return existing;
}

module.exports = { shouldEditMessage, upsertPanelMessage };
