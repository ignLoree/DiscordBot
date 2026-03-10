const { EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");
const { getClientChannelCached, getClientGuildCached, getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const RESOLUTION_CACHE_TTL_MS = 30_000;
const resolutionCache = new Map();

function getCacheKey(kind, primaryId, secondaryId) {
  return `${kind}:${String(primaryId || "none")}:${String(secondaryId || "none")}`;
}

function getCachedValue(key) {
  const cached = resolutionCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) resolutionCache.delete(key);
  return null;
}

function setCachedValue(key, value) {
  resolutionCache.set(key, {
    value: value || null,
    expiresAt: Date.now() + RESOLUTION_CACHE_TTL_MS,
  });
  return value || null;
}

async function getChannelSafe(client, channelId) {
  if (!channelId) return null;
  const cacheKey = getCacheKey("channel", client?.user?.id, channelId);
  const cached = getCachedValue(cacheKey);
  if (cached) return cached;
  const channel = client.channels.cache.get(channelId) || (await getClientChannelCached(client, channelId));
  return setCachedValue(cacheKey, channel);
}

async function getCentralChannel(client, channelId) {
  if (!client || !channelId) return getChannelSafe(client, channelId);
  const cacheKey = getCacheKey("central", client?.user?.id, channelId);
  const cached = getCachedValue(cacheKey);
  if (cached) return cached;
  const mainGuildId = IDs?.guilds?.main || null;
  if (!mainGuildId) return getChannelSafe(client, channelId);
  const guild = client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId));
  if (!guild) return getChannelSafe(client, channelId);
  const centralChannel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (centralChannel) return setCachedValue(cacheKey, centralChannel);
  return getChannelSafe(client, channelId);
}

async function logCommandUsage(client, { channelId, serverName, user, userId, content }) {
  if (!channelId) return;
  const channel = await getCentralChannel(client, channelId);
  if (!channel) return;
  const embed = new EmbedBuilder().setColor("#6f4e37").setAuthor({
    name: `<:member_role_icon:1330530086792728618> ${user} ha usato un comando.`,
    iconURL: client.user.displayAvatarURL({ size: 64 }),
  })
    .setTitle(`${client.user.username} - Log Comandi`)
    .addFields(
      { name: "<a:VC_Channel:1448670215444631706> Server:", value: `${serverName}` },
      { name: "<:VC_Bot:1470780684233871428> Comando:", value: `\`\`\`${content}\`\`\`` },
      { name: "<:member_role_icon:1330530086792728618> Utente:", value: `${user}|${userId}` },
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch((err) => {
    global.logger?.warn?.("[commandUsageLogger] send failed:", channelId, err?.message || err);
  });
}

module.exports = { logCommandUsage, getChannelSafe, getCentralChannel };