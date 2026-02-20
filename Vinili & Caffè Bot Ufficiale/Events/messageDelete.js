const { EmbedBuilder, MessageFlagsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");

const MAX_CONTENT_LOG_LENGTH = 1800;
const VERIFICATION_EXCLUDED_CHANNEL_IDS = new Set(
  [IDs.channels.verify, IDs.channels.clickMe].filter(Boolean).map(String),
);

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

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
  const firstEmbed = Array.isArray(message?.embeds) ? message.embeds[0] : null;
  const embedPreview = String(
    firstEmbed?.description ||
      firstEmbed?.title ||
      firstEmbed?.author?.name ||
      "",
  ).trim();
  return {
    content: message.content || embedPreview || "Nessun contenuto.",
    authorId: message.author?.id || null,
    authorTag: message.author?.tag || "Sconosciuto",
    channel: message.channel?.toString?.() || `<#${channelId}>`,
    attachment: firstAttachment?.proxyURL || null,
    isEmbedOnly:
      normalizeText(message?.content || "").length === 0 &&
      !Boolean(message?.attachments?.size) &&
      Array.isArray(message?.embeds) &&
      message.embeds.length > 0,
  };
}

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function hasMessageFlag(message, flag) {
  if (!message) return false;
  try {
    if (typeof message.flags?.has === "function") {
      return Boolean(message.flags.has(flag));
    }
  } catch {
    // fallback below
  }
  const raw = message?.flags?.bitfield ?? message?.flags ?? 0;
  try {
    const bits = typeof raw === "bigint" ? raw : BigInt(raw);
    const target = typeof flag === "bigint" ? flag : BigInt(flag);
    return (bits & target) === target;
  } catch {
    return false;
  }
}

function isTransientInteractionMessage(message) {
  if (!message) return false;
  if (hasMessageFlag(message, MessageFlagsBitField.Flags.Ephemeral)) return true;
  if (hasMessageFlag(message, MessageFlagsBitField.Flags.Loading)) return true;
  return false;
}

function sanitizeDeletedContentForLog(content) {
  let text = String(content || "").replace(/\r\n/g, "\n");
  text = text.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/\n?```$/, "");
  // Remove log-structure lines before emoji normalization.
  text = text
    .replace(
      /(^|\n)\s*(?:<:VC_right_arrow:\d+>|:VC_right_arrow:)\s+\*\*(Channel|Id|Content|Attachments|Author):\*\*[^\n]*/gi,
      "$1",
    )
    .replace(
      /(^|\n)\s*\*\*(Channel|Id|Content|Attachments|Author):\*\*[^\n]*/gi,
      "$1",
    );
  text = text.replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, ":$1:");
  text = text
    .replace(/```+/g, "'''")
    .replace(/`/g, "'")
    .replace(/\u0000/g, "")
    .replace(/(^|\n)\s*:VC_right_arrow:\s+\*\*(Channel|Id|Content|Attachments|Author):\*\*[^\n]*/gi, "$1")
    .replace(/(^|\n)\s*(?:Attachments|Author)\s*:\s*[^\n]*/gi, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return "(vuoto)";
  if (text.length <= MAX_CONTENT_LOG_LENGTH) return text;
  return `${text.slice(0, MAX_CONTENT_LOG_LENGTH - 3)}...`;
}

function buildDeletedDiff(value) {
  const text = sanitizeDeletedContentForLog(value);
  const lines = String(text || "(vuoto)").split("\n");
  const diffBody = lines
    .map((line, index) => `${index === 0 ? "-" : " "} ${line}`)
    .join("\n");
  if (diffBody.length <= MAX_CONTENT_LOG_LENGTH) return diffBody;
  return `${diffBody.slice(0, MAX_CONTENT_LOG_LENGTH - 3)}...`;
}

function collectAttachmentNames(message) {
  const names = [];
  const attachments = message?.attachments;
  if (!attachments) return names;
  for (const item of attachments.values()) {
    const name = String(item?.name || "").trim();
    if (name) names.push(name);
  }
  return names;
}

function firstImageAttachment(message) {
  const attachments = message?.attachments;
  if (!attachments) return null;
  for (const item of attachments.values()) {
    const contentType = String(item?.contentType || "").toLowerCase();
    if (contentType.startsWith("image/")) return item;
    const name = String(item?.name || "").toLowerCase();
    if (/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(name)) return item;
  }
  return null;
}

function buildAuthorLabel(message) {
  const author = message?.author;
  if (!author) return "sconosciuto";
  const flags = [];
  if (author?.bot) flags.push("BOT");
  if (message?.webhookId) flags.push("WEBHOOK");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  return `${author}${suffix} \`${author.id}\``;
}

