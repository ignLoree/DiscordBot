const { EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");
const { getSecurityStaticsSnapshot } = require("../../Services/Moderation/securityProfilesService");

const DEFAULT_LOG_CHANNEL_IDS = [
  IDs.channels?.activityLogs,
  IDs.channels?.modLogs,
  IDs.channels?.highCmds,
].filter(Boolean).map(String);

async function resolveSecurityLogChannel(guild) {
  if (!guild) return null;
  const statics = getSecurityStaticsSnapshot(String(guild.id || ""));
  const dynamicIds = [
    statics?.modLoggingChannelId,
    statics?.loggingChannelId,
  ]
    .filter(Boolean)
    .map(String);
  const candidates = [...dynamicIds, ...DEFAULT_LOG_CHANNEL_IDS];
  if (!candidates.length) return null;
  for (const channelId of candidates) {
    const channel =
      guild.channels.cache.get(channelId) ||
      (await guild.channels.fetch(channelId).catch(() => null));
    if (channel?.isTextBased?.()) return channel;
  }
  return null;
}

async function sendSecurityAuditLog(guild, payload = {}) {
  try {
    const channel = await resolveSecurityLogChannel(guild);
    if (!channel) return { ok: false, reason: "missing_channel" };

    const actorId = String(payload.actorId || "");
    const action = String(payload.action || "Security Action").trim();
    const details = Array.isArray(payload.details)
      ? payload.details.filter(Boolean).map((x) => String(x))
      : [];

    const embed = new EmbedBuilder()
      .setColor(String(payload.color || "#6f4e37"))
      .setTitle(`Security Audit • ${action}`)
      .setDescription(
        [
          actorId ? `Attore: <@${actorId}> \`${actorId}\`` : null,
          ...details,
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => null);
    return { ok: true };
  } catch (error) {
    global.logger?.error?.("[SECURITY_AUDIT] send failed:", error);
    return { ok: false, reason: "send_failed" };
  }
}

module.exports = { sendSecurityAuditLog };
