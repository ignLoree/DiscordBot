const { AuditLogEvent, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { ARROW, toDiscordTimestamp, yesNo, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible, } = require("../Utils/Logging/channelRolesLogUtils");
const { handleThreadCreationAction: antiNukeHandleThreadCreationAction } = require("../Services/Moderation/antiNukeService");

const THREAD_CREATE_ACTION = AuditLogEvent?.ThreadCreate ?? 110;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveResponsibleWithRetry(guild, threadId, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const audit = await resolveResponsible(
      guild,
      THREAD_CREATE_ACTION,
      (entry) => String(entry?.target?.id || "") === String(threadId || ""),
    );
    if (audit?.executor || audit?.entry) return audit;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return { executor: null, reason: null, entry: null };
}

function threadTypeLabel(threadType) {
  if (threadType === ChannelType.PrivateThread) return "Private Thread";
  if (threadType === ChannelType.PublicThread) return "Public Thread";
  if (threadType === ChannelType.AnnouncementThread) return "Announcement Thread";
  return `Unknown (${Number(threadType || 0)})`;
}

module.exports = {
  name: "threadCreate",
  async execute(thread) {
    try {
      if (!thread?.guild || !thread?.id) return;
      const audit = await resolveResponsibleWithRetry(thread.guild, thread.id);
      const executorId = String(audit?.executor?.id || "");
      const responsible = formatAuditActor(audit.executor);

      if (thread.parent?.type === ChannelType.GuildForum && IDs.roles.Forum) {
        await thread.send({ content: `<@&${IDs.roles.Forum}>` }).catch((error) => {
          global.logger?.error?.("[threadCreate] forum mention failed:", error);
        });
      }

      const logChannel = await resolveChannelRolesLogChannel(thread.guild);
      if (logChannel?.isTextBased?.()) {
        const lines = [
          `${ARROW} **Responsible:** ${responsible}`,
          `${ARROW} **Target:** ${thread} \`${thread.id}\``,
          `${ARROW} ${toDiscordTimestamp(new Date(), "F")}`,
          "",
          "**Settings**",
          `${ARROW} **Name:** ${thread.name || "sconosciuto"}`,
          `${ARROW} **Type:** ${threadTypeLabel(thread.type)}`,
          `${ARROW} **Archived:** ${yesNo(Boolean(thread.archived))}`,
          `${ARROW} **Locked:** ${yesNo(Boolean(thread.locked))}`,
          `${ARROW} **Auto Archive Duration:** ${Number(thread.autoArchiveDuration || 0) ? `${thread.autoArchiveDuration} minutes` : "None"}`,
          `${ARROW} **Rate Limit Per User:** ${Number(thread.rateLimitPerUser || 0) || "None"}`,
        ];

        if (Array.isArray(thread.appliedTags) && thread.appliedTags.length) {
          lines.push(`${ARROW} **Applied Tags:** \`${thread.appliedTags.map((id) => String(id)).join(",")}\``);
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
      });
    } catch (error) {
      global.logger?.error?.("[threadCreate] failed:", error);
    }
  },
};
