const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const {
  ARROW,
  toDiscordTimestamp,
  permissionList,
  buildAuditExtraLines,
  resolveChannelRolesLogChannel,
  resolveResponsible,
} = require("../Utils/Logging/channelRolesLogUtils");

const ROLE_UPDATE_ACTION = AuditLogEvent?.RoleUpdate ?? 31;

module.exports = {
  name: "roleUpdate",
  async execute(oldRole, newRole, client) {
    const guildId =
      newRole?.guild?.id ||
      oldRole?.guild?.id ||
      newRole?.guildId ||
      oldRole?.guildId;
    if (!guildId) return;

    try {
      const nameChanged = oldRole?.name !== newRole?.name;
      const colorChanged = oldRole?.hexColor !== newRole?.hexColor;
      const hoistChanged = Boolean(oldRole?.hoist) !== Boolean(newRole?.hoist);
      const permsChanged =
        String(oldRole?.permissions?.bitfield || 0n) !==
        String(newRole?.permissions?.bitfield || 0n);

      if (nameChanged || colorChanged || hoistChanged || permsChanged) {
        const logChannel = await resolveChannelRolesLogChannel(newRole.guild);
        if (logChannel?.isTextBased?.()) {
          const audit = await resolveResponsible(
            newRole.guild,
            ROLE_UPDATE_ACTION,
            (entry) => String(entry?.target?.id || "") === String(newRole.id || ""),
          );
          const responsible = audit.executor
            ? `${audit.executor} \`${audit.executor.id}\``
            : "sconosciuto";

          const lines = [
            `${ARROW} **Responsible:** ${responsible}`,
            `${ARROW} **Target:** ${newRole} \`${newRole.id}\``,
            `${ARROW} ${toDiscordTimestamp(new Date(), "F")}`,
            "",
            "**Changes**",
          ];

          if (nameChanged) {
            lines.push(`${ARROW} **Name:** ${oldRole.name} ${ARROW} ${newRole.name}`);
          }
          if (colorChanged) {
            lines.push(
              `${ARROW} **Color:** ${oldRole.hexColor || "#000000"} ${ARROW} ${newRole.hexColor || "#000000"}`,
            );
          }
          if (hoistChanged) {
            lines.push(
              `${ARROW} **Hoist:** ${oldRole.hoist ? "Yes" : "No"} ${ARROW} ${newRole.hoist ? "Yes" : "No"}`,
            );
          }
          if (permsChanged) {
            lines.push(`${ARROW} **Permissions:**`);
            lines.push(
              `  ${ARROW} **Removals:** ${permissionList(oldRole.permissions.bitfield)}`,
            );
            lines.push(
              `  ${ARROW} **Additions:** ${permissionList(newRole.permissions.bitfield)}`,
            );
          }
          lines.push(...buildAuditExtraLines(audit.entry, ["name", "color", "hoist", "permissions"]));

          const embed = new EmbedBuilder()
            .setColor("#F59E0B")
            .setTitle("Role Update")
            .setDescription(lines.join("\n"));

          await logChannel.send({ embeds: [embed] }).catch(() => {});
        }
      }
    } catch {}

    const nameChanged = oldRole?.name !== newRole?.name;
    const positionChanged = oldRole?.position !== newRole?.position;
    if (!nameChanged && !positionChanged) return;

    queueIdsCatalogSync(client, guildId, "roleUpdate");
  },
};
