const {
  AuditLogEvent,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require("discord.js");
const IDs = require("../Utils/Config/ids");

const DEDUPE_TTL_MS = 15 * 1000;
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

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

function getDedupeStore(client) {
  if (!client._pinAuditDedupe) client._pinAuditDedupe = new Map();
  const now = Date.now();
  for (const [key, ts] of client._pinAuditDedupe.entries()) {
    if (now - Number(ts || 0) > DEDUPE_TTL_MS) {
      client._pinAuditDedupe.delete(key);
    }
  }
  return client._pinAuditDedupe;
}

function buildMessageUrl(guildId, channelId, messageId) {
  if (!guildId || !channelId || !messageId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

async function fetchRecentPinEntry(guild, channelId) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return null;
  }

  const [pinLogs, unpinLogs] = await Promise.all([
    guild
      .fetchAuditLogs({ type: AuditLogEvent.MessagePin, limit: 10 })
      .catch(() => null),
    guild
      .fetchAuditLogs({ type: AuditLogEvent.MessageUnpin, limit: 10 })
      .catch(() => null),
  ]);

  const now = Date.now();
  const combined = [
    ...(pinLogs?.entries ? [...pinLogs.entries.values()] : []),
    ...(unpinLogs?.entries ? [...unpinLogs.entries.values()] : []),
  ];
  const candidates = combined.filter((entry) => {
    const type = entry?.action;
    if (type !== AuditLogEvent.MessagePin && type !== AuditLogEvent.MessageUnpin) {
      return false;
    }
    const createdMs = Number(entry?.createdTimestamp || 0);
    if (!createdMs || now - createdMs > AUDIT_LOOKBACK_MS) return false;

    const targetChannelId = String(entry?.extra?.channel?.id || "");
    return targetChannelId === String(channelId || "");
  });

  if (!candidates.length) return null;
  candidates.sort(
    (a, b) => Number(b?.createdTimestamp || 0) - Number(a?.createdTimestamp || 0),
  );
  return candidates[0] || null;
}

module.exports = {
  name: "channelPinsUpdate",
  async execute(channel, _time, client) {
    try {
      const guild = channel?.guild;
      if (!guild || !channel?.isTextBased?.()) return;

      const entry = await fetchRecentPinEntry(guild, channel.id);
      if (!entry) return;

      const action = entry.action;
      const isPin = action === AuditLogEvent.MessagePin;
      const isUnpin = action === AuditLogEvent.MessageUnpin;
      if (!isPin && !isUnpin) return;

      const messageId = String(entry?.extra?.messageId || "").trim();
      if (!messageId) return;
      const dedupeKey = `${guild.id}:${channel.id}:${messageId}:${String(action)}`;
      const dedupe = getDedupeStore(client);
      if (dedupe.has(dedupeKey)) return;
      dedupe.set(dedupeKey, Date.now());

      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible = formatAuditActor(entry.executor);
      const messageUrl = buildMessageUrl(guild.id, channel.id, messageId);

      const lines = [
        `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsible}`,
        `<:VC_right_arrow:1473441155055096081> **Target:** ${channel} \`${channel.id}\``,
        `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Additional Information**",
        `<:VC_right_arrow:1473441155055096081> **Channel:** ${channel} \`${channel.id}\``,
        `<:VC_right_arrow:1473441155055096081> **Message Id:** \`${messageId || "sconosciuto"}\``,
      ];

      const embed = new EmbedBuilder()
        .setColor(isPin ? "#57F287" : "#ED4245")
        .setTitle(isPin ? "Message Pin" : "Message Unpin")
        .setDescription(lines.join("\n"));

      const payload = { embeds: [embed] };
      if (messageUrl) {
        payload.components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("Go to Message")
              .setURL(messageUrl),
          ),
        ];
      }

      await logChannel.send(payload).catch(() => {});
    } catch (error) {
      global.logger?.error?.("[channelPinsUpdate] log failed:", error);
    }
  },
};



