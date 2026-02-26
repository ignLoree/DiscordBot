const { PermissionsBitField } = require("discord.js");
const IDs = require("../Config/ids");

const COUNTER_PREFIX = "༄☕︲User: ";
const primaryTimers = new Map();
const secondaryTimers = new Map();

function buildCounterName(count) {
  const safeCount = Math.max(0, Number(count || 0));
  return `${COUNTER_PREFIX}${safeCount}`;
}

async function resolveCounterChannel(guild) {
  if (!guild) return null;
  const channelId = IDs.channels.countUtenti;
  if (!channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function resolveReliableMemberCount(guild) {
  if (!guild) return 0;
  let count = Number(guild.memberCount || 0);
  const freshGuild = await guild.fetch().catch(() => null);
  if (freshGuild && Number.isFinite(Number(freshGuild.memberCount))) {
    count = Number(freshGuild.memberCount);
  }
  if (!Number.isFinite(count) || count < 0) {
    count = Math.max(0, Number(guild.members?.cache?.size || 0));
  }
  return count;
}

async function updateMemberCounterNow(guild) {
  if (!guild) return false;
  const channel = await resolveCounterChannel(guild);
  if (!channel) return false;

  const me =
    guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels))
    return false;

  const nextName = buildCounterName(await resolveReliableMemberCount(guild));
  if (String(channel.name || "") === nextName) return true;

  await channel.setName(nextName).catch(() => {});
  return true;
}

function clearTimers(guildId) {
  const first = primaryTimers.get(guildId);
  if (first) clearTimeout(first);
  primaryTimers.delete(guildId);

  const second = secondaryTimers.get(guildId);
  if (second) clearTimeout(second);
  secondaryTimers.delete(guildId);
}

function scheduleMemberCounterRefresh(guild, options = {}) {
  if (!guild?.id) return false;
  const guildId = guild.id;
  const delayMs = Math.max(0, Number(options.delayMs ?? 250));
  const secondPassMs = Math.max(0, Number(options.secondPassMs ?? 1800));

  clearTimers(guildId);

  const primary = setTimeout(async () => {
    await updateMemberCounterNow(guild).catch(() => {});
    if (secondPassMs > 0) {
      const secondary = setTimeout(async () => {
        await updateMemberCounterNow(guild).catch(() => {});
        secondaryTimers.delete(guildId);
      }, secondPassMs);
      secondaryTimers.set(guildId, secondary);
    }
    primaryTimers.delete(guildId);
  }, delayMs);
  primaryTimers.set(guildId, primary);
  return true;
}

module.exports = {
  buildCounterName,
  updateMemberCounterNow,
  scheduleMemberCounterRefresh,
};