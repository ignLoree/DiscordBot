const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { ARROW, buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils");
const {
  resolveModLogChannel,
  fetchRecentAuditEntry,
  formatResponsible,
  nowDiscordTs,
} = require("../Utils/Logging/modAuditLogUtils");


module.exports = {
  name: "guildBanRemove",
  async execute(ban) {
    try {
      const guild = ban?.guild;
      if (!guild) return;

      const logChannel = await resolveModLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      let executor = null;
      let reason = ban?.reason || null;
      const auditEntry = await fetchRecentAuditEntry(
        guild,
        AuditLogEvent.MemberBanRemove,
        (item) => String(item?.target?.id || "") === String(ban.user?.id || ""),
      );
      if (auditEntry?.executor) executor = auditEntry.executor;
      if (auditEntry?.reason) reason = auditEntry.reason;

      const responsible = formatResponsible(executor);

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("Member Ban Remove")
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
    } catch (error) {
      global.logger.error(error);
    }
  },
};
