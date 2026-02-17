const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function privacyLabel(value) {
  return Number(value) === 2 ? "Local Server Event" : `Unknown (${value})`;
}

function statusLabel(value) {
  const n = Number(value || 0);
  if (n === 1) return "Scheduled";
  if (n === 2) return "Active";
  if (n === 3) return "Completed";
  if (n === 4) return "Canceled";
  return `Unknown (${n})`;
}

function entityTypeLabel(value) {
  const n = Number(value || 0);
  if (n === 1) return "Stage Channel";
  if (n === 2) return "Voice Channel";
  if (n === 3) return "External (Text Channel / URL / Off Discord)";
  return `Unknown (${n})`;
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function resolveResponsible(guild, eventId) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return guild?.client?.user || null;
  }

  const logs = await guild
    .fetchAuditLogs({ type: AuditLogEvent.GuildScheduledEventDelete, limit: 8 })
    .catch(() => null);
  if (!logs?.entries?.size) return guild?.client?.user || null;

  const now = Date.now();
  const entry = logs.entries.find((item) => {
    const created = Number(item?.createdTimestamp || 0);
    const within = created > 0 && now - created <= 30 * 1000;
    return within && String(item?.target?.id || "") === String(eventId || "");
  });
  return entry?.executor || guild?.client?.user || null;
}

module.exports = {
  name: "guildScheduledEventDelete",
  async execute(scheduledEvent) {
    try {
      const guild = scheduledEvent?.guild;
      if (!guild) return;

      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible = await resolveResponsible(guild, scheduledEvent.id);
      const responsibleText = responsible
        ? `${responsible} \`${responsible.id}\``
        : "sconosciuto";

      const lines = [
        `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
        `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Previous Settings**",
        `<:VC_right_arrow:1473441155055096081> **Name:** ${scheduledEvent.name || "sconosciuto"}`,
        `<:VC_right_arrow:1473441155055096081> **Privacy Level:** ${privacyLabel(scheduledEvent.privacyLevel)}`,
        `<:VC_right_arrow:1473441155055096081> **Status:** ${statusLabel(scheduledEvent.status)}`,
        `<:VC_right_arrow:1473441155055096081> **Entity Type:** ${entityTypeLabel(scheduledEvent.entityType)}`,
      ];

      if (scheduledEvent.channelId) {
        lines.push(
          `<:VC_right_arrow:1473441155055096081> **Channel:** <#${scheduledEvent.channelId}>`,
        );
      } else if (scheduledEvent.entityMetadata?.location) {
        lines.push(
          `<:VC_right_arrow:1473441155055096081> **Location:** ${scheduledEvent.entityMetadata.location}`,
        );
      }

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("Guild Scheduled Event Delete")
        .setDescription(lines.join("\n"));

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (error) {
      global.logger?.error?.("[guildScheduledEventDelete] log failed:", error);
    }
  },
};



