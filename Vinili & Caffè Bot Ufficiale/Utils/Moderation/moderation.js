const { EmbedBuilder } = require("discord.js");
const { ModConfig } = require("../../Schemas/Moderation/moderationSchemas");
const { ModCase } = require("../../Schemas/Moderation/moderationSchemas");
const { sendStaffActionToModLogs } = require("../Logging/modAuditLogUtils");

function normalizeAction(action) {
  return String(action || "UNKNOWN").trim().toUpperCase();
}

async function getModConfig(guildId) {
  return ModConfig.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

function isExempt(member, config, channelId) {
  if (!member) return true;
  if (Array.isArray(config?.exemptRoles) && config.exemptRoles.length > 0) {
    if (member.roles.cache.some((r) => config.exemptRoles.includes(r.id)))
      return true;
  }
  if (
    Array.isArray(config?.exemptChannels) &&
    config.exemptChannels.length > 0
  ) {
    if (channelId && config.exemptChannels.includes(channelId)) return true;
  }
  return false;
}

function formatDuration(ms) {
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

function parseDuration(input) {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase();
  const match = raw.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const val = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(val) || val <= 0) return null;
  const mult =
    unit === "s"
      ? 1000
      : unit === "m"
        ? 60000
        : unit === "h"
          ? 3600000
          : 86400000;
  return val * mult;
}

async function createModCase({
  guildId,
  action,
  userId,
  modId,
  reason,
  durationMs,
  context,
}) {
  const cfg = await ModConfig.findOneAndUpdate(
    { guildId },
    { $inc: { caseCounter: 1 }, $setOnInsert: { guildId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const caseId = cfg.caseCounter;
  const expiresAt = durationMs ? new Date(Date.now() + durationMs) : null;
  const doc = await ModCase.create({
    guildId,
    caseId,
    action: normalizeAction(action),
    userId,
    modId,
    reason: reason || "Nessun motivo fornito",
    durationMs: durationMs || null,
    expiresAt,
    context: {
      channelId: context?.channelId || null,
      messageId: context?.messageId || null,
    },
  });
  return { doc, config: cfg };
}

function normalizeEditValue(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function appendCaseEdit(modCase, field, previous, next, editedBy) {
  if (!modCase || !field) return;
  if (!Array.isArray(modCase.edits)) modCase.edits = [];
  modCase.edits.push({
    field: String(field),
    previous: normalizeEditValue(previous),
    next: normalizeEditValue(next),
    editedBy: editedBy ? String(editedBy) : null,
    editedAt: new Date(),
  });
}

function closeCase(modCase, closeReason = null) {
  if (!modCase) return;
  modCase.active = false;
  modCase.closedAt = new Date();
  modCase.closeReason = closeReason ? String(closeReason).slice(0, 300) : null;
}

async function logModCase({ client, guild, modCase, config }) {
  const channelId = config?.logChannelId;
  const channel = channelId
    ? (guild.channels.cache.get(channelId) ||
        (await guild.channels.fetch(channelId).catch(() => null)))
    : null;
  const duration = modCase.durationMs
    ? formatDuration(modCase.durationMs)
    : null;
  const isUserId = /^\d{17,20}$/.test(String(modCase.userId));
  const userLabel = isUserId
    ? `<@${modCase.userId}> (\`${modCase.userId}\`)`
    : String(modCase.userId);
  const embed = new EmbedBuilder()
    .setColor(client?.config?.embedModLight || "#6f4e37")
    .setTitle(`Case #${modCase.caseId} - ${modCase.action}`)
    .addFields(
      { name: "Utente", value: userLabel, inline: true },
      { name: "Moderatore", value: `<@${modCase.modId}>`, inline: true },
      { name: "Motivo", value: modCase.reason || "Nessun motivo fornito" },
    )
    .setTimestamp();
  if (duration) {
    embed.addFields({ name: "Durata", value: duration, inline: true });
  }
  if (modCase.context?.channelId) {
    embed.addFields({
      name: "Canale",
      value: `<#${modCase.context.channelId}>`,
      inline: true,
    });
  }
  if (channel?.isTextBased?.()) {
    await channel.send({ embeds: [embed] }).catch(() => {});
  }
  await sendStaffActionToModLogs(guild, modCase).catch(() => null);
}

async function tryDmUser(user, content) {
  if (!user) return false;
  try {
    if (typeof content === "string") {
      await user.send({ content });
    } else {
      await user.send(content);
    }
    return true;
  } catch {
    return false;
  }
}
module.exports = {
  getModConfig,
  isExempt,
  createModCase,
  appendCaseEdit,
  closeCase,
  logModCase,
  formatDuration,
  parseDuration,
  tryDmUser,
};
