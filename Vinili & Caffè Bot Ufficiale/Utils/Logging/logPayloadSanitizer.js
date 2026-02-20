const { BaseGuildTextChannel, ThreadChannel } = require("discord.js");
const IDs = require("../Config/ids");

const PLACEHOLDER_SNIPPETS = [
  "sconosciuto",
  "unknown",
  "nessuno",
  "nessuna",
  "none",
  "n/a",
  "n\\a",
  "n/d",
  "no reason specified",
  "[ nessuno ]",
  "audit missing",
  "-",
  "—",
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[`*_~[\]()>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceholderValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  return PLACEHOLDER_SNIPPETS.some((snippet) => normalized.includes(snippet));
}

function normalizeLine(line) {
  return String(line || "")
    .replace(/\s+$/g, "")
    .replace(/^\s+/g, "");
}

function shouldDropDescriptionLine(line) {
  const normalized = normalizeLine(line);
  if (!normalized) return false;
  if (isPlaceholderValue(normalized)) return true;

  const plain = normalizeText(normalized);
  if (plain.includes(":")) {
    const afterColon = plain.split(":").slice(1).join(":").trim();
    if (afterColon && isPlaceholderValue(afterColon)) return true;
  }

  return false;
}

function cleanupDescription(description) {
  const text = String(description || "");
  if (!text.trim()) return undefined;
  const lines = text.split("\n");
  const kept = [];
  for (const line of lines) {
    if (shouldDropDescriptionLine(line)) continue;
    kept.push(line);
  }
  const compact = kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return compact || undefined;
}

function sanitizeEmbedObject(embedLike) {
  const data =
    embedLike && typeof embedLike.toJSON === "function"
      ? embedLike.toJSON()
      : { ...(embedLike || {}) };

  if (!data || typeof data !== "object") return data;

  const out = { ...data };
  if (out.description !== undefined) {
    out.description = cleanupDescription(out.description);
  }

  if (Array.isArray(out.fields)) {
    out.fields = out.fields.filter((field) => {
      const value = String(field?.value || "");
      return !isPlaceholderValue(value);
    });
    if (!out.fields.length) delete out.fields;
  }

  if (out.footer?.text && isPlaceholderValue(out.footer.text)) {
    delete out.footer;
  }
  if (out.author?.name && isPlaceholderValue(out.author.name)) {
    delete out.author;
  }

  return out;
}

function buildLogChannelSet() {
  return new Set(
    [
      IDs.channels.modLogs,
      IDs.channels.activityLogs,
      IDs.channels.joinLeaveLogs,
      IDs.channels.ticketLogs,
      IDs.channels.partnerLogs,
      IDs.channels.channelRolesLogs,
      IDs.channels.logCanaliRuoli,
      IDs.channels.commandLogChannel,
      IDs.channels.errorLogChannel,
    ]
      .filter(Boolean)
      .map((id) => String(id)),
  );
}

function sanitizeLogPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const out = { ...payload };
  if (Array.isArray(out.embeds) && out.embeds.length) {
    out.embeds = out.embeds.map((embed) => sanitizeEmbedObject(embed));
  }
  return out;
}

function patchSend(proto, logChannelIds) {
  if (!proto || typeof proto.send !== "function") return;
  if (proto.__vcOriginalSend) return;
  proto.__vcOriginalSend = proto.send;
  proto.send = function patchedSend(payload, ...rest) {
    const channelId = String(this?.id || "");
    const shouldSanitize = channelId && logChannelIds.has(channelId);
    const nextPayload =
      shouldSanitize && payload && typeof payload === "object"
        ? sanitizeLogPayload(payload)
        : payload;
    return proto.__vcOriginalSend.call(this, nextPayload, ...rest);
  };
}

function installLogPayloadSanitizer() {
  if (global.__vcLogPayloadSanitizerInstalled) return;
  global.__vcLogPayloadSanitizerInstalled = true;
  const logChannelIds = buildLogChannelSet();
  patchSend(BaseGuildTextChannel?.prototype, logChannelIds);
  patchSend(ThreadChannel?.prototype, logChannelIds);
}

module.exports = {
  installLogPayloadSanitizer,
};
