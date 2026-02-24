const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");

async function resolveModLogChannel(guild) {
  const channelId = IDs.channels?.modLogs;
  if (!guild || !channelId) return null;
  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return null;
  return channel;
}

function canViewAuditLog(guild) {
  return Boolean(
    guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog),
  );
}

async function fetchRecentAuditEntry(
  guild,
  actionType,
  matcher,
  limit = 20,
  windowMs = 120000,
) {
  if (!canViewAuditLog(guild)) return null;
  const logs = await guild
    .fetchAuditLogs({ type: actionType, limit })
    .catch(() => null);
  if (!logs?.entries?.size) return null;

  const now = Date.now();
  const candidates = [];
  logs.entries.forEach((item) => {
    const created = Number(item?.createdTimestamp || 0);
    if (!created || now - created > windowMs) return;

    let score = 1;
    if (typeof matcher === "function") {
      const result = matcher(item);
      if (!result) return;
      if (typeof result === "number" && Number.isFinite(result)) score += result;
      else score += 3;
    }

    score += Math.max(0, windowMs - (now - created)) / windowMs;
    candidates.push({ item, score, created });
  });

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.created - a.created;
  });
  return candidates[0]?.item || null;
}

function formatResponsible(executor) {
  if (!executor) return "sconosciuto";
  const flags = [];
  if (executor?.bot) flags.push("BOT");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  return `${executor}${suffix} \`${executor.id}\``;
}

function nowDiscordTs() {
  return `<t:${Math.floor(Date.now() / 1000)}:F>`;
}

function formatDurationForModLog(ms) {
  if (!ms || ms <= 0) return "N/A";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.join(" ");
}

/**
 * Builds the Dyno-style staff action embed (green, Case X | Action | username, User/Moderator/Reason, footer ID • timestamp).
 * @param {Object} modCase - ModCase doc with caseId, action, userId, modId, reason, durationMs
 * @param {Object} [options] - { actionLabel?, moderatorId?, reasonOverride?, extraFields? }
 */
function buildStaffActionModLogEmbed(modCase, options = {}) {
  const actionLabel =
    options.actionLabel ||
    String(modCase.action || "Unknown")
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase());
  const moderatorId = options.moderatorId != null ? options.moderatorId : modCase.modId;
  const reasonText =
    options.reasonOverride !== undefined
      ? (options.reasonOverride && String(options.reasonOverride).slice(0, 1024)) || "No reason given."
      : (modCase.reason && String(modCase.reason).slice(0, 1024)) || "No reason given.";
  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle(
      `Case ${modCase.caseId} | ${actionLabel} | ${options.targetUsername != null ? options.targetUsername : modCase.userId}`,
    )
    .addFields(
      { name: "User", value: `<@${modCase.userId}>`, inline: true },
      { name: "Moderator", value: `<@${moderatorId}>`, inline: true },
      { name: "Reason", value: reasonText, inline: false },
    )
  const sanctionDate = modCase.createdAt ? new Date(modCase.createdAt) : new Date();
  embed.setTimestamp(sanctionDate.getTime());
  const footerTs = sanctionDate.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  embed.setFooter({ text: `ID: ${modCase.userId} • ${footerTs}` });
  if (Number.isFinite(modCase.durationMs) && modCase.durationMs > 0) {
    embed.addFields({
      name: "Duration",
      value: formatDurationForModLog(modCase.durationMs),
      inline: true,
    });
  }
  if (Array.isArray(options.extraFields) && options.extraFields.length) {
    options.extraFields.forEach((f) => embed.addFields(f));
  }
  return embed;
}

/**
 * Sends the staff-action embed to modLogs. Fetches target user for title username.
 * @param {import("discord.js").Guild} guild
 * @param {Object} modCase - ModCase doc
 * @param {Object} [options] - Same as buildStaffActionModLogEmbed
 */
async function sendStaffActionToModLogs(guild, modCase, options = {}) {
  const channel = await resolveModLogChannel(guild);
  if (!channel?.isTextBased?.()) return;
  let targetUsername = options.targetUsername;
  if (targetUsername == null && guild?.client?.users && modCase.userId) {
    const user = await guild.client.users.fetch(String(modCase.userId)).catch(() => null);
    targetUsername = user?.username || modCase.userId;
  }
  const embed = buildStaffActionModLogEmbed(modCase, {
    ...options,
    targetUsername: targetUsername ?? modCase.userId,
  });
  await channel.send({ embeds: [embed] }).catch(() => null);
}

module.exports = {
  resolveModLogChannel,
  fetchRecentAuditEntry,
  formatResponsible,
  nowDiscordTs,
  formatDurationForModLog,
  buildStaffActionModLogEmbed,
  sendStaffActionToModLogs,
};
