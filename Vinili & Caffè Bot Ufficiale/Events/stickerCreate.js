const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");

const STICKER_CREATE_ACTION = AuditLogEvent?.StickerCreate ?? 90;

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function formatAuditActor(actor) {
  if (!actor) return "sconosciuto";
  const flags = [];
  if (actor?.bot) flags.push("BOT");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  return `${actor}${suffix} \`${actor.id}\``;
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function stickerFormatLabel(value) {
  const n = Number(value || 0);
  if (n === 1) return "PNG (.png)";
  if (n === 2) return "APNG (.png)";
  if (n === 3) return "Lottie (.json)";
  if (n === 4) return "GIF (.gif)";
  return `Unknown (${n || 0})`;
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
}

async function resolveResponsible(guild, stickerId) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) {
    return guild?.client?.user || null;
  }
  const logs = await guild.fetchAuditLogs({ type: STICKER_CREATE_ACTION, limit: 8 }).catch(() => null);
  if (!logs?.entries?.size) return guild?.client?.user || null;
  const now = Date.now();
  const entry = logs.entries.find((item) => {
    const created = Number(item?.createdTimestamp || 0);
    const within = created > 0 && now - created <= 30 * 1000;
    return within && String(item?.target?.id || "") === String(stickerId || "");
  });
  return entry?.executor || guild?.client?.user || null;
}

module.exports = {
  name: "stickerCreate",
  async execute(sticker) {
    try {
      const guild = sticker?.guild;
      if (!guild) return;
      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible = await resolveResponsible(guild, sticker.id);
      const responsibleText = formatAuditActor(responsible);

      const embed = new EmbedBuilder()
        .setColor("#57F287")
        .setTitle("Sticker Create")
        .setDescription(
          [
            `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
            `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
            "",
            "**Settings**",
            `<:VC_right_arrow:1473441155055096081> **Id:** \`${sticker.id || "sconosciuto"}\``,
            `<:VC_right_arrow:1473441155055096081> **Name:** ${sticker.name || "sconosciuto"}`,
            `<:VC_right_arrow:1473441155055096081> **Tags:** ${sticker.tags || "-"}`,
            `<:VC_right_arrow:1473441155055096081> **Type:** Local Server Sticker`,
            `<:VC_right_arrow:1473441155055096081> **Format Type:** ${stickerFormatLabel(sticker.formatType)}`,
            `<:VC_right_arrow:1473441155055096081> **Available:** ${yesNo(Boolean(sticker.available))}`,
            `<:VC_right_arrow:1473441155055096081> **Guild Id:** \`${guild.id}\``,
          ].join("\n"),
        );

      if (sticker.url) embed.setThumbnail(sticker.url);
      await logChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (error) {
      global.logger?.error?.("[stickerCreate] log failed:", error);
    }
  },
};


