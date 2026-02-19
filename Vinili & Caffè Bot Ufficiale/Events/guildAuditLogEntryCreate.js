const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { ARROW, buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils");
const { handlePruneAction: antiNukeHandlePruneAction } = require("../Services/Moderation/antiNukeService");
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

      const executor = entry.executor || null;
      const responsible = formatResponsible(executor);

      const rawMembersRemoved = Number(entry.extra?.removed ?? entry.extra?.membersRemoved ?? 0);
      const rawDeleteDays = Number(entry.extra?.deleteMemberDays ?? entry.extra?.days ?? 0);
      const membersRemoved = Number.isFinite(rawMembersRemoved) ? Math.max(0, rawMembersRemoved) : 0;
      const deleteDays = Number.isFinite(rawDeleteDays) ? Math.max(0, rawDeleteDays) : 0;
      const extraLines = buildAuditExtraLines(entry, ["removed", "members_removed", "delete_member_days", "days"]);
      const cleanedExtraLines = extraLines.filter(
        (line, index) => !(index === 0 && line === "") && line !== "**Additional Information**",
      );

      if (logChannel?.isTextBased?.()) {
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
              `${ARROW} **Count:** ${membersRemoved}`,
              `${ARROW} **Days:** ${deleteDays}`,
              ...(cleanedExtraLines.length ? ["", "**Audit Details**", ...cleanedExtraLines] : []),
            ]
              .filter(Boolean)
              .join("\n"),
          );

        await logChannel.send({ embeds: [embed] });
      }
      await antiNukeHandlePruneAction({
        guild,
        executorId: String(entry?.executor?.id || ""),
        removedCount: membersRemoved,
      });
    } catch (error) {
      global.logger?.error?.("[guildAuditLogEntryCreate] failed:", error);
    }
  },
};
