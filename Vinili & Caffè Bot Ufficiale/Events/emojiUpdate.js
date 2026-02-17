const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");

const EMOJI_UPDATE_ACTION = AuditLogEvent?.EmojiUpdate ?? 61;

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

async function resolveAuditChange(guild, emojiId) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) {
    return { executor: guild?.client?.user || null, oldName: null, newName: null };
  }

  const logs = await guild.fetchAuditLogs({ type: EMOJI_UPDATE_ACTION, limit: 8 }).catch(() => null);
  if (!logs?.entries?.size) return { executor: guild?.client?.user || null, oldName: null, newName: null };

  const now = Date.now();
  const entry = logs.entries.find((item) => {
    const created = Number(item?.createdTimestamp || 0);
    const within = created > 0 && now - created <= 30 * 1000;
    return within && String(item?.target?.id || "") === String(emojiId || "");
  });

  const nameChange = Array.isArray(entry?.changes)
    ? entry.changes.find((c) => String(c?.key || "") === "name")
    : null;

  return {
    executor: entry?.executor || guild?.client?.user || null,
    oldName: nameChange?.old ?? null,
    newName: nameChange?.new ?? null,
  };
}

module.exports = {
  name: "emojiUpdate",
  async execute(oldEmoji, newEmoji) {
    try {
      const guild = newEmoji?.guild || oldEmoji?.guild;
      if (!guild) return;
      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const { executor, oldName, newName } = await resolveAuditChange(guild, newEmoji?.id || oldEmoji?.id);
      const responsibleText = executor ? `${executor} \`${executor.id}\`` : "sconosciuto";
      const fromName = String(oldName ?? oldEmoji?.name ?? "sconosciuto");
      const toName = String(newName ?? newEmoji?.name ?? "sconosciuto");

      if (fromName === toName) return;

      const embed = new EmbedBuilder()
        .setColor("#F59E0B")
        .setTitle("Emoji Update")
        .setDescription(
          [
            `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
            `<:VC_right_arrow:1473441155055096081> **Target:** ${newEmoji?.name || oldEmoji?.name || "emoji"} \`${newEmoji?.id || oldEmoji?.id || "sconosciuto"}\``,
            `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
            "",
            "**Changes**",
            `<:VC_right_arrow:1473441155055096081> **Name**`,
            `  ${fromName} <:VC_right_arrow:1473441155055096081> ${toName}`,
          ].join("\n"),
        );

      const imageUrl = newEmoji?.imageURL?.({ extension: "png", size: 256 }) || newEmoji?.url || null;
      if (imageUrl) embed.setThumbnail(imageUrl);

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (error) {
      global.logger?.error?.("[emojiUpdate] log failed:", error);
    }
  },
};


