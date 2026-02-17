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

const ROLE_CREATE_ACTION = AuditLogEvent?.RoleCreate ?? 30;

module.exports = {
  name: "roleCreate",
  async execute(role, client) {
    const guildId = role?.guild?.id || role?.guildId;
    if (!guildId) return;

    try {
      const logChannel = await resolveChannelRolesLogChannel(role.guild);
      if (logChannel?.isTextBased?.()) {
        const audit = await resolveResponsible(
          role.guild,
          ROLE_CREATE_ACTION,
          (entry) => String(entry?.target?.id || "") === String(role.id || ""),
        );
        const responsible = audit.executor
          ? `${audit.executor} \`${audit.executor.id}\``
          : "sconosciuto";

        const lines = [
          `${ARROW} **Responsible:** ${responsible}`,
          `${ARROW} **Target:** ${role} \`${role.id}\``,
          `${ARROW} ${toDiscordTimestamp(new Date(), "F")}`,
          "",
          "**Settings**",
          `${ARROW} **Name:** ${role.name || "sconosciuto"}`,
          `${ARROW} **Color:** ${role.hexColor || "#000000"}`,
          `${ARROW} **Hoist:** ${yesNo(Boolean(role.hoist))}`,
          `${ARROW} **Mentionable:** ${yesNo(Boolean(role.mentionable))}`,
        ];
        lines.push(...buildAuditExtraLines(audit.entry, ["name", "color", "hoist", "mentionable"]));

        const embed = new EmbedBuilder()
          .setColor("#57F287")
          .setTitle("Role Create")
          .setDescription(lines.join("\n"));

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch {}

    queueIdsCatalogSync(client, guildId, "roleCreate");
  },
};
