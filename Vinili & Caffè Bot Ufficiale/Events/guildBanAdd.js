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


module.exports = {
  name: "guildBanAdd",
  async execute(ban) {
    try {
      const guild = ban?.guild;
      if (!guild) return;

      scheduleMemberCounterRefresh(guild, { delayMs: 450, secondPassMs: 2600 });

      const logChannel = await resolveModLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      let executor = null;
      let reason = ban?.reason || null;
      const auditEntry = await fetchRecentAuditEntry(
        guild,
        AuditLogEvent.MemberBanAdd,
        (item) => String(item?.target?.id || "") === String(ban.user?.id || ""),
      );
      if (auditEntry?.executor) executor = auditEntry.executor;
      if (auditEntry?.reason) reason = auditEntry.reason;
      const executorId = String(auditEntry?.executor?.id || "");

      const responsible = formatResponsible(executor);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("Member Ban Add")
        .setDescription(
          [
            `${ARROW} **Responsible:** ${responsible}`,
            `${ARROW} **Target:** ${ban.user} \`${ban.user?.id || "sconosciuto"}\``,
            `${ARROW} ${nowDiscordTs()}`,
            reason ? `${ARROW} **Reason:** ${reason}` : null,
            ...buildAuditExtraLines(auditEntry, ["reason"]),
          ]
            .filter(Boolean)
            .join("\n"),
        );

      await logChannel.send({ embeds: [embed] }).catch(() => {});
      await antiNukeHandleKickBanAction({
        guild,
        executorId,
        action: "ban",
        targetId: String(ban.user?.id || ""),
      }).catch(() => {});
    } catch (error) {
      global.logger.error(error);
    }
  },
};
