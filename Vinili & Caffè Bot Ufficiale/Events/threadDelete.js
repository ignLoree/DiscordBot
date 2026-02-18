const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const {
  ARROW,
  toDiscordTimestamp,
  yesNo,
  formatAuditActor,
  buildAuditExtraLines,
  resolveChannelRolesLogChannel,
  resolveResponsible,
} = require("../Utils/Logging/channelRolesLogUtils");

const THREAD_DELETE_ACTION = AuditLogEvent?.ThreadDelete ?? 112;

module.exports = {
  name: "threadDelete",
  async execute(thread) {
    try {
      const guild = thread?.guild;
      if (!guild) return;

      const logChannel = await resolveChannelRolesLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const audit = await resolveResponsible(
        guild,
        THREAD_DELETE_ACTION,
        (entry) => String(entry?.target?.id || "") === String(thread?.id || ""),
      );
      const responsible = formatAuditActor(audit.executor);

      const lines = [
        `${ARROW} **Responsible:** ${responsible}`,
        `${ARROW} ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Previous Settings**",
        `${ARROW} **Name:** ${thread?.name || "sconosciuto"} \`[${thread?.id || "sconosciuto"}]\``,
        `${ARROW} **Type:** ${thread?.type === 12 ? "Private Thread" : "Public Thread"}`,
        `${ARROW} **Archived:** ${yesNo(Boolean(thread?.archived))}`,
        `${ARROW} **Locked:** ${yesNo(Boolean(thread?.locked))}`,
        `${ARROW} **Auto Archive Duration:** ${Number(thread?.autoArchiveDuration || 0) ? `${thread.autoArchiveDuration} minutes` : "None"}`,
        `${ARROW} **Rate Limit Per User:** ${Number(thread?.rateLimitPerUser || 0) || "None"}`,
      ];

      if (Array.isArray(thread?.appliedTags) && thread.appliedTags.length) {
        lines.push(`${ARROW} **Applied Tags:** \`${thread.appliedTags.join(",")}\``);
      }
      lines.push(...buildAuditExtraLines(audit.entry, ["name", "type", "archived", "locked", "auto_archive_duration", "rate_limit_per_user", "applied_tags"]));

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("Thread Delete")
        .setDescription(lines.join("\n"));

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (error) {
      global.logger?.error?.("[threadDelete] log failed:", error);
    }
  },
};
