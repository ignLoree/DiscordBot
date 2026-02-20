const { EmbedBuilder, AttachmentBuilder, AuditLogEvent, PermissionsBitField, MessageFlagsBitField, } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const VERIFICATION_EXCLUDED_CHANNEL_IDS = new Set(
  [IDs.channels.verify, IDs.channels.clickMe].filter(Boolean).map(String),
);
const AUDIT_LOOKBACK_MS = 120 * 1000;

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function formatAuditActor(actor) {
  if (!actor) return "sconosciuto";
  const flags = [];
  if (actor?.bot) flags.push("BOT");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  return `${actor}${suffix} \`${actor.id}\``;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function isMeaningfulDeletedMessage(msg) {
  if (!msg) return false;
  if (isTransientInteractionMessage(msg)) return false;
  const hasContent = sanitizeText(msg.content || "").length > 0;
  const hasAttachments = Boolean(msg.attachments?.size);
  // Skip embeds entirely: embed payload is often not reliably visible after delete.
  return hasContent || hasAttachments;
}

function buildPurgeLogText(messages, channelId) {
  const rows = [];
  const ordered = Array.from(messages?.values?.() || []).sort((a, b) => {
    const at = Number(a?.createdTimestamp || 0);
    const bt = Number(b?.createdTimestamp || 0);
    return at - bt;
  });

  rows.push(`------ ${channelId || "unknown"}`);
  rows.push("");

  for (const msg of ordered) {
    const authorId = String(msg?.author?.id || "sconosciuto");
    const flags = [];
    if (msg?.author?.bot) flags.push("BOT");
    if (msg?.webhookId) flags.push("WEBHOOK");
    const suffix = flags.length ? ` [${flags.join("/")}]` : "";
    const content = sanitizeText(msg?.content || "(vuoto)");
    rows.push(`[${authorId}]${suffix} ${content}`);

    const attachments = msg?.attachments ? Array.from(msg.attachments.values()) : [];
    if (attachments.length) {
      const list = attachments
        .map((a) => String(a?.url || a?.name || ""))
        .filter(Boolean)
        .join(", ");
      if (list) rows.push(`attachments: ${list}`);
    }
    rows.push("");
  }

  rows.push("--------------------");
  rows.push("");
  return rows.join("\n");
}

function splitTextToChunks(text, maxBytes = 1_800_000) {
  const input = String(text || "");
  if (!input) return ["(vuoto)"];
  const lines = input.split("\n");
  const chunks = [];
  let current = "";
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (Buffer.byteLength(candidate, "utf8") <= maxBytes) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (Buffer.byteLength(line, "utf8") <= maxBytes) {
      current = line;
      continue;
    }
    // Single line too large: hard-split by characters.
    let remaining = line;
    while (Buffer.byteLength(remaining, "utf8") > maxBytes) {
      let take = Math.floor((maxBytes * 0.9));
      if (take < 128) take = 128;
      let piece = remaining.slice(0, take);
      while (Buffer.byteLength(piece, "utf8") > maxBytes && piece.length > 1) {
        piece = piece.slice(0, -1);
      }
      chunks.push(piece);
      remaining = remaining.slice(piece.length);
    }
    current = remaining;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : ["(vuoto)"];
}

async function resolveActivityLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function resolvePurgeResponsible(guild, channelId, deletedCount, fallbackUser) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return fallbackUser;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild
      .fetchAuditLogs({ type: AuditLogEvent.MessageBulkDelete, limit: 12 })
      .catch(() => null);
    if (!logs?.entries?.size) {
      if (attempt < 2) await sleep(700);
      continue;
    }

    const nowMs = Date.now();
    const candidates = [];
    logs.entries.forEach((item) => {
      const createdMs = Number(item?.createdTimestamp || 0);
      const withinWindow = createdMs > 0 && nowMs - createdMs <= AUDIT_LOOKBACK_MS;
      if (!withinWindow) return;

      const sameChannelByExtra =
        String(item?.extra?.channel?.id || "") === String(channelId || "");
      const sameChannelByTarget =
        String(item?.target?.id || "") === String(channelId || "");
      const sameChannel = sameChannelByExtra || sameChannelByTarget;

      const count = Number(item?.extra?.count || 0);
      const wantedCount = Number(deletedCount || 0);
      const exactCount = count > 0 && count === wantedCount;
      const nearCount =
        count > 0 && wantedCount > 0 && Math.abs(count - wantedCount) <= 2;

      let score = 0;
      if (sameChannel) score += 5;
      if (exactCount) score += 4;
      else if (nearCount) score += 2;
      else if (!count) score += 1;

      candidates.push({ item, score, createdMs });
    });

    if (candidates.length) {
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.createdMs - a.createdMs;
      });
      const best = candidates[0];
      if (best?.score >= 3) return best.item?.executor || fallbackUser;
    }

    if (attempt < 2) await sleep(700);
  }

  return fallbackUser;
}

module.exports = {
  name: "messageDeleteBulk",
  async execute(messages, client) {
    try {
      void client;
      if (!messages?.size) return;
      const meaningful = messages.filter((msg) => isMeaningfulDeletedMessage(msg));
      if (!meaningful.size) return;

      const sample = meaningful.first();
      const guild = sample?.guild;
      const channelId = String(sample?.channel?.id || sample?.channelId || "");
      const channelText = sample?.channel ? `${sample.channel}` : (channelId ? `<#${channelId}>` : "#sconosciuto");
      if (!guild || !channelId) return;
      if (VERIFICATION_EXCLUDED_CHANNEL_IDS.has(channelId)) return;

      const logChannel = await resolveActivityLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const count = Number(meaningful.size || 0);
      if (count <= 0) return;

      const responsible = await resolvePurgeResponsible(
        guild,
        channelId,
        count,
        null,
      );

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("Messages Purged")
        .setDescription(
          [
            `<:VC_right_arrow:1473441155055096081> **Responsible:** ${formatAuditActor(responsible)}`,
            `<:VC_right_arrow:1473441155055096081> **Target:** ${channelText} \`${channelId}\``,
            `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
            "",
            "**Additional Information**",
            `<:VC_right_arrow:1473441155055096081> **Count:** ${count}`,
          ].join("\n"),
        );

      const txt = buildPurgeLogText(meaningful, channelId);
      const chunks = splitTextToChunks(txt);
      const cappedChunks = chunks.slice(0, 10);
      const files = cappedChunks.map((chunk, index) => {
        const suffix = chunks.length > 1 ? `_p${index + 1}` : "";
        const fileName = `${channelId}_${sample?.id || Date.now()}${suffix}.txt`;
        return new AttachmentBuilder(Buffer.from(chunk, "utf8"), {
          name: fileName,
        });
      });
      if (chunks.length > 10) {
        embed.addFields({
          name: "Note",
          value: `Dump diviso in più parti: inviate le prime 10/${chunks.length}.`,
        });
      }

      await logChannel.send({ embeds: [embed], files });
    } catch (error) {
      global.logger?.error?.("[messageDeleteBulk] failed:", error);
    }
  },
};


