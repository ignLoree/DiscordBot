const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");

const INVITE_DELETE_ACTION = AuditLogEvent?.InviteDelete ?? 42;

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function formatMaxAge(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  if (!safe) return "Never";
  const days = safe / 86400;
  if (Number.isInteger(days)) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = safe / 3600;
  if (Number.isInteger(hours)) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const mins = Math.floor(safe / 60);
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function resolveResponsible(guild, code) {
  if (
    !guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)
  ) {
    return guild?.client?.user || null;
  }

  const logs = await guild
    .fetchAuditLogs({ type: INVITE_DELETE_ACTION, limit: 8 })
    .catch(() => null);
  if (!logs?.entries?.size) return guild?.client?.user || null;

  const now = Date.now();
  const entry = logs.entries.find((item) => {
    const created = Number(item?.createdTimestamp || 0);
    const within = created > 0 && now - created <= 30 * 1000;
    return within && String(item?.target?.code || "") === String(code || "");
  });

  return entry?.executor || guild?.client?.user || null;
}

module.exports = {
  name: "inviteDelete",
  async execute(invite) {
    try {
      const client = invite.client;
      const cache = client.inviteCache?.get(invite.guild.id);
      if (cache) {
        cache.delete(invite.code);
      }

      const guild = invite.guild;
      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible = await resolveResponsible(guild, invite.code);
      const responsibleText = responsible
        ? `${responsible} \`${responsible.id}\``
        : "sconosciuto";
      const channelText = invite.channel ? `${invite.channel}` : "#sconosciuto";

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("Invite Delete")
        .setDescription(
          [
            `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
            `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
            "",
            "**Previous Settings**",
            `<:VC_right_arrow:1473441155055096081> **Code:** ${invite.code || "sconosciuto"}`,
            `<:VC_right_arrow:1473441155055096081> **Channel:** ${channelText}`,
            `<:VC_right_arrow:1473441155055096081> **Uses:** ${Number.isFinite(invite.uses) ? invite.uses : 0}`,
            `<:VC_right_arrow:1473441155055096081> **Max Uses:** ${Number.isFinite(invite.maxUses) ? invite.maxUses : 0}`,
            `<:VC_right_arrow:1473441155055096081> **Max Age:** ${formatMaxAge(invite.maxAge)}`,
            `<:VC_right_arrow:1473441155055096081> **Temporary:** ${yesNo(Boolean(invite.temporary))}`,
          ].join("\n"),
        );

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (error) {
      global.logger.error("[INVITE DELETE] Failed:", error);
    }
  },
};


