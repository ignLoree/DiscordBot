const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");

const STICKER_UPDATE_ACTION = AuditLogEvent?.StickerUpdate ?? 91;

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
}

async function resolveAudit(guild, stickerId) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) {
    return { executor: guild?.client?.user || null, changes: [] };
  }
  const logs = await guild.fetchAuditLogs({ type: STICKER_UPDATE_ACTION, limit: 8 }).catch(() => null);
  if (!logs?.entries?.size) return { executor: guild?.client?.user || null, changes: [] };
  const now = Date.now();
  const entry = logs.entries.find((item) => {
    const created = Number(item?.createdTimestamp || 0);
    const within = created > 0 && now - created <= 30 * 1000;
    return within && String(item?.target?.id || "") === String(stickerId || "");
  });
  return {
    executor: entry?.executor || guild?.client?.user || null,
    changes: Array.isArray(entry?.changes) ? entry.changes : [],
  };
}

function getChange(changes, key) {
  return changes.find((c) => String(c?.key || "") === key) || null;
}

module.exports = {
  name: "stickerUpdate",
  async execute(oldSticker, newSticker) {
    try {
      const guild = newSticker?.guild || oldSticker?.guild;
      if (!guild) return;
      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const { executor, changes } = await resolveAudit(guild, newSticker?.id || oldSticker?.id);
      const responsibleText = executor ? `${executor} \`${executor.id}\`` : "sconosciuto";

      const nameChange = getChange(changes, "name");
      const tagsChange = getChange(changes, "tags");
      if (!nameChange && !tagsChange) return;

      const lines = [
        `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
        `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Changes**",
      ];

      if (nameChange) {
        lines.push(`<:VC_right_arrow:1473441155055096081> **Name**`);
        lines.push(`  ${String(nameChange?.old ?? oldSticker?.name ?? "sconosciuto")} <:VC_right_arrow:1473441155055096081> ${String(nameChange?.new ?? newSticker?.name ?? "sconosciuto")}`);
      }
      if (tagsChange) {
        lines.push(`<:VC_right_arrow:1473441155055096081> **Tags**`);
        lines.push(`  ${String(tagsChange?.old ?? oldSticker?.tags ?? "-")} <:VC_right_arrow:1473441155055096081> ${String(tagsChange?.new ?? newSticker?.tags ?? "-")}`);
      }

      const embed = new EmbedBuilder()
        .setColor("#F59E0B")
        .setTitle("Sticker Update")
        .setDescription(lines.join("\n"));

      if (newSticker?.url) embed.setThumbnail(newSticker.url);
      await logChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (error) {
      global.logger?.error?.("[stickerUpdate] log failed:", error);
    }
  },
};


