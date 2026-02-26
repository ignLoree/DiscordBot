const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { ARROW, toDiscordTimestamp, yesNo, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible, } = require("../Utils/Logging/channelRolesLogUtils");
const { handleThreadDeletionAction: antiNukeHandleThreadDeletionAction } = require("../Services/Moderation/antiNukeService");

const THREAD_DELETE_ACTION = AuditLogEvent?.ThreadDelete ?? 112;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveResponsibleWithRetry(guild, threadId, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const audit = await resolveResponsible(
      guild,
      THREAD_DELETE_ACTION,
      (entry) => String(entry?.target?.id || "") === String(threadId || ""),
    );
    if (audit?.executor || audit?.entry) return audit;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return { executor: null, reason: null, entry: null };
}

function threadTypeLabel(threadType) {
  const value = Number(threadType || 0);
  if (value === 12) return "Thread privato";
  if (value === 11) return "Thread pubblico";
  if (value === 10) return "Thread annuncio";
  return `Sconosciuto (${value})`;
}

module.exports = {
  name: "threadDelete",
  async execute(thread) {
    try {
      const guild = thread?.guild;
      const threadId = String(thread?.id || "");
      if (!guild || !threadId) return;
      const audit = await resolveResponsibleWithRetry(guild, threadId);
      const executorId = String(audit?.executor?.id || "");
      const responsible = formatAuditActor(audit.executor);

      const logChannel = await resolveChannelRolesLogChannel(guild);
      if (logChannel?.isTextBased?.()) {
        const lines = [
          `${ARROW} **Responsible:** ${responsible}`,
          `${ARROW} ${toDiscordTimestamp(new Date(), "F")}`,
          "",
          "**Previous Settings**",
          `${ARROW} **Name:** ${thread?.name || "sconosciuto"} \`[${threadId}]\``,
          `${ARROW} **Type:** ${threadTypeLabel(thread?.type)}`,
          `${ARROW} **Archived:** ${yesNo(Boolean(thread?.archived))}`,
          `${ARROW} **Bloccato:** ${yesNo(Boolean(thread?.locked))}`,
          `${ARROW} **Durata auto-archiviazione:** ${Number(thread?.autoArchiveDuration || 0) ? `${thread.autoArchiveDuration} minuti` : "Nessuna"}`,
          `${ARROW} **Slowmode per utente:** ${Number(thread?.rateLimitPerUser || 0) || "Nessuna"}`,
        ];

        if (Array.isArray(thread?.appliedTags) && thread.appliedTags.length) {
          lines.push(`${ARROW} **Tag applicati:** \`${thread.appliedTags.map((id) => String(id)).join(",")}\``);
        }
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "type", "archived", "locked", "auto_archive_duration", "rate_limit_per_user", "applied_tags"]));

        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle("Eliminazione thread")
          .setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
      await antiNukeHandleThreadDeletionAction({
        guild,
        executorId,
        threadName: String(thread?.name || ""),
        threadId,
        thread,
      });
    } catch (error) {
      global.logger?.error?.("[threadDelete] failed:", error);
    }
  },
};