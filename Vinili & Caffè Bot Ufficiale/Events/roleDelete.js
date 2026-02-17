const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const {
  ARROW,
  toDiscordTimestamp,
  yesNo,
  buildAuditExtraLines,
  resolveChannelRolesLogChannel,
  resolveResponsible,
} = require("../Utils/Logging/channelRolesLogUtils");

const ROLE_DELETE_ACTION = AuditLogEvent?.RoleDelete ?? 32;

module.exports = {
  name: "roleDelete",
  async execute(role, client) {
    const guildId = role?.guild?.id || role?.guildId;
    if (!guildId) return;

    try {
      const guild = role.guild || client.guilds.cache.get(guildId);
      const logChannel = await resolveChannelRolesLogChannel(guild);
      if (logChannel?.isTextBased?.()) {
        const audit = await resolveResponsible(
          guild,
          ROLE_DELETE_ACTION,
          (entry) => String(entry?.target?.id || "") === String(role.id || ""),
        );
        const responsible = audit.executor
          ? `${audit.executor} \`${audit.executor.id}\``
          : "sconosciuto";

        const lines = [
          `${ARROW} **Responsible:** ${responsible}`,
          `${ARROW} ${toDiscordTimestamp(new Date(), "F")}`,
        ];
        if (audit.reason) lines.push(`${ARROW} **Reason:** ${audit.reason}`);
        lines.push(
          "",
          "**Previous Settings**",
          `${ARROW} **Name:** ${role.name || "sconosciuto"}`,
          `${ARROW} **Color:** ${role.hexColor || "#000000"}`,
          `${ARROW} **Hoist:** ${yesNo(Boolean(role.hoist))}`,
          `${ARROW} **Mentionable:** ${yesNo(Boolean(role.mentionable))}`,
        );
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "color", "hoist", "mentionable"]));

        const embed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle("Role Delete")
          .setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch {}

    queueIdsCatalogSync(client, guildId, "roleDelete");
  },
};
