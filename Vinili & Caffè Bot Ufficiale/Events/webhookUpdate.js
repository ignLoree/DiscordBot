const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const {
  handleWebhookCreationAction: antiNukeHandleWebhookCreationAction,
  handleWebhookDeletionAction: antiNukeHandleWebhookDeletionAction,
} = require("../Services/Moderation/antiNukeService");

const WEBHOOK_CREATE_ACTION = AuditLogEvent?.WebhookCreate ?? 50;
const WEBHOOK_UPDATE_ACTION = AuditLogEvent?.WebhookUpdate ?? 51;
const WEBHOOK_DELETE_ACTION = AuditLogEvent?.WebhookDelete ?? 52;
const DEDUPE_TTL_MS = 15000;
const AUDIT_FETCH_LIMIT = 20;
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

function webhookTypeLabel(value) {
  const type = Number(value || 0);
  if (type === 1) return "Normal (Incoming)";
  if (type === 2) return "Channel Follower";
  if (type === 3) return "Application";
  return `Unknown (${type || 0})`;
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
}

function getStore(client) {
  if (!client._webhookAuditDedupe) client._webhookAuditDedupe = new Map();
  const now = Date.now();
  for (const [key, ts] of client._webhookAuditDedupe.entries()) {
    if (now - Number(ts || 0) > DEDUPE_TTL_MS) client._webhookAuditDedupe.delete(key);
  }
  return client._webhookAuditDedupe;
}

async function getLatestWebhookEntry(guild, channelId) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) return null;
  const logs = await guild.fetchAuditLogs({ limit: AUDIT_FETCH_LIMIT }).catch(() => null);
  if (!logs?.entries?.size) return null;

  const now = Date.now();
  const actions = new Set([WEBHOOK_CREATE_ACTION, WEBHOOK_UPDATE_ACTION, WEBHOOK_DELETE_ACTION]);
  const candidates = [];

  logs.entries.forEach((item) => {
    if (!actions.has(item?.action)) return;
    const created = Number(item?.createdTimestamp || 0);
    if (!created || now - created > AUDIT_LOOKBACK_MS) return;

    const targetChannelId = String(channelId || "");
    const extraChannelId = String(item?.extra?.channel?.id || "");
    const targetWebhookChannelId = String(item?.target?.channelId || "");

    let score = 0;
    if (targetChannelId) {
      if (extraChannelId && extraChannelId === targetChannelId) score += 4;
      if (targetWebhookChannelId && targetWebhookChannelId === targetChannelId) score += 3;
      if (!extraChannelId && !targetWebhookChannelId) score += 1;
    } else {
      score += 1;
    }

    candidates.push({ item, score, created });
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.created - a.created;
  });

  return candidates[0] || null;
}

module.exports = {
  name: "webhookUpdate",
  async execute(channel) {
    try {
      const guild = channel?.guild;
      if (!guild) return;

      const match = await getLatestWebhookEntry(guild, channel?.id || null);
      if (!match?.item) return;
      const entry = match.item;

      const dedupeKey = `${guild.id}:${entry.action}:${entry.id}`;
      const store = getStore(guild.client);
      if (store.has(dedupeKey)) return;
      store.set(dedupeKey, Date.now());

      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible = formatAuditActor(entry.executor);
      const executorId = String(entry?.executor?.id || "");
      const targetName = String(entry?.target?.name || "sconosciuto");
      const targetId = String(entry?.target?.id || "sconosciuto");
      const action = Number(entry.action || 0);

      let title = "Webhook Update";
      let color = "#F59E0B";
      let sectionTitle = "**Changes**";
      if (action === WEBHOOK_CREATE_ACTION) {
        title = "Webhook Create";
        color = "#57F287";
        sectionTitle = "**Settings**";
      } else if (action === WEBHOOK_DELETE_ACTION) {
        title = "Webhook Delete";
        color = "#ED4245";
        sectionTitle = "**Previous Settings**";
      }

      const channelText = entry?.extra?.channel
        ? `${entry.extra.channel}`
        : "#sconosciuto";
      const appId = String(entry?.target?.applicationId || "").trim();
      const typeText = webhookTypeLabel(entry?.target?.type);

      const lines = [
        `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsible}`,
        `<:VC_right_arrow:1473441155055096081> **Target:** ${targetName} \`${targetId}\``,
        `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        sectionTitle,
      ];

      if (action === WEBHOOK_UPDATE_ACTION) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        const nameChange = changes.find((c) => String(c?.key || "") === "name");
        if (nameChange) {
          lines.push(`<:VC_right_arrow:1473441155055096081> **Name**`);
          lines.push(`  ${String(nameChange?.old ?? "sconosciuto")} <:VC_right_arrow:1473441155055096081> ${String(nameChange?.new ?? targetName)}`);
        } else {
          lines.push(`<:VC_right_arrow:1473441155055096081> **Name:** ${targetName}`);
        }
      } else {
        lines.push(`<:VC_right_arrow:1473441155055096081> **Channel:** ${channelText}`);
        if (appId) {
          lines.push(`<:VC_right_arrow:1473441155055096081> **Application Id:** \`${appId}\``);
        }
        lines.push(`<:VC_right_arrow:1473441155055096081> **Name:** ${targetName}`);
        lines.push(`<:VC_right_arrow:1473441155055096081> **Type:** ${typeText}`);
      }

      const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(lines.join("\n"));
      await logChannel.send({ embeds: [embed] }).catch(() => {});

      const reliableForNuke =
        Number(match.score || 0) >= 4 &&
        String(entry?.executor?.id || "").length > 0;
      if (action === WEBHOOK_CREATE_ACTION && reliableForNuke) {
        await antiNukeHandleWebhookCreationAction({
          guild,
          executorId,
          webhookId: targetId,
        }).catch(() => {});
      } else if (action === WEBHOOK_DELETE_ACTION && reliableForNuke) {
        await antiNukeHandleWebhookDeletionAction({
          guild,
          executorId,
          webhookId: targetId,
        }).catch(() => {});
      }
    } catch (error) {
      global.logger?.error?.("[webhookUpdate] log failed:", error);
    }
  },
};


