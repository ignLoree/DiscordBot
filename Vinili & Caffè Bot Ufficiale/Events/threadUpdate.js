const {
  AuditLogEvent,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  ARROW,
  toDiscordTimestamp,
  yesNo,
  buildAuditExtraLines,
  resolveChannelRolesLogChannel,
  resolveResponsible,
} = require("../Utils/Logging/channelRolesLogUtils");

const THREAD_UPDATE_ACTION = AuditLogEvent?.ThreadUpdate ?? 111;

module.exports = {
  name: "threadUpdate",
  async execute(oldThread, newThread) {
    try {
      const guild = newThread?.guild || oldThread?.guild;
      if (!guild) return;

      const nameChanged = oldThread?.name !== newThread?.name;
      const archivedChanged = Boolean(oldThread?.archived) !== Boolean(newThread?.archived);
      const lockedChanged = Boolean(oldThread?.locked) !== Boolean(newThread?.locked);
      const tagsChanged =
        String((oldThread?.appliedTags || []).join(",")) !==
        String((newThread?.appliedTags || []).join(","));
      if (!nameChanged && !archivedChanged && !lockedChanged && !tagsChanged) return;

      const logChannel = await resolveChannelRolesLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const audit = await resolveResponsible(
        guild,
        THREAD_UPDATE_ACTION,
        (entry) => String(entry?.target?.id || "") === String(newThread?.id || ""),
      );
      const responsible = audit.executor
        ? `${audit.executor} \`${audit.executor.id}\``
        : "sconosciuto";

      const lines = [
        `${ARROW} **Responsible:** ${responsible}`,
        `${ARROW} **Target:** ${newThread} \`${newThread.id}\``,
        `${ARROW} ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Changes**",
      ];

      if (nameChanged) {
        lines.push(`${ARROW} **Name:** ${oldThread.name || "sconosciuto"} ${ARROW} ${newThread.name || "sconosciuto"}`);
      }
      if (archivedChanged) {
        lines.push(
          `${ARROW} **Archived:** ${yesNo(Boolean(oldThread.archived))} ${ARROW} ${yesNo(Boolean(newThread.archived))}`,
        );
      }
      if (lockedChanged) {
        lines.push(
          `${ARROW} **Locked:** ${yesNo(Boolean(oldThread.locked))} ${ARROW} ${yesNo(Boolean(newThread.locked))}`,
        );
      }
      if (tagsChanged) {
        lines.push(
          `${ARROW} **Applied Tags:** \`${(oldThread.appliedTags || []).join(",") || "none"}\` ${ARROW} \`${(newThread.appliedTags || []).join(",") || "none"}\``,
        );
      }
      lines.push(...buildAuditExtraLines(audit.entry, ["name", "archived", "locked", "applied_tags"]));

      const embed = new EmbedBuilder()
        .setColor("#F59E0B")
        .setTitle("Thread Update")
        .setDescription(lines.join("\n"));

      const payload = { embeds: [embed] };
      if (newThread?.url) {
        payload.components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("Go to Thread")
              .setURL(newThread.url),
          ),
        ];
      }

      await logChannel.send(payload).catch(() => {});
    } catch (error) {
      global.logger?.error?.("[threadUpdate] log failed:", error);
    }
  },
};
