const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");

const INVITE_DELETE_ACTION = AuditLogEvent?.InviteDelete ?? 42;
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

function formatMaxAge(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  if (!safe) return "Never";
  const days = safe / 86400;
  if (Number.isInteger(days)) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = safe / 3600;
  if (Number.isInteger(hours)) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const mins = Math.floor(safe / 60);
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function normalizeCount(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function resolveResponsible(guild, code) {
  if (
    !guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)
  ) {
    return null;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild
      .fetchAuditLogs({ type: INVITE_DELETE_ACTION, limit: AUDIT_FETCH_LIMIT })
      .catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      const entry = logs.entries.find((item) => {
        const created = Number(item?.createdTimestamp || 0);
        const within = created > 0 && now - created <= AUDIT_LOOKBACK_MS;
        return within && String(item?.target?.code || "") === String(code || "");
      });
      if (entry?.executor) return entry.executor;
    }

    if (attempt < 2) await sleep(700);
  }

  return null;
}

module.exports = {
  name: "inviteDelete",
  async execute(invite) {
    try {
      const guild = invite?.guild;
      const code = String(invite?.code || "");
      const client = invite?.client || guild?.client || null;
      if (!guild || !code) return;

      const cache = client?.inviteCache?.get(guild.id);
      if (cache) {
        cache.delete(code);
      }

      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible =
        (await resolveResponsible(guild, code)) ||
        invite?.inviter ||
        null;
      const responsibleText = formatAuditActor(responsible);
      const channelText = invite.channel ? `${invite.channel}` : "#sconosciuto";
      const inviteUrl = invite?.url || (code ? `https://discord.gg/${code}` : null);

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("Invite Delete")
        .setDescription(
          [
            `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
            `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
            "",
            "**Previous Settings**",
            `<:VC_right_arrow:1473441155055096081> **Code:** ${code}`,
            inviteUrl ? `<:VC_right_arrow:1473441155055096081> **URL:** ${inviteUrl}` : null,
            `<:VC_right_arrow:1473441155055096081> **Channel:** ${channelText}`,
            `<:VC_right_arrow:1473441155055096081> **Uses:** ${normalizeCount(invite.uses, 0)}`,
            `<:VC_right_arrow:1473441155055096081> **Max Uses:** ${normalizeCount(invite.maxUses, 0)}`,
            `<:VC_right_arrow:1473441155055096081> **Max Age:** ${formatMaxAge(invite.maxAge)}`,
            `<:VC_right_arrow:1473441155055096081> **Temporary:** ${yesNo(Boolean(invite.temporary))}`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      global.logger?.error?.("[inviteDelete] failed:", error);
    }
  },
};


