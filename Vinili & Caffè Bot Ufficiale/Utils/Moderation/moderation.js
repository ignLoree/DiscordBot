const { EmbedBuilder } = require("discord.js");
const { ModConfig } = require("../../Schemas/Moderation/moderationSchemas");
const { ModCase } = require("../../Schemas/Moderation/moderationSchemas");
const { sendStaffActionToModLogs } = require("../Logging/modAuditLogUtils");
const IDs = require("../Config/ids");

const BOT_MODERATOR_IDS = new Set(
  Object.values(IDs?.bots || {})
    .filter(Boolean)
    .map((id) => String(id)),
);

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
  dedupe,
}) {
  if (modId != null && BOT_MODERATOR_IDS.has(String(modId))) {
    const cfg = await getModConfig(guildId).catch(() => null);
    return {
      doc: null,
      config: cfg,
      created: false,
      isDuplicate: false,
      skipped: true,
      skipReason: "bot_moderator",
    };
  }

  const normalizedAction = normalizeAction(action);
  const normalizedReason = reason || "Nessun motivo fornito";
  const normalizedDurationMs = durationMs || null;
  const normalizedContext = {
    channelId: context?.channelId || null,
    messageId: context?.messageId || null,
  };
  const dedupeEnabled = Boolean(dedupe?.enabled);
  if (dedupeEnabled) {
    const byMessageId = dedupe?.byMessageId !== false;
    const messageId = String(normalizedContext.messageId || "").trim();
    if (byMessageId && messageId) {
      const existingByMessage = await ModCase.findOne({
        guildId,
        action: normalizedAction,
        userId,
        modId,
        "context.messageId": messageId,
      })
        .sort({ createdAt: -1 })
        .catch(() => null);
      if (existingByMessage) {
        const cfgExisting = await getModConfig(guildId);
        return {
          doc: existingByMessage,
          config: cfgExisting,
          created: false,
          isDuplicate: true,
        };
      }
    }

    const rawWindowMs = Number(dedupe?.windowMs);
    const windowMs = Number.isFinite(rawWindowMs) && rawWindowMs > 0 ? rawWindowMs : 15_000;
    const createdAtFrom = new Date(Date.now() - windowMs);
    const matchReason = dedupe?.matchReason !== false;
    const fallbackQuery = {
      guildId,
      action: normalizedAction,
      userId,
      modId,
      createdAt: { $gte: createdAtFrom },
    };
    if (matchReason) fallbackQuery.reason = normalizedReason;
    if (normalizedDurationMs == null) fallbackQuery.durationMs = null;
    else fallbackQuery.durationMs = Number(normalizedDurationMs);
    const existingRecent = await ModCase.findOne(fallbackQuery)
      .sort({ createdAt: -1 })
      .catch(() => null);
    if (existingRecent) {
      const cfgExisting = await getModConfig(guildId);
      return {
        doc: existingRecent,
        config: cfgExisting,
        created: false,
        isDuplicate: true,
      };
    }
  }

  const cfg = await ModConfig.findOneAndUpdate(
    { guildId },
    { $inc: { caseCounter: 1 }, $setOnInsert: { guildId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const caseId = cfg.caseCounter;
  const expiresAt = normalizedDurationMs ? new Date(Date.now() + normalizedDurationMs) : null;
  const doc = await ModCase.create({
    guildId,
    caseId,
    action: normalizedAction,
    userId,
    modId,
    reason: normalizedReason,
    durationMs: normalizedDurationMs,
    expiresAt,
    context: normalizedContext,
  });
  return { doc, config: cfg, created: true, isDuplicate: false };
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
    .setTitle(`Case #${modCase.caseId} - ${modCase.action}`);
  const fields = [
    { name: "Utente", value: userLabel, inline: true },
    { name: "Moderatore", value: `<@${modCase.modId}>`, inline: true },
  ];
  if (duration) {
    fields.push({ name: "Durata", value: duration, inline: true });
    fields.push({ name: "Motivo", value: modCase.reason || "Nessun motivo fornito", inline: false });
  } else {
    fields.push({ name: "Motivo", value: modCase.reason || "Nessun motivo fornito", inline: true });
  }
  embed.addFields(...fields).setTimestamp();
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