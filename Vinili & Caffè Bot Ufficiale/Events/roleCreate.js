const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const {
  ARROW,
  toDiscordTimestamp,
  yesNo,
  formatAuditActor,
  buildAuditExtraLines,
  resolveChannelRolesLogChannel,
  resolveResponsible,
} = require("../Utils/Logging/channelRolesLogUtils");
const { handleRoleCreationAction: antiNukeHandleRoleCreationAction } = require("../Services/Moderation/antiNukeService");

const ROLE_CREATE_ACTION = AuditLogEvent?.RoleCreate ?? 30;

module.exports = {
  name: "roleCreate",
  async execute(role, client) {
    const guildId = role?.guild?.id || role?.guildId;
    if (!guildId) return;

    try {
      let executorId = "";
      const audit = await resolveResponsible(
        role.guild,
        ROLE_CREATE_ACTION,
        (entry) => String(entry?.target?.id || "") === String(role.id || ""),
      );
      executorId = String(audit?.executor?.id || "");
      const logChannel = await resolveChannelRolesLogChannel(role.guild);
      if (logChannel?.isTextBased?.()) {
        const responsible = formatAuditActor(audit.executor);

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
      await antiNukeHandleRoleCreationAction({
        guild: role.guild,
        executorId,
        roleId: String(role.id || ""),
      }).catch(() => {});
    } catch {}

    queueIdsCatalogSync(client, guildId, "roleCreate");
  },
};
