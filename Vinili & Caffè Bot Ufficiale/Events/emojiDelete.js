const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");

const EMOJI_DELETE_ACTION = AuditLogEvent?.EmojiDelete ?? 62;
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;
const AUDIT_RETRY_ATTEMPTS = 4;
const AUDIT_RETRY_DELAY_MS = 900;

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

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
}

async function resolveResponsible(guild, emojiId) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) {
    return null;
  }
  const logs = await guild.fetchAuditLogs({ type: EMOJI_DELETE_ACTION, limit: AUDIT_FETCH_LIMIT }).catch(() => null);
  if (!logs?.entries?.size) return null;
  const now = Date.now();
  const entry = logs.entries.find((item) => {
    const created = Number(item?.createdTimestamp || 0);
    const within = created > 0 && now - created <= AUDIT_LOOKBACK_MS;
    return within && String(item?.target?.id || "") === String(emojiId || "");
  });
  return entry?.executor || null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveResponsibleWithRetry(guild, emojiId) {
  for (let attempt = 0; attempt < AUDIT_RETRY_ATTEMPTS; attempt += 1) {
    const responsible = await resolveResponsible(guild, emojiId);
    if (responsible) return responsible;
    if (attempt < AUDIT_RETRY_ATTEMPTS - 1) {
      await wait(AUDIT_RETRY_DELAY_MS);
    }
  }
  return null;
}

module.exports = {
  name: "emojiDelete",
  async execute(emoji) {
    try {
      const guild = emoji?.guild;
      const emojiId = String(emoji?.id || "").trim();
      if (!guild || !emojiId) return;
      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible = await resolveResponsibleWithRetry(guild, emojiId);
      const responsibleText = formatAuditActor(responsible);

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("Emoji Delete")
        .setDescription(
          [
            `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
            `<:VC_right_arrow:1473441155055096081> **Target:** ${emoji.name || "emoji"} \`${emojiId}\``,
            `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
            "",
            "**Previous Settings**",
            `<:VC_right_arrow:1473441155055096081> **Name:** ${emoji.name || "sconosciuto"}`,
            `<:VC_right_arrow:1473441155055096081> **Animated:** ${emoji?.animated ? "Yes" : "No"}`,
          ].join("\n"),
        );

      const imageUrl = emoji.imageURL?.({ extension: "png", size: 256 }) || emoji.url || null;
      if (imageUrl) embed.setThumbnail(imageUrl);

      await logChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (error) {
      global.logger?.error?.("[emojiDelete] log failed:", error);
    }
  },
};
