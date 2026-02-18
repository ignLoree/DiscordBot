const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const {
  queueCategoryRenumber,
} = require("../Services/Community/communityOpsService");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const {
  markDeletedChannelSnapshot,
} = require("../Utils/Community/channelSnapshotUtils");
const {
  ARROW,
  toDiscordTimestamp,
  channelTypeLabel,
  formatAuditActor,
  buildAuditExtraLines,
  resolveChannelRolesLogChannel,
  resolveResponsible,
} = require("../Utils/Logging/channelRolesLogUtils");
const { handleChannelDeletionAction: antiNukeHandleChannelDeletionAction } = require("../Services/Moderation/antiNukeService");

const CHANNEL_DELETE_ACTION = AuditLogEvent?.ChannelDelete ?? 12;

function isTicketsCategory(name) {
  return String(name || "")
    .toLowerCase()
    .includes("tickets");
}

module.exports = {
  name: "channelDelete",
  async execute(channel, client) {
    if (!channel?.guildId) return;
    try {
      const guild =
        channel.guild ||
        client.guilds.cache.get(channel.guildId) ||
        (await client.guilds.fetch(channel.guildId).catch(() => null));
      let executorId = "";
      const audit = await resolveResponsible(
        guild,
        CHANNEL_DELETE_ACTION,
        (entry) => String(entry?.target?.id || "") === String(channel.id || ""),
      );
      executorId = String(audit?.executor?.id || "");

      const logChannel = await resolveChannelRolesLogChannel(guild);
      if (logChannel?.isTextBased?.()) {
        const responsible = formatAuditActor(audit.executor);

        const lines = [
          `${ARROW} **Responsible:** ${responsible}`,
          `${ARROW} ${toDiscordTimestamp(new Date(), "F")}`,
        ];

        if (audit.reason) lines.push(`${ARROW} **Reason:** ${audit.reason}`);

        lines.push(
          "",
          "**Previous Settings**",
          `${ARROW} **Name:** ${channel.name || "sconosciuto"} \`[${channel.id}]\``,
          `${ARROW} **Type:** ${channelTypeLabel(channel)}`,
        );
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "type"]));

        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle("Channel Delete")
          .setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
      await antiNukeHandleChannelDeletionAction({
        guild,
        executorId,
        channelName: String(channel.name || ""),
        channelId: String(channel.id || ""),
        channel,
      }).catch(() => {});
    } catch {}

    await markDeletedChannelSnapshot(channel).catch(() => {});

    try {
      const parentId = channel.parentId;
      if (parentId) {
        const guild =
          channel.guild ||
          client.guilds.cache.get(channel.guildId) ||
          (await client.guilds.fetch(channel.guildId).catch(() => null));
        const parent =
          guild?.channels?.cache?.get(parentId) ||
          (await guild?.channels?.fetch(parentId).catch(() => null));

        if (parent?.type === 4 && isTicketsCategory(parent?.name)) {
          const childrenCount = parent.children?.cache?.size ?? 0;
          if (childrenCount === 0) {
            await parent
              .delete("Auto cleanup empty tickets category")
              .catch(() => {});
          }
        }
      }
    } catch {}

    queueCategoryRenumber(client, channel.guildId);
    queueIdsCatalogSync(client, channel.guildId, "channelDelete");
  },
};
