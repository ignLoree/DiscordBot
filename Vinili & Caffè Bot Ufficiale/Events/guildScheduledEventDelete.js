const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");
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

function toEventTimeLabel(value) {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return `<t:${Math.floor(ms / 1000)}:F>`;
}

function privacyLabel(value) {
  return Number(value) === 2 ? "Evento locale del server" : `Sconosciuto (${value})`;
}

function statusLabel(value) {
  const n = Number(value || 0);
  if (n === 1) return "Scheduled";
  if (n === 2) return "Active";
  if (n === 3) return "Completed";
  if (n === 4) return "Canceled";
  return `Sconosciuto (${n})`;
}

function entityTypeLabel(value) {
  const n = Number(value || 0);
  if (n === 1) return "Stage Channel";
  if (n === 2) return "Voice Channel";
  if (n === 3) return "External (Text Channel / URL / Off Discord)";
  return `Sconosciuto (${n})`;
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveResponsible(guild, eventId) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return null;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild
      .fetchAuditLogs({
        type: AuditLogEvent.GuildScheduledEventDelete,
        limit: AUDIT_FETCH_LIMIT,
      })
      .catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      const entry = logs.entries.find((item) => {
        const created = Number(item?.createdTimestamp || 0);
        const within = created > 0 && now - created <= AUDIT_LOOKBACK_MS;
        return within && String(item?.target?.id || "") === String(eventId || "");
      });
      if (entry?.executor) return entry.executor;
    }
    if (attempt < 2) await sleep(700);
  }

  return null;
}

module.exports = {
  name: "guildScheduledEventDelete",
  async execute(scheduledEvent) {
    try {
      const guild = scheduledEvent?.guild;
      const eventId = String(scheduledEvent?.id || "");
      if (!guild || !eventId) return;

      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible = await resolveResponsible(guild, eventId);
      const responsibleText = formatAuditActor(responsible);
      const startTime = toEventTimeLabel(
        scheduledEvent.scheduledStartAt || scheduledEvent.scheduledStartTimestamp,
      );
      const endTime = toEventTimeLabel(
        scheduledEvent.scheduledEndAt || scheduledEvent.scheduledEndTimestamp,
      );

      const lines = [
        `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
        `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Previous Settings**",
        `<:VC_right_arrow:1473441155055096081> **Name:** ${scheduledEvent.name || "sconosciuto"}`,
        `<:VC_right_arrow:1473441155055096081> **Privacy Level:** ${privacyLabel(scheduledEvent.privacyLevel)}`,
        `<:VC_right_arrow:1473441155055096081> **Status:** ${statusLabel(scheduledEvent.status)}`,
        `<:VC_right_arrow:1473441155055096081> **Entity Type:** ${entityTypeLabel(scheduledEvent.entityType)}`,
        startTime ? `<:VC_right_arrow:1473441155055096081> **Start Time:** ${startTime}` : null,
        endTime ? `<:VC_right_arrow:1473441155055096081> **End Time:** ${endTime}` : null,
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
        .setDescription(lines.filter(Boolean).join("\n"));

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      global.logger?.error?.("[guildScheduledEventDelete] log failed:", error);
    }
  },
};
