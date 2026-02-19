const {
  AuditLogEvent,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require("discord.js");
const IDs = require("../Utils/Config/ids");
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;

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
  ["entity_metadata.location", "Location"],
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (key === "location" || key === "entity_metadata.location") return String(value);
  if (key === "scheduled_start_time" || key === "scheduled_end_time") {
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms)) return `<t:${Math.floor(ms / 1000)}:F>`;
  }
  return String(value);
}

function normalizeComparableValue(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? String(ms) : null;
  }
  if (typeof value === "string") {
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms)) return String(ms);
    return value;
  }
  return String(value);
}

function eventValueByAuditKey(event, key) {
  if (!event) return null;
  if (key === "name") return event.name;
  if (key === "description") return event.description;
  if (key === "scheduled_start_time")
    return event.scheduledStartTimestamp ? event.scheduledStartAt ? null;
  if (key === "scheduled_end_time")
    return event.scheduledEndTimestamp ? event.scheduledEndAt ? null;
  if (key === "privacy_level") return event.privacyLevel;
  if (key === "status") return event.status;
  if (key === "entity_type") return event.entityType;
  if (key === "channel_id") return event.channelId;
  if (key === "location" || key === "entity_metadata.location") {
    return event.entityMetadata?.location ? null;
  }
  return null;
}

function buildFallbackTrackedChanges(oldEvent, newEvent) {
  const trackedKeys = Array.from(CHANGE_LABELS.keys());
  const out = [];
  for (const key of trackedKeys) {
    const oldRaw = eventValueByAuditKey(oldEvent, key);
    const newRaw = eventValueByAuditKey(newEvent, key);
    const oldComparable = normalizeComparableValue(oldRaw);
    const newComparable = normalizeComparableValue(newRaw);
    if (oldComparable === newComparable) continue;
    out.push({ key, old: oldRaw, new: newRaw });
  }
  return out;
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
    return { executor: null, changes: [] };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild
      .fetchAuditLogs({
        type: AuditLogEvent.GuildScheduledEventUpdate,
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
      if (entry) {
        return {
          executor: entry.executor || null,
          changes: Array.isArray(entry.changes) ? entry.changes : [],
        };
      }
    }
    if (attempt < 2) await sleep(700);
  }

  return { executor: null, changes: [] };
}

module.exports = {
  name: "guildScheduledEventUpdate",
  async execute(oldEvent, newEvent) {
    try {
      const guild = newEvent?.guild || oldEvent?.guild;
      const eventId = String(newEvent?.id || oldEvent?.id || "");
      if (!guild || !eventId) return;

      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const { executor, changes } = await resolveAudit(guild, eventId);
      const responsibleText = formatAuditActor(executor);
      const eventUrl = toEventUrl(guild.id, eventId);

      let tracked = changes.filter((change) =>
        CHANGE_LABELS.has(String(change?.key || "")),
      );
      if (!tracked.length) {
        tracked = buildFallbackTrackedChanges(oldEvent, newEvent);
      }
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

      await logChannel.send(payload);
    } catch (error) {
      global.logger?.error?.("[guildScheduledEventUpdate] log failed:", error);
    }
  },
};



