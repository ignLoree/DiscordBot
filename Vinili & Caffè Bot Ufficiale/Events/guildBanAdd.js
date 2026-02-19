const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const {
  scheduleMemberCounterRefresh,
} = require("../Utils/Community/memberCounterUtils");
const { ARROW, buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils");
const {
  resolveModLogChannel,
  fetchRecentAuditEntry,
  formatResponsible,
  nowDiscordTs,
} = require("../Utils/Logging/modAuditLogUtils");
const { handleKickBanAction: antiNukeHandleKickBanAction } = require("../Services/Moderation/antiNukeService");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveBanAuditEntry(guild, targetUserId, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const entry = await fetchRecentAuditEntry(
      guild,
      AuditLogEvent.MemberBanAdd,
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
  name: "guildBanAdd",
  async execute(ban) {
    try {
      const guild = ban?.guild;
      if (!guild) return;
      const targetId = String(ban?.user?.id || "");
      if (!targetId) return;

      scheduleMemberCounterRefresh(guild, { delayMs: 450, secondPassMs: 2600 });

      let executor = null;
      let reason = normalizeReason(ban?.reason);
      const auditEntry = await resolveBanAuditEntry(guild, targetId);
      if (auditEntry?.executor) executor = auditEntry.executor;
      if (auditEntry?.reason) reason = normalizeReason(auditEntry.reason);
      const executorId = String(auditEntry?.executor?.id || "");

      const logChannel = await resolveModLogChannel(guild);
      if (logChannel?.isTextBased?.()) {
        const responsible = formatResponsible(executor);

        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle("Member Banned")
          .setDescription(
            [
              `${ARROW} **Responsible:** ${responsible}`,
              `${ARROW} **Target:** ${ban.user || "sconosciuto"} \`${targetId}\``,
              `${ARROW} ${nowDiscordTs()}`,
              reason ? `${ARROW} **Reason:** ${reason}` : null,
              ...buildAuditExtraLines(auditEntry, ["reason"]),
            ]
              .filter(Boolean)
              .join("\n"),
          );

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
      await antiNukeHandleKickBanAction({
        guild,
        executorId,
        action: "ban",
        targetId,
      });
    } catch (error) {
      global.logger?.error?.("[guildBanAdd] failed:", error);
    }
  },
};
