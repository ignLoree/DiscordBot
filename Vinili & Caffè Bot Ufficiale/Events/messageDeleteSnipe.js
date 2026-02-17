const { EmbedBuilder } = require("discord.js");
const IDs = require("../Utils/Config/ids");

const MAX_DIFF_LENGTH = 1800;

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

function formatDeleteDate(date = new Date()) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Rome",
  }).format(date);
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
  if (!hasContent && !hasAttachments) return;

  const lines = [
    `▸ ${formatDeleteDate(new Date())}`,
    "",
    "**Previous Settings**",
    `▸ **Channel:** ${message.channel || "#sconosciuto"}`,
    `▸ **Id:** ${message.id || "sconosciuto"}`,
  ];

  if (hasContent) {
    lines.push("▸ **Content:**");
    lines.push("```diff");
    lines.push(buildDeletedDiff(content));
    lines.push("```");
  }

  if (hasAttachments) {
    lines.push(
      `▸ **Attachments:** [ ${attachmentNames.join(", ")} ]`,
    );
  }

  if (message?.author) {
    lines.push(`▸ **Author:** ${message.author} \`${message.author.id}\``);
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

    await sendDeleteLog(resolved);
    if (resolved.author?.bot) return;

    const channelId = resolved.channel?.id || resolved.channelId;
    if (!channelId) return;

    client.snipes.set(channelId, buildSnipePayload(resolved, channelId));
  },
};
