const { PermissionsBitField } = require("discord.js");
const IDs = require("../Config/ids");

async function resolveModLogChannel(guild) {
  const channelId = IDs.channels?.modLogs;
  if (!guild || !channelId) return null;
  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return null;
  return channel;
}

function canViewAuditLog(guild) {
  return Boolean(
    guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog),
  );
}

async function fetchRecentAuditEntry(
  guild,
  actionType,
  matcher,
  limit = 20,
  windowMs = 120000,
) {
  if (!canViewAuditLog(guild)) return null;
  const logs = await guild
    .fetchAuditLogs({ type: actionType, limit })
    .catch(() => null);
  if (!logs?.entries?.size) return null;

  const now = Date.now();
  const candidates = [];
  logs.entries.forEach((item) => {
    const created = Number(item?.createdTimestamp || 0);
    if (!created || now - created > windowMs) return;

    let score = 1;
    if (typeof matcher === "function") {
      const result = matcher(item);
      if (!result) return;
      if (typeof result === "number" && Number.isFinite(result)) score += result;
      else score += 3;
    }

    score += Math.max(0, windowMs - (now - created)) / windowMs;
    candidates.push({ item, score, created });
  });

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.created - a.created;
  });
  return candidates[0]?.item || null;
}

function formatResponsible(executor) {
  if (!executor) return "sconosciuto";
  const flags = [];
  if (executor?.bot) flags.push("BOT");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  return `${executor}${suffix} \`${executor.id}\``;
}

function nowDiscordTs() {
  return `<t:${Math.floor(Date.now() / 1000)}:F>`;
}

module.exports = {
  resolveModLogChannel,
  fetchRecentAuditEntry,
  formatResponsible,
  nowDiscordTs,
};
