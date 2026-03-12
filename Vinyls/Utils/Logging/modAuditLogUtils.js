const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");

async function resolveModLogChannel(guild) {
  const channelId = IDs.channels?.modLogs;
  if (!guild || !channelId) return null;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.isTextBased?.()) return null;
  return channel;
}

function canViewAuditLog(guild) {
  return Boolean(
    guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog),
  );
}

async function fetchRecentAuditEntry(guild, actionType, matcher, limit = 20, windowMs = 120000) {
  if (!canViewAuditLog(guild)) return null;
  const logs = await guild.fetchAuditLogs({ type: actionType, limit }).catch(() => null);
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
  const actionLabel = options.actionLabel || String(modCase.action || "Unknown").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  const moderatorId = options.moderatorId != null ? options.moderatorId : modCase.modId;
  const reasonText = options.reasonOverride !== undefined ? (options.reasonOverride && String(options.reasonOverride).slice(0, 1024)) || "No reason given." : (modCase.reason && String(modCase.reason).slice(0, 1024)) || "No reason given.";
  const embed = new EmbedBuilder().setColor("#57F287").setTitle(`Case ${modCase.caseId}|${actionLabel}|${options.targetUsername != null ? options.targetUsername : modCase.userId}`,
  );
  const hasDuration = Number.isFinite(modCase.durationMs) && modCase.durationMs > 0;
  const fields = [{ name: "<:member_role_icon:1330530086792728618> User", value: `<@${modCase.userId}>`, inline: true },
  { name: "<:staff:1443651912179388548> Moderator", value: `<@${moderatorId}>`, inline: true },
  ];
  if (hasDuration) {
    fields.push({
      name: "<:VC_Clock:1473359204189474886> Duration",
      value: formatDurationForModLog(modCase.durationMs),
      inline: true,
    });
    fields.push({ name: "<:VC_reason:1478517122929004544> Reason", value: reasonText, inline: false });
  } else {
    fields.push({ name: "<:VC_reason:1478517122929004544> Reason", value: reasonText, inline: true });
  }
  embed.addFields(...fields.slice(0, 25));
  const sanctionDate = modCase.createdAt ? new Date(modCase.createdAt) : new Date();
  embed.setTimestamp(sanctionDate.getTime());
  const footerTs = sanctionDate.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, });
  embed.setFooter({ text: `ID: ${modCase.userId} • ${footerTs}` });
  if (Array.isArray(options.extraFields) && options.extraFields.length) {
    const currentCount = embed.data?.fields?.length ?? 0;
    const remaining = Math.max(0, 25 - currentCount);
    options.extraFields.slice(0, remaining).forEach((f) => embed.addFields(f));
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
  const embed = buildStaffActionModLogEmbed(modCase, { ...options, targetUsername: targetUsername ?? modCase.userId, });
  await channel.send({ embeds: [embed] }).catch(() => null);
}

/**
 * Log uso comando moderazione in #modLogs in stile Dyno: autore (avatar + username), "Used `command` in #channel", comando completo, timestamp DD/MM/YYYY HH:MM.
 * @param {import("discord.js").Guild} guild
 * @param {import("discord.js").Message} message - messaggio che ha invocato il comando (author, channel, content)
 * @param {string} commandName - nome comando (es. "warn", "modlogs")
 */
async function sendModCommandUsageToModLogs(guild, message, commandName) {
  const channel = await resolveModLogChannel(guild);
  if (!channel?.isTextBased?.() || !message?.author) return;
  const channelLabel = message.channel?.name ? `# ${message.channel.name}` : "# canale";
  const fullCommand = String(message.content || "").trim() || `+${commandName}`;
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timestamp = `${day}/${month}/${year} ${hours}:${minutes}`;
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setAuthor({
      name: message.author.username,
      iconURL: message.author.displayAvatarURL({ size: 32 }),
    })
    .setDescription(`Used \`${commandName}\` command in ${channelLabel}\n\n\`${fullCommand}\``)
    .setFooter({ text: timestamp });
  await channel.send({ embeds: [embed] }).catch(() => null);
}

module.exports = { resolveModLogChannel, fetchRecentAuditEntry, formatResponsible, nowDiscordTs, formatDurationForModLog, buildStaffActionModLogEmbed, sendStaffActionToModLogs, sendModCommandUsageToModLogs };