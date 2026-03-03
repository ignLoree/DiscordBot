const { EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");

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
  const channel=(client.channels.cache.get(channelId)||(await client.channels.fetch(channelId).catch(() => null)));
  return setCachedValue(cacheKey, channel);
}

/** Risolve il canale dal server principale per centralizzare i log in tutti i server. */
async function getCentralChannel(client, channelId) {
  if (!client || !channelId) return getChannelSafe(client, channelId);
  const cacheKey = getCacheKey("central", client?.user?.id, channelId);
  const cached = getCachedValue(cacheKey);
  if (cached) return cached;
  const mainGuildId = IDs?.guilds?.main || null;
  if (!mainGuildId) return getChannelSafe(client, channelId);
  const guild=client.guilds.cache.get(mainGuildId)||(await client.guilds.fetch(mainGuildId).catch(() => null));
  if (!guild) return getChannelSafe(client, channelId);
  const centralChannel=(guild.channels.cache.get(channelId)||(await guild.channels.fetch(channelId).catch(() => null)));
  if (centralChannel) return setCachedValue(cacheKey, centralChannel);
  return getChannelSafe(client, channelId);
}

async function logCommandUsage(
  client,
  { channelId, serverName, user, userId, content },
) {
  if (!channelId) return;
  const channel = await getCentralChannel(client, channelId);
  if (!channel) return;
  const embed=new EmbedBuilder().setColor("#6f4e37").setAuthor({name:`${user}ha usato un comando.`,
      iconURL: client.user.displayAvatarURL({ size: 64 }),
    })
    .setTitle(`${client.user.username}Log Comandi`)
    .addFields(
      { name: "Nome Server", value: `${serverName}` },
      { name: "Comando", value: `\`\`\`${content}\`\`\``},{name:"Utente",value:`${user}|${userId}` },
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch((err) => {
    global.logger?.warn?.("[commandUsageLogger] send failed:", channelId, err?.message || err);
  });
}

module.exports = { logCommandUsage, getChannelSafe, getCentralChannel };