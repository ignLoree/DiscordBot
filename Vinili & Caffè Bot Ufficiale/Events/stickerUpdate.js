const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");

const STICKER_UPDATE_ACTION = AuditLogEvent?.StickerUpdate ? 91;
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveAudit(guild, stickerId) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) {
    return { executor: null, changes: [] };
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: STICKER_UPDATE_ACTION, limit: AUDIT_FETCH_LIMIT }).catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      const entry = logs.entries.find((item) => {
        const created = Number(item?.createdTimestamp || 0);
        const within = created > 0 && now - created <= AUDIT_LOOKBACK_MS;
        return within && String(item?.target?.id || "") === String(stickerId || "");
      });
      if (entry) {
        return {
          executor: entry.executor || null,
          changes: Array.isArray(entry.changes) ? entry.changes : [],
        };
      }
    }
    if (attempt < 2) await sleep(700);
  }
  return { executor: null, changes: [] };
}

function getChange(changes, key) {
  return changes.find((c) => String(c?.key || "") === key) || null;
}

module.exports = {
  name: "stickerUpdate",
  async execute(oldSticker, newSticker) {
    try {
      const guild = newSticker?.guild || oldSticker?.guild;
      const stickerId = String(newSticker?.id || oldSticker?.id || "");
      if (!guild || !stickerId) return;
      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const { executor, changes } = await resolveAudit(guild, stickerId);
      const responsibleText = formatAuditActor(executor);

      const nameChange = getChange(changes, "name");
      const tagsChange = getChange(changes, "tags");
      const fallbackNameChanged =
        String(oldSticker?.name || "") !== String(newSticker?.name || "");
      const fallbackTagsChanged =
        String(oldSticker?.tags || "") !== String(newSticker?.tags || "");
      if (!nameChange && !tagsChange && !fallbackNameChanged && !fallbackTagsChanged) return;

      const lines = [
        `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
        `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Changes**",
      ];

      if (nameChange || fallbackNameChanged) {
        lines.push(`<:VC_right_arrow:1473441155055096081> **Name**`);
        lines.push(`  ${String(nameChange?.old ? oldSticker?.name ? "sconosciuto")} <:VC_right_arrow:1473441155055096081> ${String(nameChange?.new ? newSticker?.name ? "sconosciuto")}`);
      }
      if (tagsChange || fallbackTagsChanged) {
        lines.push(`<:VC_right_arrow:1473441155055096081> **Tags**`);
        lines.push(`  ${String(tagsChange?.old ? oldSticker?.tags ? "-")} <:VC_right_arrow:1473441155055096081> ${String(tagsChange?.new ? newSticker?.tags ? "-")}`);
      }

      const embed = new EmbedBuilder()
        .setColor("#F59E0B")
        .setTitle("Sticker Update")
        .setDescription(lines.join("\n"));

      if (newSticker?.url) embed.setThumbnail(newSticker.url);
      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      global.logger?.error?.("[stickerUpdate] log failed:", error);
    }
  },
};


