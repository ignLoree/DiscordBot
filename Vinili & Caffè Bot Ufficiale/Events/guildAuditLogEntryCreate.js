const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { ARROW, buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils");
const {
  resolveModLogChannel,
  formatResponsible,
  nowDiscordTs,
} = require("../Utils/Logging/modAuditLogUtils");

module.exports = {
  name: "guildAuditLogEntryCreate",
  async execute(entry, guild) {
    try {
      if (!entry || !guild) return;
      if (entry.action !== AuditLogEvent.MemberPrune) return;

      const logChannel = await resolveModLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const executor = entry.executor || guild.client.user || null;
      const responsible = formatResponsible(executor);

      const membersRemoved = Number(entry.extra?.removed ?? entry.extra?.membersRemoved ?? 0);
      const deleteDays = Number(entry.extra?.deleteMemberDays ?? entry.extra?.days ?? 0);

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("Member Prune")
        .setDescription(
          [
            `${ARROW} **Responsible:** ${responsible}`,
            `${ARROW} ${nowDiscordTs()}`,
            entry.reason ? `${ARROW} **Reason:** ${entry.reason}` : null,
            "",
            "**Additional Information**",
            `${ARROW} **Count:** ${Number.isFinite(membersRemoved) ? membersRemoved : 0}`,
            `${ARROW} **Days:** ${Number.isFinite(deleteDays) ? deleteDays : 0}`,
            ...buildAuditExtraLines(entry, ["removed", "members_removed", "delete_member_days", "days"]),
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
