const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { ARROW, buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils");
const { resolveModLogChannel, fetchRecentAuditEntry, formatResponsible, nowDiscordTs, } = require("../Utils/Logging/modAuditLogUtils");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveUnbanAuditEntry(guild, targetUserId, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const entry = await fetchRecentAuditEntry(
      guild,
      AuditLogEvent.MemberBanRemove,
      (item) => String(item?.target?.id || "") === String(targetUserId || ""),
    );
    if (entry) return entry;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return null;
}

function normalizeReason(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length <= 900) return text;
  return `${text.slice(0, 897)}...`;
}

module.exports = {
  name: "guildBanRemove",
  async execute(ban) {
    try {
      const guild = ban?.guild;
      if (!guild) return;
      const targetId = String(ban?.user?.id || "");
      if (!targetId) return;

      const logChannel = await resolveModLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      let executor = null;
      let reason = normalizeReason(ban?.reason);
      const auditEntry = await resolveUnbanAuditEntry(guild, targetId);
      if (auditEntry?.executor) executor = auditEntry.executor;
      if (auditEntry?.reason) reason = normalizeReason(auditEntry.reason);

      const responsible = formatResponsible(executor);

      const targetLabel = ban.user ? `${ban.user}` : "sconosciuto";
      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("Ban Removed")
        .setDescription(
          [
            `${ARROW} **Ban for** ${targetLabel} **has been removed**`,
            `${ARROW} **Responsible:** ${responsible}`,
            `${ARROW} ${nowDiscordTs()}`,
            reason ? `${ARROW} **Reason:** ${reason}` : null,
            ...buildAuditExtraLines(auditEntry, ["reason"]),
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .setFooter({ text: `ID: ${targetId}` })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] }).catch(() => null);
    } catch (error) {
      global.logger?.error?.("[guildBanRemove] failed:", error);
    }
  },
};
