const {
  AuditLogEvent,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require("discord.js");
const IDs = require("../Utils/Config/ids");

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
    .fetchAuditLogs({ type: AuditLogEvent.GuildScheduledEventCreate, limit: 8 })
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
  name: "guildScheduledEventCreate",
  async execute(scheduledEvent) {
    try {
      const guild = scheduledEvent?.guild;
      if (!guild) return;

      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible = await resolveResponsible(guild, scheduledEvent.id);
      const responsibleText = formatAuditActor(responsible);
      const eventUrl = toEventUrl(guild.id, scheduledEvent.id);

      const lines = [
        `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
        `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Settings**",
        `<:VC_right_arrow:1473441155055096081> **Name:** ${scheduledEvent.name || "sconosciuto"}`,
        `<:VC_right_arrow:1473441155055096081> **Privacy Level:** ${privacyLabel(scheduledEvent.privacyLevel)}`,
        `<:VC_right_arrow:1473441155055096081> **Status:** ${statusLabel(scheduledEvent.status)}`,
        `<:VC_right_arrow:1473441155055096081> **Entity Type:** ${entityTypeLabel(scheduledEvent.entityType)}`,
      ];

      if (scheduledEvent.entityMetadata?.location) {
        lines.push(
          `<:VC_right_arrow:1473441155055096081> **Location:** ${scheduledEvent.entityMetadata.location}`,
        );
      } else if (scheduledEvent.channelId) {
        lines.push(
          `<:VC_right_arrow:1473441155055096081> **Channel:** <#${scheduledEvent.channelId}>`,
        );
      }

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("Guild Scheduled Event Create")
        .setDescription(lines.join("\n"));

      const cover = scheduledEvent.coverImageURL?.({ size: 1024 });
      if (cover) embed.setImage(cover);

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
      global.logger?.error?.("[guildScheduledEventCreate] log failed:", error);
    }
  },
};



