const DEFAULT_TTL_MS = 15_000;
const entityCache = new Map();

function buildCacheKey(kind, parentId, entityId) {
  return `${kind}:${String(parentId || "none")}:${String(entityId || "none")}`;
}

function getCachedValue(cacheKey) {
  const cached = entityCache.get(cacheKey);
  const now = Date.now();
  if (cached?.value && now < Number(cached.expiresAt || 0)) {
    return cached.value;
  }
  if (cached?.promise) {
    return cached.promise;
  }
  if (cached) entityCache.delete(cacheKey);
  return null;
}

function setCachedValue(cacheKey, value, ttlMs = DEFAULT_TTL_MS, promise = null) {
  entityCache.set(cacheKey, {
    value: value || null,
    expiresAt: Date.now() + ttlMs,
    promise,
  });
  return value || null;
}

async function getOrFetchEntity({
  kind,
  parentId,
  entityId,
  resolveFromCache,
  fetchEntity,
  ttlMs = DEFAULT_TTL_MS,
}) {
  if (!entityId) return null;
  const warmValue = resolveFromCache?.();
  if (warmValue) return warmValue;

  const cacheKey = buildCacheKey(kind, parentId, entityId);
  const cached = getCachedValue(cacheKey);
  if (cached) return cached;

  const promise = Promise.resolve(fetchEntity?.()).catch(() => null);
  setCachedValue(cacheKey, null, ttlMs, promise);
  const resolved = await promise;
  return setCachedValue(cacheKey, resolved, ttlMs);
}

async function getGuildChannelCached(guild, channelId, options = {}) {
  if (!guild || !channelId) return null;
  return getOrFetchEntity({
    kind: "channel",
    parentId: guild.id,
    entityId: channelId,
    ttlMs: options.ttlMs,
    resolveFromCache: () => guild.channels?.cache?.get(String(channelId)) || null,
    fetchEntity: () => guild.channels.fetch(String(channelId)),
  });
}

async function getGuildMemberCached(guild, userId, options = {}) {
  if (!guild || !userId) return null;
  const preferFresh = Boolean(options.preferFresh);
  return getOrFetchEntity({
    kind: "member",
    parentId: guild.id,
    entityId: userId,
    ttlMs: options.ttlMs,
    resolveFromCache: () =>
      preferFresh ? null : guild.members?.cache?.get(String(userId)) || null,
    fetchEntity: () => guild.members.fetch(String(userId)),
  });
}

async function getGuildRoleCached(guild, roleId, options = {}) {
  if (!guild || !roleId) return null;
  return getOrFetchEntity({
    kind: "role",
    parentId: guild.id,
    entityId: roleId,
    ttlMs: options.ttlMs,
    resolveFromCache: () => guild.roles?.cache?.get(String(roleId)) || null,
    fetchEntity: () => guild.roles.fetch(String(roleId)),
  });
}

async function getClientGuildCached(client, guildId, options = {}) {
  if (!client || !guildId) return null;
  return getOrFetchEntity({
    kind: "guild",
    parentId: client.user?.id || "client",
    entityId: guildId,
    ttlMs: options.ttlMs,
    resolveFromCache: () => client.guilds?.cache?.get(String(guildId)) || null,
    fetchEntity: () => client.guilds.fetch(String(guildId)),
  });
}

async function getUserCached(client, userId, options = {}) {
  if (!client || !userId) return null;
  return getOrFetchEntity({
    kind: "user",
    parentId: client.user?.id || "client",
    entityId: userId,
    ttlMs: options.ttlMs,
    resolveFromCache: () => client.users?.cache?.get(String(userId)) || null,
    fetchEntity: () => client.users.fetch(String(userId)),
  });
}

async function getClientChannelCached(client, channelId, options = {}) {
  if (!client || !channelId) return null;
  return getOrFetchEntity({
    kind: "client-channel",
    parentId: client.user?.id || "client",
    entityId: channelId,
    ttlMs: options.ttlMs,
    resolveFromCache: () => client.channels?.cache?.get(String(channelId)) || null,
    fetchEntity: () => client.channels.fetch(String(channelId)),
  });
}

module.exports = { buildCacheKey, getCachedValue, setCachedValue, getClientChannelCached, getClientGuildCached, getGuildChannelCached, getGuildMemberCached, getGuildRoleCached, getUserCached };