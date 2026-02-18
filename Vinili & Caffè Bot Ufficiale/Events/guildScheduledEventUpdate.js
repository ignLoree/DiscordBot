const {
  AuditLogEvent,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require("discord.js");
const IDs = require("../Utils/Config/ids");

const CHANGE_LABELS = new Map([
  ["name", "Name"],
  ["description", "Description"],
  ["scheduled_start_time", "Start Time"],
  ["scheduled_end_time", "End Time"],
  ["privacy_level", "Privacy Level"],
  ["status", "Status"],
  ["entity_type", "Entity Type"],
  ["channel_id", "Channel"],
  ["location", "Location"],
]);

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

function toEventUrl(guildId, eventId) {
  if (!guildId || !eventId) return null;
  return `https://discord.com/events/${guildId}/${eventId}`;
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

function formatValue(key, value) {
  if (value === null || typeof value === "undefined" || value === "") return "none";
  if (key === "privacy_level") return privacyLabel(value);
  if (key === "status") return statusLabel(value);
  if (key === "entity_type") return entityTypeLabel(value);
  if (key === "channel_id") return value ? `<#${value}>` : "none";
  return String(value);
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function resolveAudit(guild, eventId) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return { executor: guild?.client?.user || null, changes: [] };
  }

  const logs = await guild
    .fetchAuditLogs({ type: AuditLogEvent.GuildScheduledEventUpdate, limit: 8 })
    .catch(() => null);
  if (!logs?.entries?.size) {
    return { executor: guild?.client?.user || null, changes: [] };
  }

  const now = Date.now();
  const entry = logs.entries.find((item) => {
    const created = Number(item?.createdTimestamp || 0);
    const within = created > 0 && now - created <= 30 * 1000;
    return within && String(item?.target?.id || "") === String(eventId || "");
  });

  return {
    executor: entry?.executor || guild?.client?.user || null,
    changes: Array.isArray(entry?.changes) ? entry.changes : [],
  };
}

module.exports = {
  name: "guildScheduledEventUpdate",
  async execute(_oldEvent, newEvent) {
    try {
      const guild = newEvent?.guild;
      if (!guild) return;

      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const { executor, changes } = await resolveAudit(guild, newEvent.id);
      const responsibleText = formatAuditActor(executor);
      const eventUrl = toEventUrl(guild.id, newEvent.id);

      const tracked = changes.filter((change) =>
        CHANGE_LABELS.has(String(change?.key || "")),
      );
      if (!tracked.length) return;

      const lines = [
        `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
        `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Changes**",
      ];

      for (const change of tracked) {
        const key = String(change?.key || "");
        const label = CHANGE_LABELS.get(key) || key;
        lines.push(`<:VC_right_arrow:1473441155055096081> **${label}**`);
        lines.push(
          `  ${formatValue(key, change?.old)} <:VC_right_arrow:1473441155055096081> ${formatValue(key, change?.new)}`,
        );
      }

      const embed = new EmbedBuilder()
        .setColor("#F59E0B")
        .setTitle("Guild Scheduled Event Update")
        .setDescription(lines.join("\n"));

      const payload = { embeds: [embed] };
      if (eventUrl) {
        payload.components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("Go to Event")
              .setURL(eventUrl),
          ),
        ];
      }

      await logChannel.send(payload).catch(() => {});
    } catch (error) {
      global.logger?.error?.("[guildScheduledEventUpdate] log failed:", error);
    }
  },
};



