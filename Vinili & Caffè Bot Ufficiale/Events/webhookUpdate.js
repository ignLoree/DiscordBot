const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");

const WEBHOOK_CREATE_ACTION = AuditLogEvent?.WebhookCreate ?? 50;
const WEBHOOK_UPDATE_ACTION = AuditLogEvent?.WebhookUpdate ?? 51;
const WEBHOOK_DELETE_ACTION = AuditLogEvent?.WebhookDelete ?? 52;
const DEDUPE_TTL_MS = 15000;

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
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
  const logs = await guild.fetchAuditLogs({ limit: 10 }).catch(() => null);
  if (!logs?.entries?.size) return null;

  const now = Date.now();
  const actions = new Set([WEBHOOK_CREATE_ACTION, WEBHOOK_UPDATE_ACTION, WEBHOOK_DELETE_ACTION]);
  const entry = logs.entries.find((item) => {
    if (!actions.has(item?.action)) return false;
    const created = Number(item?.createdTimestamp || 0);
    if (!created || now - created > 30 * 1000) return false;
    const chId = String(item?.extra?.channel?.id || "");
    return !channelId || chId === String(channelId);
  });
  return entry || null;
}

module.exports = {
  name: "webhookUpdate",
  async execute(channel) {
    try {
      const guild = channel?.guild;
      if (!guild) return;

      const entry = await getLatestWebhookEntry(guild, channel?.id || null);
      if (!entry) return;

      const dedupeKey = `${guild.id}:${entry.action}:${entry.id}`;
      const store = getStore(guild.client);
      if (store.has(dedupeKey)) return;
      store.set(dedupeKey, Date.now());

      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible = entry.executor
        ? `${entry.executor} \`${entry.executor.id}\``
        : "sconosciuto";
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
    } catch (error) {
      global.logger?.error?.("[webhookUpdate] log failed:", error);
    }
  },
};


