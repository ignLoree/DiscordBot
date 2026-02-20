const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { ARROW, buildAuditExtraLines } = require("../Utils/Logging/channelRolesLogUtils");
const { handleVanityGuard: antiNukeHandleVanityGuard } = require("../Services/Moderation/antiNukeService");
const { resolveModLogChannel, fetchRecentAuditEntry, formatResponsible, nowDiscordTs, } = require("../Utils/Logging/modAuditLogUtils");

function notificationsLabel(value) {
  const n = Number(value);
  if (n === 0) return "All Messages";
  if (n === 1) return "Only Mentions";
  return String(n);
}

function normalizeComparable(value) {
  if (value === null || typeof value === "undefined") return "";
  return String(value);
}

module.exports = {
  name: "guildUpdate",
  async execute(oldGuild, newGuild) {
    try {
      const guild = newGuild || oldGuild;
      if (!guild) return;

      const changes = [];
      if (oldGuild?.name !== newGuild?.name) {
        changes.push(["Name", oldGuild?.name || "N/A", newGuild?.name || "N/A"]);
      }
      if ((oldGuild?.description || "") !== (newGuild?.description || "")) {
        changes.push([
          "Description",
          oldGuild?.description || "N/A",
          newGuild?.description || "N/A",
        ]);
      }
      if (normalizeComparable(oldGuild?.icon) !== normalizeComparable(newGuild?.icon)) {
        changes.push(["Icon Hash", oldGuild?.icon || "N/A", newGuild?.icon || "N/A"]);
      }
      if (normalizeComparable(oldGuild?.banner) !== normalizeComparable(newGuild?.banner)) {
        changes.push([
          "Banner Hash",
          oldGuild?.banner || "N/A",
          newGuild?.banner || "N/A",
        ]);
      }
      if (
        Number(oldGuild?.defaultMessageNotifications) !==
        Number(newGuild?.defaultMessageNotifications)
      ) {
        changes.push([
          "Default Message Notifications",
          notificationsLabel(oldGuild?.defaultMessageNotifications),
          notificationsLabel(newGuild?.defaultMessageNotifications),
        ]);
      }
      if ((oldGuild?.vanityURLCode || "") !== (newGuild?.vanityURLCode || "")) {
        changes.push([
          "Vanity URL Code",
          oldGuild?.vanityURLCode || "N/A",
          newGuild?.vanityURLCode || "N/A",
        ]);
      }
      if (!changes.length) return;
      const vanityChanged =
        (oldGuild?.vanityURLCode || "") !== (newGuild?.vanityURLCode || "");

      const logChannel = await resolveModLogChannel(guild);
      const canLog = Boolean(logChannel?.isTextBased?.());

      let executor = null;
      const auditEntry = await fetchRecentAuditEntry(
        guild,
        AuditLogEvent.GuildUpdate,
        (entry) => String(entry?.target?.id || "") === String(guild.id || ""),
      );
      if (auditEntry?.executor) executor = auditEntry.executor;
      const executorId = String(auditEntry?.executor?.id || "");

      const responsible = formatResponsible(executor);
      const lines = [
        `${ARROW} **Responsible:** ${responsible}`,
        `${ARROW} ${nowDiscordTs()}`,
        "",
        "**Changes**",
      ];

      for (const [label, oldValue, newValue] of changes) {
        lines.push(`${ARROW} **${label}**`);
        lines.push(`  ${oldValue} ${ARROW} ${newValue}`);
      }
      lines.push(
        ...buildAuditExtraLines(auditEntry, [
          "name",
          "description",
          "icon_hash",
          "banner_hash",
          "default_message_notifications",
          "vanity_url_code",
        ]),
      );

      if (canLog) {
        const embed = new EmbedBuilder()
          .setColor("#F59E0B")
          .setTitle("Guild Update")
          .setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] });
      }

      if (vanityChanged) {
        await antiNukeHandleVanityGuard({
          oldGuild,
          newGuild,
          executorId,
        });
      }
    } catch (error) {
      global.logger?.error?.("[guildUpdate] failed:", error);
    }
  },
};
