const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const {
  queueCategoryRenumber,
} = require("../Services/Community/communityOpsService");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const {
  upsertChannelSnapshot,
} = require("../Utils/Community/channelSnapshotUtils");
const {
  ARROW,
  toDiscordTimestamp,
  channelDisplay,
  channelTypeLabel,
  yesNo,
  buildAuditExtraLines,
  resolveChannelRolesLogChannel,
  resolveResponsible,
} = require("../Utils/Logging/channelRolesLogUtils");

const CHANNEL_CREATE_ACTION = AuditLogEvent?.ChannelCreate ?? 10;

module.exports = {
  name: "channelCreate",
  async execute(channel, client) {
    if (!channel?.guildId) return;
    try {
      const logChannel = await resolveChannelRolesLogChannel(channel.guild);
      if (logChannel?.isTextBased?.()) {
        const audit = await resolveResponsible(
          channel.guild,
          CHANNEL_CREATE_ACTION,
          (entry) => String(entry?.target?.id || "") === String(channel.id || ""),
        );

        const responsible = audit.executor
          ? `${audit.executor} \`${audit.executor.id}\``
          : "sconosciuto";
        const lines = [
          `${ARROW} **Responsible:** ${responsible}`,
          `${ARROW} **Target:** ${channelDisplay(channel)} \`${channel.id}\``,
          `${ARROW} ${toDiscordTimestamp(new Date(), "F")}`,
          "",
          "**Settings**",
          `${ARROW} **Name:** ${channel.name || "sconosciuto"}`,
          `${ARROW} **Type:** ${channelTypeLabel(channel)}`,
          `${ARROW} **Nsfw:** ${yesNo(Boolean(channel.nsfw))}`,
          `${ARROW} **Rate Limit Per User:** ${Number(channel.rateLimitPerUser || 0) || "None"}`,
        ];
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "type", "rate_limit_per_user", "nsfw"]));

        const embed = new EmbedBuilder()
          .setColor("#57F287")
          .setTitle("Channel Create")
          .setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch {}

    await upsertChannelSnapshot(channel).catch(() => {});
    queueCategoryRenumber(client, channel.guildId);
    queueIdsCatalogSync(client, channel.guildId, "channelCreate");
  },
};
