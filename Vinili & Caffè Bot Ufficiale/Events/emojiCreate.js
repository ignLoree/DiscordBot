const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");

const EMOJI_CREATE_ACTION = AuditLogEvent?.EmojiCreate ?? 60;

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

async function resolveResponsible(guild, emojiId) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) {
    return guild?.client?.user || null;
  }
  const logs = await guild.fetchAuditLogs({ type: EMOJI_CREATE_ACTION, limit: 8 }).catch(() => null);
  if (!logs?.entries?.size) return guild?.client?.user || null;
  const now = Date.now();
  const entry = logs.entries.find((item) => {
    const created = Number(item?.createdTimestamp || 0);
    const within = created > 0 && now - created <= 30 * 1000;
    return within && String(item?.target?.id || "") === String(emojiId || "");
  });
  return entry?.executor || guild?.client?.user || null;
}

module.exports = {
  name: "emojiCreate",
  async execute(emoji) {
    try {
      const guild = emoji?.guild;
      if (!guild) return;
      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible = await resolveResponsible(guild, emoji.id);
      const responsibleText = responsible ? `${responsible} \`${responsible.id}\`` : "sconosciuto";

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("Emoji Create")
        .setDescription(
          [
            `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
            `<:VC_right_arrow:1473441155055096081> **Target:** ${emoji.name || "emoji"} \`${emoji.id}\``,
            `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
            "",
            "**Settings**",
            `<:VC_right_arrow:1473441155055096081> **Name:** ${emoji.name || "sconosciuto"}`,
          ].join("\n"),
        );

      const imageUrl = emoji.imageURL?.({ extension: "png", size: 256 }) || emoji.url || null;
      if (imageUrl) embed.setThumbnail(imageUrl);

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (error) {
      global.logger?.error?.("[emojiCreate] log failed:", error);
    }
  },
};


