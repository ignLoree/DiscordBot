const {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { runAutoModMessage } = require("../Services/Moderation/automodService");

const MAX_EMBED_DIFF_LENGTH = 900;
const VERIFICATION_EXCLUDED_CHANNEL_IDS = new Set(
  [IDs.channels.verify, IDs.channels.clickMe].filter(Boolean).map(String),
);

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function collectAttachmentNames(message) {
  const names = [];
  const attachments = message?.attachments;
  if (!attachments) return names;
  for (const item of attachments.values()) {
    const name = String(item?.name || "").trim();
    if (name) names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

function buildSimpleDiff(before, after) {
  const prev = normalizeText(before);
  const next = normalizeText(after);
  if (!prev && !next) return "";
  return [
    prev ? `- ${prev}` : "- (vuoto)",
    next ? `+ ${next}` : "+ (vuoto)",
  ].join("\n");
}

function attachmentsChanged(beforeNames, afterNames) {
  if (beforeNames.length !== afterNames.length) return true;
  for (let i = 0; i < beforeNames.length; i += 1) {
    if (beforeNames[i] !== afterNames[i]) return true;
  }
  return false;
}

function formatAttachmentsChange(beforeNames, afterNames) {
  const oldLabel = beforeNames.length
    ? `[ ${beforeNames.join(", ")} ]`
    : "[ nessuno ]";
  const newLabel = afterNames.length
    ? `[ ${afterNames.join(", ")} ]`
    : "[ nessuno ]";
  return `${oldLabel} -> ${newLabel}`;
}

function buildEditLogText(previous, updated, beforeNames, afterNames) {
  const oldContent = String(previous?.content || "");
  const newContent = String(updated?.content || "");
  const oldAttachments = beforeNames.length
    ? beforeNames.join(", ")
    : "nessuno";
  const newAttachments = afterNames.length
    ? afterNames.join(", ")
    : "nessuno";

  return [
    "------ MESSAGE EDIT LOG ------",
    `Guild: ${updated?.guild?.name || "sconosciuto"} (${updated?.guild?.id || "-"})`,
    `Channel: #${updated?.channel?.name || "sconosciuto"} (${updated?.channelId || "-"})`,
    `Message ID: ${updated?.id || "-"}`,
    `Author: ${updated?.author?.tag || "sconosciuto"} (${updated?.author?.id || "-"})`,
    `Edited At: ${toDiscordTimestamp(new Date(), "F")}`,
    "",
    "[OLD CONTENT]",
    oldContent || "(vuoto)",
    "",
    "[NEW CONTENT]",
    newContent || "(vuoto)",
    "",
    "[ATTACHMENTS]",
    `OLD: ${oldAttachments}`,
    `NEW: ${newAttachments}`,
    "",
  ].join("\n");
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

function isHttpUrl(value) {
  const text = String(value || "").trim();
  return /^https?:\/\/\S+$/i.test(text);
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function sendMessageEditLog(previous, updated) {
  if (!updated?.guild || !updated?.author) return;
  if (
    VERIFICATION_EXCLUDED_CHANNEL_IDS.has(
      String(updated?.channelId || updated?.channel?.id || ""),
    )
  ) {
    return;
  }
  const logChannel = await resolveLogChannel(updated.guild);
  if (!logChannel?.isTextBased?.()) return;

  const beforeContent = String(previous?.content || "");
  const afterContent = String(updated?.content || "");
  const beforeNames = collectAttachmentNames(previous);
  const afterNames = collectAttachmentNames(updated);

  const contentChanged = normalizeText(beforeContent) !== normalizeText(afterContent);
  const filesChanged = attachmentsChanged(beforeNames, afterNames);
  if (!contentChanged && !filesChanged) return;

  const actorFlags = [];
  if (updated?.author?.bot) actorFlags.push("BOT");
  if (updated?.webhookId) actorFlags.push("WEBHOOK");
  const actorSuffix = actorFlags.length ? ` [${actorFlags.join("/")}]` : "";

  const lines = [
    `<:VC_right_arrow:1473441155055096081> **Autore:** ${updated.author}${actorSuffix} \`${updated.author.id}\``,
    `<:VC_right_arrow:1473441155055096081> **Target:** ${updated.channel || "#sconosciuto"} • \`${updated.id}\``,
    `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
    "",
    "**Changes**",
  ];

  const files = [];
  if (contentChanged) {
    const fullDiff = buildSimpleDiff(beforeContent, afterContent);
    if (fullDiff.length <= MAX_EMBED_DIFF_LENGTH) {
      lines.push("<:VC_right_arrow:1473441155055096081> **Content:**");
      lines.push("```diff");
      lines.push(fullDiff);
      lines.push("```");
    } else {
      lines.push("<:VC_right_arrow:1473441155055096081> **Content:** diff troppo lungo, vedi allegato `.txt`.");
      const text = buildEditLogText(previous, updated, beforeNames, afterNames);
      const name = `${updated.channelId || "channel"}_${updated.id || Date.now()}.txt`;
      files.push(new AttachmentBuilder(Buffer.from(text, "utf8"), { name }));
    }
  }

  if (filesChanged) {
    lines.push("<:VC_right_arrow:1473441155055096081> **Attachments:**");
    lines.push(formatAttachmentsChange(beforeNames, afterNames));
  }

  const embed = new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle("Message Edited")
    .setDescription(lines.join("\n"));

  const preview = firstImageAttachment(updated);
  if (preview?.url) {
    embed.setImage(preview.url);
  }

  const payload = { embeds: [embed], files };
  if (isHttpUrl(updated.url)) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Go to Message")
        .setURL(updated.url),
    );
    payload.components = [row];
  }

  await logChannel.send(payload);
}

module.exports = {
  name: "messageUpdate",
  async execute(oldMessage, newMessage, client) {
    let previous = oldMessage;
    let updated = newMessage;
    const resolvedClient = client || newMessage?.client || oldMessage?.client;

    try {
      if (previous?.partial) {
        previous = await previous.fetch().catch(() => previous);
      }
      if (updated?.partial) {
        updated = await updated.fetch().catch(() => updated);
      }
      if (!updated?.guild || !updated?.author) return;

      const before = String(previous?.content || "");
      const after = String(updated?.content || "");
      const contentChanged = before !== after;

      if (
        contentChanged &&
        after &&
        !updated.author.bot &&
        !updated.system &&
        !updated.webhookId
      ) {
        try {
          const automodResult = await runAutoModMessage(updated);
          if (automodResult?.blocked) return;
        } catch (error) {
          global.logger?.error?.("[messageUpdate] automod failed:", error);
        }
      }

      await sendMessageEditLog(previous, updated);

      if (updated.author.bot || updated.system || updated.webhookId) return;
      if (!after || !contentChanged) return;

      const looksLikePrefix = after.startsWith("+");
      if (!looksLikePrefix) return;

      updated.__fromMessageUpdatePrefix = true;
      resolvedClient?.emit?.("messageCreate", updated);
    } catch (error) {
      global.logger?.error?.("[messageUpdate] failed:", error);
    }
  },
};