function hasMeaningfulDeleteData(message) {
  if (!message) return false;
  if (isTransientInteractionMessage(message)) return false;
  const content = normalizeText(message.content || "");
  const hasContent = content.length > 0;
  const hasAttachments = Boolean(message.attachments?.size);
  const hasMessageId = Boolean(message.id);
  // Embed-only deletes are skipped: embed payload is often not reliably visible.
  return (hasContent || hasAttachments) && hasMessageId;
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function sendDeleteLog(message) {
  const guild = message?.guild;
  if (!guild) return;
  if (
    VERIFICATION_EXCLUDED_CHANNEL_IDS.has(
      String(message?.channelId || message?.channel?.id || ""),
    )
  ) {
    return;
  }

  const logChannel = await resolveLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;

  const content = String(message?.content || "");
  const attachmentNames = collectAttachmentNames(message);
  const hasContent = normalizeText(content).length > 0;
  const hasAttachments = attachmentNames.length > 0;

  const lines = [
    `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
    "",
    "**Previous Settings**",
    `<:VC_right_arrow:1473441155055096081> **Channel:** ${message.channel || "#sconosciuto"}`,
    `<:VC_right_arrow:1473441155055096081> **Id:** \`${message.id || "sconosciuto"}\``,
  ];

  lines.push("<:VC_right_arrow:1473441155055096081> **Content:**");
  lines.push("```diff");
  lines.push(buildDeletedDiff(hasContent ? content : "(vuoto)"));
  lines.push("```");
  lines.push(
    `<:VC_right_arrow:1473441155055096081> **Attachments:** ${hasAttachments ? `[ ${attachmentNames.join(", ")} ]` : "[ nessuno ]"}`,
  );
  if (message?.author) {
    lines.push(
      `<:VC_right_arrow:1473441155055096081> **Author:** ${buildAuthorLabel(message)}`,
    );
  }

  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setTitle("Message Deleted")
    .setDescription(lines.join("\n"));

  const preview = firstImageAttachment(message);
  if (preview?.url) {
    embed.setImage(preview.url);
  }

  await logChannel.send({ embeds: [embed] });
}

module.exports = {
  name: "messageDelete",
  async execute(message, client) {
    try {
      if (!message) return;
      const resolvedClient = client || message.client;

      const resolved = await resolveMessage(message);
      if (!resolved?.guild) return;
      if (!hasMeaningfulDeleteData(resolved)) return;

      await sendDeleteLog(resolved);

      const channelId = resolved.channel?.id || resolved.channelId;
      if (!channelId || !resolvedClient) return;
      if (!resolvedClient.snipes) resolvedClient.snipes = new Map();

      const payload = buildSnipePayload(resolved, channelId);
      const existing = resolvedClient.snipes.get(channelId);
      const history = Array.isArray(existing)
        ? existing.slice(0, 9)
        : existing
          ? [existing]
          : [];
      history.unshift(payload);
      resolvedClient.snipes.set(channelId, history.slice(0, 10));
    } catch (error) {
      global.logger?.error?.("[messageDelete] failed:", error);
    }
  },
};
