const { AuditLogEvent, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, } = require("discord.js");
const IDs = require("../Utils/Config/ids");

const DEDUPE_TTL_MS = 15 * 1000;
const AUDIT_LOOKBACK_MS = 120 * 1000;
const AUDIT_FETCH_LIMIT = 10;
const AUDIT_RETRY_ATTEMPTS = 4;
const AUDIT_RETRY_DELAY_MS = 900;
const fallbackPinAuditDedupe = new Map();

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
  const store = client
    ? (client._pinAuditDedupe = client._pinAuditDedupe || new Map())
    : fallbackPinAuditDedupe;
  const now = Date.now();
  for (const [key, ts] of store.entries()) {
    if (now - Number(ts || 0) > DEDUPE_TTL_MS) {
      store.delete(key);
    }
  }
  return store;
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
      .fetchAuditLogs({ type: AuditLogEvent.MessagePin, limit: AUDIT_FETCH_LIMIT })
      .catch(() => null),
    guild
      .fetchAuditLogs({ type: AuditLogEvent.MessageUnpin, limit: AUDIT_FETCH_LIMIT })
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRecentPinEntryWithRetry(guild, channelId) {
  for (let attempt = 0; attempt < AUDIT_RETRY_ATTEMPTS; attempt += 1) {
    const entry = await fetchRecentPinEntry(guild, channelId);
    if (entry) return entry;
    if (attempt < AUDIT_RETRY_ATTEMPTS - 1) {
      await wait(AUDIT_RETRY_DELAY_MS);
    }
  }
  return null;
}

module.exports = {
  name: "channelPinsUpdate",
  async execute(channel, _time, client) {
    try {
      const guild = channel?.guild;
      if (!guild || !channel?.isTextBased?.()) return;

      const entry = await fetchRecentPinEntryWithRetry(guild, channel.id);
      if (!entry) return;

      const action = entry.action;
      const isPin = action === AuditLogEvent.MessagePin;
      const isUnpin = action === AuditLogEvent.MessageUnpin;
      if (!isPin && !isUnpin) return;

      const messageId = String(entry?.extra?.messageId || "").trim();
      const dedupeMessagePart = messageId || `audit:${String(entry?.id || "unknown")}`;
      const dedupeKey = `${guild.id}:${channel.id}:${dedupeMessagePart}:${String(action)}`;
      const dedupe = getDedupeStore(client);
      if (dedupe.has(dedupeKey)) return;
      dedupe.set(dedupeKey, Date.now());

      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible = formatAuditActor(entry.executor);
      const messageUrl = messageId
        ? buildMessageUrl(guild.id, channel.id, messageId)
        : null;

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
