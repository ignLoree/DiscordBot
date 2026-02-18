const { EmbedBuilder } = require("discord.js");
const IDs = require("../Utils/Config/ids");

const MAX_DIFF_LENGTH = 1800;

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
  return {
    content: message.content || "Nessun contenuto.",
    authorId: message.author?.id || null,
    authorTag: message.author?.tag || "Sconosciuto",
    channel: message.channel?.toString?.() || `<#${channelId}>`,
    attachment: firstAttachment?.proxyURL || null,
  };
}

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function buildDeletedDiff(content) {
  const text = normalizeText(content);
  const raw = text ? `- ${text}` : "- (vuoto)";
  if (raw.length <= MAX_DIFF_LENGTH) return raw;
  return `${raw.slice(0, MAX_DIFF_LENGTH - 3)}...`;
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
  const content = normalizeText(message.content || "");
  const hasContent = content.length > 0;
  const hasAttachments = Boolean(message.attachments?.size);
  const hasEmbeds = Array.isArray(message.embeds) && message.embeds.length > 0;
  const hasAuthor = Boolean(message.author?.id);
  const hasMessageId = Boolean(message.id);
  // Skip ghost/partial deletes with no readable payload.
  return (hasContent || hasAttachments || hasEmbeds || hasAuthor) && hasMessageId;
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

  if (hasContent) {
    lines.push("<:VC_right_arrow:1473441155055096081> **Content:**");
    lines.push("```diff");
    lines.push(buildDeletedDiff(content));
    lines.push("```");
  } else {
    lines.push("<:VC_right_arrow:1473441155055096081> **Content:** `(vuoto)`");
  }

  if (hasAttachments) {
    lines.push(
      `<:VC_right_arrow:1473441155055096081> **Attachments:** [ ${attachmentNames.join(", ")} ]`,
    );
  } else {
    lines.push("<:VC_right_arrow:1473441155055096081> **Attachments:** `[ nessuno ]`");
  }

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

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  name: "messageDelete",
  async execute(message, client) {
    if (!message) return;

    const resolved = await resolveMessage(message);
    if (!resolved?.guild) return;
    if (!hasMeaningfulDeleteData(resolved)) return;

    await sendDeleteLog(resolved);

    const channelId = resolved.channel?.id || resolved.channelId;
    if (!channelId) return;

    client.snipes.set(channelId, buildSnipePayload(resolved, channelId));
  },
};



