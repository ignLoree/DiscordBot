const {
  AuditLogEvent,
  EmbedBuilder,
  PermissionsBitField,
} = require("discord.js");
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
  formatAuditActor,
  buildAuditExtraLines,
  resolveChannelRolesLogChannel,
  resolveResponsible,
} = require("../Utils/Logging/channelRolesLogUtils");
const { handleChannelCreationAction: antiNukeHandleChannelCreationAction } = require("../Services/Moderation/antiNukeService");
const IDs = require("../Utils/Config/ids");

const CHANNEL_CREATE_ACTION = AuditLogEvent?.ChannelCreate ?? 10;
const QUARANTINE_ROLE_ID = String(
  IDs.roles?.Muted || "1442568884833095832",
);

async function forceQuarantineOverwrite(channel) {
  if (!channel?.guild || !QUARANTINE_ROLE_ID) return;
  const me = channel.guild.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) return;
  if (!channel.permissionsFor?.(me)?.has(PermissionsBitField.Flags.ManageChannels)) return;

  const role =
    channel.guild.roles.cache.get(QUARANTINE_ROLE_ID) ||
    (await channel.guild.roles.fetch(QUARANTINE_ROLE_ID).catch(() => null));
  if (!role) return;

  await channel.permissionOverwrites
    .edit(
      role.id,
      {
        ViewChannel: false,
        CreateInstantInvite: false,
        SendMessages: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
      },
      { reason: "Force quarantine deny permissions on new channel" },
    )
    .catch(() => {});
}

module.exports = {
  name: "channelCreate",
  async execute(channel, client) {
    if (!channel?.guildId) return;
    await forceQuarantineOverwrite(channel);
    try {
      let executorId = "";
      const logChannel = await resolveChannelRolesLogChannel(channel.guild);
      if (logChannel?.isTextBased?.()) {
        const audit = await resolveResponsible(
          channel.guild,
          CHANNEL_CREATE_ACTION,
          (entry) => String(entry?.target?.id || "") === String(channel.id || ""),
        );
        executorId = String(audit?.executor?.id || "");

        const responsible = formatAuditActor(audit.executor);
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
      await antiNukeHandleChannelCreationAction({
        guild: channel.guild,
        executorId,
        channelId: String(channel.id || ""),
        channel,
      }).catch(() => {});
    } catch {}

    await upsertChannelSnapshot(channel).catch(() => {});
    queueCategoryRenumber(client, channel.guildId);
    queueIdsCatalogSync(client, channel.guildId, "channelCreate");
  },
};
