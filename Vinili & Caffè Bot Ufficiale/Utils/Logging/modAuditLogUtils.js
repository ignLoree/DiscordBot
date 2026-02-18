const { PermissionsBitField } = require("discord.js");
const IDs = require("../Config/ids");

async function resolveModLogChannel(guild) {
  const channelId = IDs.channels.modLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

function canViewAuditLog(guild) {
  return Boolean(
    guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog),
  );
}

async function fetchRecentAuditEntry(guild, actionType, matcher, limit = 8, windowMs = 30000) {
  if (!canViewAuditLog(guild)) return null;
  const logs = await guild
    .fetchAuditLogs({ type: actionType, limit })
    .catch(() => null);
  if (!logs?.entries?.size) return null;

  const now = Date.now();
  return (
    logs.entries.find((item) => {
      const created = Number(item?.createdTimestamp || 0);
      if (!created || now - created > windowMs) return false;
      if (typeof matcher === "function") return matcher(item);
      return true;
    }) || null
  );
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
