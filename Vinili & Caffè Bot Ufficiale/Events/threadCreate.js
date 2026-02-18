const {
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const IDs = require("../Utils/Config/ids");
const {
  ARROW,
  toDiscordTimestamp,
  yesNo,
  formatAuditActor,
  buildAuditExtraLines,
  resolveChannelRolesLogChannel,
  resolveResponsible,
} = require("../Utils/Logging/channelRolesLogUtils");
const { handleThreadCreationAction: antiNukeHandleThreadCreationAction } = require("../Services/Moderation/antiNukeService");

const THREAD_CREATE_ACTION = AuditLogEvent?.ThreadCreate ?? 110;

module.exports = {
  name: "threadCreate",
  async execute(thread) {
    try {
      if (!thread?.guild) return;
      let executorId = "";

      if (thread.parent?.type === ChannelType.GuildForum) {
        await thread.send({ content: `<@&${IDs.roles.Forum}>` }).catch(() => {});
      }

      const logChannel = await resolveChannelRolesLogChannel(thread.guild);
      if (logChannel?.isTextBased?.()) {
        const audit = await resolveResponsible(
          thread.guild,
          THREAD_CREATE_ACTION,
          (entry) => String(entry?.target?.id || "") === String(thread.id || ""),
        );
        executorId = String(audit?.executor?.id || "");
        const responsible = formatAuditActor(audit.executor);

        const lines = [
          `${ARROW} **Responsible:** ${responsible}`,
          `${ARROW} **Target:** ${thread} \`${thread.id}\``,
          `${ARROW} ${toDiscordTimestamp(new Date(), "F")}`,
          "",
          "**Settings**",
          `${ARROW} **Name:** ${thread.name || "sconosciuto"}`,
          `${ARROW} **Type:** ${thread.type === ChannelType.PrivateThread ? "Private Thread" : "Public Thread"}`,
          `${ARROW} **Archived:** ${yesNo(Boolean(thread.archived))}`,
          `${ARROW} **Locked:** ${yesNo(Boolean(thread.locked))}`,
          `${ARROW} **Auto Archive Duration:** ${Number(thread.autoArchiveDuration || 0) ? `${thread.autoArchiveDuration} minutes` : "None"}`,
          `${ARROW} **Rate Limit Per User:** ${Number(thread.rateLimitPerUser || 0) || "None"}`,
        ];

        if (Array.isArray(thread.appliedTags) && thread.appliedTags.length) {
          lines.push(`${ARROW} **Applied Tags:** \`${thread.appliedTags.join(",")}\``);
        }
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "type", "archived", "locked", "auto_archive_duration", "rate_limit_per_user", "applied_tags"]));

        const embed = new EmbedBuilder()
          .setColor("#57F287")
          .setTitle("Thread Create")
          .setDescription(lines.join("\n"));

        const payload = { embeds: [embed] };
        if (thread.url) {
          payload.components = [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel("Go to Thread")
                .setURL(thread.url),
            ),
          ];
        }

        await logChannel.send(payload).catch(() => {});
      }
      await antiNukeHandleThreadCreationAction({
        guild: thread.guild,
        executorId,
        threadId: String(thread.id || ""),
        thread,
      }).catch(() => {});
    } catch (error) {
      global.logger.error(error);
    }
  },
};
