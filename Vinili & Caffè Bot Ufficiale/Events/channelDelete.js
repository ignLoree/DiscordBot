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
const AUDIT_RETRY_ATTEMPTS = 4;
const AUDIT_RETRY_DELAY_MS = 900;

function isTicketsCategory(name) {
  return String(name || "")
    .toLowerCase()
    .includes("tickets");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveDeleteAuditWithRetry(guild, channelId) {
  for (let attempt = 0; attempt < AUDIT_RETRY_ATTEMPTS; attempt += 1) {
    const audit = await resolveResponsible(
      guild,
      CHANNEL_DELETE_ACTION,
      (entry) => String(entry?.target?.id || "") === String(channelId || ""),
    );
    if (audit?.entry || audit?.executor) return audit;
    if (attempt < AUDIT_RETRY_ATTEMPTS - 1) {
      await wait(AUDIT_RETRY_DELAY_MS);
    }
  }
  return { executor: null, reason: null, entry: null };
}

module.exports = {
  name: "channelDelete",
  async execute(channel, client) {
    if (!channel?.guildId) return;
    const guild =
      channel.guild ||
      client?.guilds?.cache?.get(channel.guildId) ||
      (await client?.guilds?.fetch?.(channel.guildId).catch(() => null));
    if (!guild) return;

    let executorId = "";
    try {
      const audit = await resolveDeleteAuditWithRetry(guild, channel.id);
      executorId = String(audit?.executor?.id || "");

      const logChannel = await resolveChannelRolesLogChannel(guild);
      if (logChannel?.isTextBased?.()) {
        const responsible = formatAuditActor(audit?.executor || null);

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
    } catch (error) {
      global.logger?.error?.("[channelDelete] log failed:", error);
    }

    await antiNukeHandleChannelDeletionAction({
      guild,
      executorId,
      channelName: String(channel.name || ""),
      channelId: String(channel.id || ""),
      channel,
    }).catch(() => {});

    await markDeletedChannelSnapshot(channel).catch(() => {});

    try {
      const parentId = channel.parentId;
      if (parentId) {
        const parent =
          guild?.channels?.cache?.get(parentId) ||
          (await guild?.channels?.fetch(parentId).catch(() => null));

        if (parent?.type === 4 && isTicketsCategory(parent?.name)) {
          const childrenCount = guild.channels.cache.filter(
            (child) =>
              String(child?.parentId || "") === String(parent.id) &&
              String(child?.id || "") !== String(channel.id || ""),
          ).size;
          if (childrenCount === 0) {
            await parent
              .delete("Auto cleanup empty tickets category")
              .catch(() => {});
          }
        }
      }
    } catch (error) {
      global.logger?.error?.("[channelDelete] tickets-category cleanup failed:", error);
    }

    if (client) {
      queueCategoryRenumber(client, channel.guildId);
      queueIdsCatalogSync(client, channel.guildId, "channelDelete");
    }
  },
};
