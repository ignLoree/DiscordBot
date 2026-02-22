const { AuditLogEvent, EmbedBuilder } = require("discord.js");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const { ARROW, toDiscordTimestamp, yesNo, formatAuditActor, buildAuditExtraLines, resolveChannelRolesLogChannel, resolveResponsible, } = require("../Utils/Logging/channelRolesLogUtils");
const { handleRoleDeletionAction: antiNukeHandleRoleDeletionAction } = require("../Services/Moderation/antiNukeService");

const ROLE_DELETE_ACTION = AuditLogEvent?.RoleDelete ?? 32;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveResponsibleWithRetry(guild, roleId, retries = 3, delayMs = 700) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const audit = await resolveResponsible(
      guild,
      ROLE_DELETE_ACTION,
      (entry) => String(entry?.target?.id || "") === String(roleId || ""),
    );
    if (audit?.executor || audit?.entry) return audit;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return { executor: null, reason: null, entry: null };
}

module.exports = {
  name: "roleDelete",
  async execute(role, client) {
    const guildId = role?.guild?.id || role?.guildId;
    if (!guildId) return;

    try {
      const guild =
        role?.guild ||
        client?.guilds?.cache?.get?.(guildId) ||
        (await client?.guilds?.fetch?.(guildId).catch(() => null));
      if (!guild) return;
      let executorId = "";
      const audit = await resolveResponsibleWithRetry(guild, role?.id);
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
      await antiNukeHandleRoleDeletionAction({
        guild,
        executorId,
        roleName: String(role.name || ""),
        roleId: String(role.id || ""),
        roleSnapshot: {
          id: String(role.id || ""),
          name: String(role.name || "restored-role"),
          color: Number(role.color || 0),
          hoist: Boolean(role.hoist),
          mentionable: Boolean(role.mentionable),
          permissions: String(BigInt(role.permissions?.bitfield || 0n)),
          position: Number(role.position || 0),
        },
      });
    } catch (error) {
      global.logger?.error?.("[roleDelete] failed:", error);
    }

    if (client) {
      queueIdsCatalogSync(client, guildId, "roleDelete");
    }
  },
};
