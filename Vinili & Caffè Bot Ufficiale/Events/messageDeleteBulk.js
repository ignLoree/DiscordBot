const {
  EmbedBuilder,
  AttachmentBuilder,
  AuditLogEvent,
  PermissionsBitField,
} = require("discord.js");
const IDs = require("../Utils/Config/ids");

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    const content = sanitizeText(msg?.content || "(vuoto)");
    rows.push(`[${authorId}] ${content}`);

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

  const logs = await guild
    .fetchAuditLogs({ type: AuditLogEvent.MessageBulkDelete, limit: 12 })
    .catch(() => null);
  if (!logs?.entries?.size) return fallbackUser;

  const nowMs = Date.now();
  const candidates = [];
  logs.entries.forEach((item) => {
    const createdMs = Number(item?.createdTimestamp || 0);
    const withinWindow = createdMs > 0 && nowMs - createdMs <= 120 * 1000;
    if (!withinWindow) return;

    const sameChannelByExtra =
      String(item?.extra?.channel?.id || "") === String(channelId || "");
    const sameChannelByTarget =
      String(item?.target?.id || "") === String(channelId || "");
    const sameChannel = sameChannelByExtra || sameChannelByTarget;

    const count = Number(item?.extra?.count || 0);
    const wantedCount = Number(deletedCount || 0);
    const exactCount = count > 0 && count === wantedCount;
    const nearCount = count > 0 && wantedCount > 0 && Math.abs(count - wantedCount) <= 2;

    let score = 0;
    if (sameChannel) score += 5;
    if (exactCount) score += 4;
    else if (nearCount) score += 2;
    else if (!count) score += 1;

    // Prefer newer audit entries when score is tied.
    candidates.push({ item, score, createdMs });
  });

  if (!candidates.length) return fallbackUser;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.createdMs - a.createdMs;
  });

  const best = candidates[0];
  if (!best || best.score < 3) return fallbackUser;
  return best.item?.executor || fallbackUser;
}

module.exports = {
  name: "messageDeleteBulk",
  async execute(messages, client) {
    if (!messages?.size) return;

    const sample = messages.first();
    const guild = sample?.guild;
    const channel = sample?.channel;
    if (!guild || !channel) return;

    const logChannel = await resolveActivityLogChannel(guild);
    if (!logChannel?.isTextBased?.()) return;

    const count = Number(messages.size || 0);
    if (count <= 0) return;

    const responsible = await resolvePurgeResponsible(
      guild,
      channel.id,
      count,
      client?.user || null,
    );

    const embed = new EmbedBuilder()
      .setColor("#ED4245")
      .setTitle("Messages Purged")
      .setDescription(
        [
          `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsible ? `${responsible} \`${responsible.id}\`` : "sconosciuto"}`,
          `<:VC_right_arrow:1473441155055096081> **Target:** ${channel} \`${channel.id}\``,
          `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
          "",
          "**Additional Information**",
          `<:VC_right_arrow:1473441155055096081> **Count:** ${count}`,
        ].join("\n"),
      );

    const txt = buildPurgeLogText(messages, channel.id);
    const fileName = `${channel.id}_${sample?.id || Date.now()}.txt`;
    const file = new AttachmentBuilder(Buffer.from(txt, "utf8"), {
      name: fileName,
    });

    await logChannel.send({ embeds: [embed], files: [file] }).catch(() => {});
  },
};


