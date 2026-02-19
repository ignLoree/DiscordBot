const fs = require("fs/promises");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);
const FETCH_DELAY_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizePermissionOverwrites(channel) {
  try {
    const overwrites = channel?.permissionOverwrites?.cache;
    if (!overwrites) return [];

    return [...overwrites.values()].map((ow) => ({
      id: String(ow.id),
      type: Number(ow.type),
      allow: String(ow.allow?.bitfield ?? 0n),
      deny: String(ow.deny?.bitfield ?? 0n),
    }));
  } catch {
    return [];
  }
}

function serializeMessage(message) {
  return {
    id: String(message.id),
    channelId: String(message.channelId),
    guildId: String(message.guildId || ""),
    author: message.author
      ? {
          id: String(message.author.id),
          tag: String(message.author.tag || ""),
          username: String(message.author.username || ""),
          globalName: message.author.globalName || null,
          bot: Boolean(message.author.bot),
          system: Boolean(message.author.system),
        }
      : null,
    member: message.member
      ? {
          id: String(message.member.id),
          nickname: message.member.nickname || null,
          roles: message.member.roles?.cache
            ? [...message.member.roles.cache.keys()].map(String)
            : [],
        }
      : null,
    content: String(message.content || ""),
    cleanContent: String(message.cleanContent || ""),
    type: Number(message.type ?? 0),
    tts: Boolean(message.tts),
    pinned: Boolean(message.pinned),
    flags: String(message.flags?.bitfield ?? 0),
    webhookId: message.webhookId ? String(message.webhookId) : null,
    applicationId: message.applicationId ? String(message.applicationId) : null,
    createdAt: toIso(message.createdTimestamp || message.createdAt),
    editedAt: toIso(message.editedTimestamp || message.editedAt),
    url: message.url || null,
    reference: message.reference
      ? {
          messageId: message.reference.messageId
            ? String(message.reference.messageId)
            : null,
          channelId: message.reference.channelId
            ? String(message.reference.channelId)
            : null,
          guildId: message.reference.guildId
            ? String(message.reference.guildId)
            : null,
        }
      : null,
    attachments: [...(message.attachments?.values?.() || [])].map((a) => ({
      id: String(a.id),
      name: a.name || null,
      description: a.description || null,
      contentType: a.contentType || null,
      size: Number(a.size || 0),
      url: a.url || null,
      proxyURL: a.proxyURL || null,
      width: a.width ?? null,
      height: a.height ?? null,
      ephemeral: Boolean(a.ephemeral),
    })),
    embeds: Array.isArray(message.embeds)
      ? message.embeds.map((e) => (typeof e?.toJSON === "function" ? e.toJSON() : e))
      : [],
    stickers: [...(message.stickers?.values?.() || [])].map((s) => ({
      id: String(s.id),
      name: String(s.name || ""),
      format: Number(s.format ?? 0),
      url: s.url || null,
    })),
    reactions: [...(message.reactions?.cache?.values?.() || [])].map((r) => ({
      emoji: {
        id: r.emoji?.id ? String(r.emoji.id) : null,
        name: r.emoji?.name || null,
        animated: Boolean(r.emoji?.animated),
      },
      count: Number(r.count || 0),
      me: Boolean(r.me),
    })),
    mentions: {
      users: [...(message.mentions?.users?.keys?.() || [])].map(String),
      roles: [...(message.mentions?.roles?.keys?.() || [])].map(String),
      channels: [...(message.mentions?.channels?.keys?.() || [])].map(String),
      everyone: Boolean(message.mentions?.everyone),
    },
    components: Array.isArray(message.components)
      ? message.components.map((c) =>
          typeof c?.toJSON === "function" ? c.toJSON() : c,
        )
      : [],
  };
}

async function fetchAllMessages(channel) {
  const out = [];
  let before;

  while (true) {
    const batch = await channel.messages
      .fetch({ limit: 100, ...(before ? { before } : {}) })
      .catch(() => null);

    if (!batch || batch.size === 0) break;

    const sorted = [...batch.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    );
    for (const message of sorted) {
      out.push(serializeMessage(message));
    }

    before = batch.last()?.id;
    if (!before || batch.size < 100) break;
    await sleep(FETCH_DELAY_MS);
  }

  return out;
}

async function collectArchivedThreads(parentChannel) {
  if (!parentChannel?.threads) return [];

  const threadList = [];

  const archivedPublic = await parentChannel.threads
    .fetchArchived({ type: "public", fetchAll: true })
    .catch(() => null);
  if (archivedPublic?.threads) {
    threadList.push(...archivedPublic.threads.values());
  }

  const archivedPrivate = await parentChannel.threads
    .fetchArchived({ type: "private", fetchAll: true })
    .catch(() => null);
  if (archivedPrivate?.threads) {
    threadList.push(...archivedPrivate.threads.values());
  }

  return threadList;
}

function serializeChannel(channel) {
  return {
    id: String(channel.id),
    name: String(channel.name || ""),
    type: Number(channel.type ?? -1),
    parentId: channel.parentId ? String(channel.parentId) : null,
    position: Number(channel.position ?? 0),
    topic: channel.topic || null,
    nsfw: Boolean(channel.nsfw),
    rateLimitPerUser: Number(channel.rateLimitPerUser ?? 0),
    bitrate: Number(channel.bitrate ?? 0),
    userLimit: Number(channel.userLimit ?? 0),
    rtcRegion: channel.rtcRegion || null,
    videoQualityMode: channel.videoQualityMode ?? null,
    defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration ?? null,
    defaultThreadRateLimitPerUser: channel.defaultThreadRateLimitPerUser ?? null,
    defaultForumLayout: channel.defaultForumLayout ?? null,
    defaultSortOrder: channel.defaultSortOrder ?? null,
    availableTags: Array.isArray(channel.availableTags)
      ? channel.availableTags.map((t) =>
          typeof t?.toJSON === "function" ? t.toJSON() : t,
        )
      : [],
    defaultReactionEmoji: channel.defaultReactionEmoji || null,
    permissionsLocked:
      typeof channel.permissionsLocked === "boolean"
        ? channel.permissionsLocked
        : null,
    permissionOverwrites: normalizePermissionOverwrites(channel),
  };
}

function serializeThread(thread) {
  return {
    id: String(thread.id),
    parentId: thread.parentId ? String(thread.parentId) : null,
    name: String(thread.name || ""),
    type: Number(thread.type ?? -1),
    ownerId: thread.ownerId ? String(thread.ownerId) : null,
    archived: Boolean(thread.archived),
    locked: Boolean(thread.locked),
    invitable: Boolean(thread.invitable),
    autoArchiveDuration: Number(thread.autoArchiveDuration ?? 0),
    rateLimitPerUser: Number(thread.rateLimitPerUser ?? 0),
    createdAt: toIso(thread.createdAt),
    archiveTimestamp: toIso(thread.archiveTimestamp),
    lastMessageId: thread.lastMessageId ? String(thread.lastMessageId) : null,
    memberCount: Number(thread.memberCount ?? 0),
    messageCount: Number(thread.messageCount ?? 0),
    permissionOverwrites: normalizePermissionOverwrites(thread),
  };
}

function generateBackupId() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i += 1) {
    out += letters[Math.floor(Math.random() * letters.length)];
  }
  return out;
}

function getBackupFolder(guildId) {
  return path.join(__dirname, "..", "..", "Data", "Backups", String(guildId));
}

function getBackupFilePath(guildId, backupId) {
  const normalizedId = String(backupId || "")
    .trim()
    .toUpperCase();
  return path.join(getBackupFolder(guildId), `${normalizedId}.json.gz`);
}

async function createGuildBackup(guild, options = {}) {
  await guild.fetch().catch(() => null);

  const backupId = generateBackupId();
  const createdAt = new Date();

  const outputDir = getBackupFolder(guild.id);
  await fs.mkdir(outputDir, { recursive: true });

  const [membersCollection, bansCollection, invitesCollection, webhooksCollection] =
    await Promise.all([
      guild.members.fetch().catch(() => null),
      guild.bans.fetch().catch(() => null),
      guild.invites.fetch().catch(() => null),
      guild.fetchWebhooks().catch(() => null),
    ]);

  const activeThreads = await guild.channels.fetchActiveThreads().catch(() => null);

  const channels = [...guild.channels.cache.values()].filter((channel) => !channel.isThread());

  const allThreadsById = new Map();
  if (activeThreads?.threads) {
    for (const thread of activeThreads.threads.values()) {
      allThreadsById.set(String(thread.id), thread);
    }
  }

  for (const channel of channels) {
    const archived = await collectArchivedThreads(channel).catch(() => []);
    for (const thread of archived) {
      allThreadsById.set(String(thread.id), thread);
    }
  }

  const serializedChannels = channels.map(serializeChannel);
  const serializedThreads = [...allThreadsById.values()].map(serializeThread);

  const textLikeChannels = channels.filter(
    (channel) =>
      channel?.isTextBased?.() &&
      typeof channel?.messages?.fetch === "function" &&
      !channel?.isDMBased?.(),
  );

  const messagesByChannel = {};
  for (const channel of textLikeChannels) {
    messagesByChannel[String(channel.id)] = await fetchAllMessages(channel).catch(
      () => [],
    );
    await sleep(FETCH_DELAY_MS);
  }

  const messagesByThread = {};
  for (const thread of allThreadsById.values()) {
    if (!thread?.isTextBased?.() || typeof thread?.messages?.fetch !== "function") {
      continue;
    }
    messagesByThread[String(thread.id)] = await fetchAllMessages(thread).catch(
      () => [],
    );
    await sleep(FETCH_DELAY_MS);
  }

  const roles = [...guild.roles.cache.values()]
    .sort((a, b) => b.position - a.position)
    .map((role) => ({
      id: String(role.id),
      name: String(role.name || ""),
      color: Number(role.color || 0),
      hoist: Boolean(role.hoist),
      icon: role.icon || null,
      unicodeEmoji: role.unicodeEmoji || null,
      position: Number(role.position || 0),
      permissions: String(role.permissions?.bitfield ?? 0n),
      managed: Boolean(role.managed),
      mentionable: Boolean(role.mentionable),
      tags: role.tags ? { ...role.tags } : null,
      createdAt: toIso(role.createdAt),
    }));

  const members = membersCollection
    ? [...membersCollection.values()].map((member) => ({
        id: String(member.id),
        user: {
          id: String(member.user?.id || member.id),
          username: String(member.user?.username || ""),
          discriminator: String(member.user?.discriminator || "0"),
          tag: String(member.user?.tag || ""),
          globalName: member.user?.globalName || null,
          bot: Boolean(member.user?.bot),
          system: Boolean(member.user?.system),
          avatar: member.user?.avatar || null,
          banner: member.user?.banner || null,
          accentColor: member.user?.accentColor ?? null,
          createdAt: toIso(member.user?.createdAt),
        },
        nickname: member.nickname || null,
        displayName: member.displayName || null,
        joinedAt: toIso(member.joinedAt),
        premiumSince: toIso(member.premiumSince),
        communicationDisabledUntil: toIso(member.communicationDisabledUntil),
        pending: Boolean(member.pending),
        roles: member.roles?.cache
          ? [...member.roles.cache.keys()].map(String)
          : [],
        avatar: member.avatar || null,
        avatarURL: member.displayAvatarURL({ size: 1024 }),
      }))
    : [];

  const emojis = [...guild.emojis.cache.values()].map((emoji) => ({
    id: String(emoji.id),
    name: String(emoji.name || ""),
    animated: Boolean(emoji.animated),
    managed: Boolean(emoji.managed),
    available: Boolean(emoji.available),
    createdAt: toIso(emoji.createdAt),
    url: emoji.url || null,
    roles: emoji.roles?.cache ? [...emoji.roles.cache.keys()].map(String) : [],
    userId: emoji.author?.id ? String(emoji.author.id) : null,
  }));

  const stickers = [...guild.stickers.cache.values()].map((sticker) => ({
    id: String(sticker.id),
    name: String(sticker.name || ""),
    description: sticker.description || null,
    format: Number(sticker.format ?? 0),
    type: Number(sticker.type ?? 0),
    tags: sticker.tags || null,
    url: sticker.url || null,
    available: Boolean(sticker.available),
    guildId: sticker.guildId ? String(sticker.guildId) : null,
    userId: sticker.user?.id ? String(sticker.user.id) : null,
  }));

  const scheduledEvents = [...guild.scheduledEvents.cache.values()].map((ev) => ({
    id: String(ev.id),
    name: String(ev.name || ""),
    description: ev.description || null,
    entityType: Number(ev.entityType ?? 0),
    status: Number(ev.status ?? 0),
    privacyLevel: Number(ev.privacyLevel ?? 0),
    entityMetadata: ev.entityMetadata || null,
    channelId: ev.channelId ? String(ev.channelId) : null,
    creatorId: ev.creatorId ? String(ev.creatorId) : null,
    userCount: Number(ev.userCount ?? 0),
    scheduledStartAt: toIso(ev.scheduledStartTimestamp || ev.scheduledStartAt),
    scheduledEndAt: toIso(ev.scheduledEndTimestamp || ev.scheduledEndAt),
    createdAt: toIso(ev.createdAt),
    image: ev.image || null,
  }));

  const integrations = await guild.fetchIntegrations().catch(() => []);
  const autoModerationRules = await guild.autoModerationRules.fetch().catch(() => null);

  let auditLogs = [];
  let before;
  while (true) {
    const logs = await guild.fetchAuditLogs({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!logs || logs.entries.size === 0) break;

    const entries = [...logs.entries.values()];
    for (const entry of entries) {
      auditLogs.push({
        id: String(entry.id),
        action: Number(entry.action ?? 0),
        actionType: String(entry.actionType || ""),
        targetId: entry.targetId ? String(entry.targetId) : null,
        executorId: entry.executorId ? String(entry.executorId) : null,
        reason: entry.reason || null,
        createdAt: toIso(entry.createdAt),
        extra: entry.extra || null,
        changes: Array.isArray(entry.changes)
          ? entry.changes.map((change) => ({
              key: change?.key || null,
              old: change?.old ?? null,
              new: change?.new ?? null,
            }))
          : [],
      });
    }

    before = entries[entries.length - 1]?.id;
    if (!before || entries.length < 100) break;
    await sleep(FETCH_DELAY_MS);
  }

  const backupSource = String(options?.source || "manual")
    .trim()
    .toLowerCase();

  const backupPayload = {
    backupId,
    createdAt: createdAt.toISOString(),
    source: backupSource === "automatic" ? "automatic" : "manual",
    guild: {
      id: String(guild.id),
      name: String(guild.name || ""),
      icon: guild.icon || null,
      iconURL: guild.iconURL({ size: 2048 }),
      banner: guild.banner || null,
      bannerURL: guild.bannerURL({ size: 2048 }),
      splash: guild.splash || null,
      discoverySplash: guild.discoverySplash || null,
      description: guild.description || null,
      vanityURLCode: guild.vanityURLCode || null,
      preferredLocale: guild.preferredLocale || null,
      features: Array.isArray(guild.features) ? guild.features : [],
      verificationLevel: Number(guild.verificationLevel ?? 0),
      explicitContentFilter: Number(guild.explicitContentFilter ?? 0),
      defaultMessageNotifications: Number(guild.defaultMessageNotifications ?? 0),
      mfaLevel: Number(guild.mfaLevel ?? 0),
      nsfwLevel: Number(guild.nsfwLevel ?? 0),
      premiumTier: Number(guild.premiumTier ?? 0),
      premiumProgressBarEnabled: Boolean(guild.premiumProgressBarEnabled),
      afkTimeout: Number(guild.afkTimeout ?? 0),
      afkChannelId: guild.afkChannelId ? String(guild.afkChannelId) : null,
      systemChannelId: guild.systemChannelId ? String(guild.systemChannelId) : null,
      rulesChannelId: guild.rulesChannelId ? String(guild.rulesChannelId) : null,
      publicUpdatesChannelId: guild.publicUpdatesChannelId
        ? String(guild.publicUpdatesChannelId)
        : null,
      safetyAlertsChannelId: guild.safetyAlertsChannelId
        ? String(guild.safetyAlertsChannelId)
        : null,
      widgetEnabled: Boolean(guild.widgetEnabled),
      widgetChannelId: guild.widgetChannelId ? String(guild.widgetChannelId) : null,
      ownerId: guild.ownerId ? String(guild.ownerId) : null,
      maxMembers: Number(guild.maximumMembers ?? 0),
      maxPresences: Number(guild.maximumPresences ?? 0),
      maxVideoChannelUsers: Number(guild.maxVideoChannelUsers ?? 0),
      memberCount: Number(guild.memberCount ?? 0),
      rolesCount: Number(guild.roles.cache.size || 0),
      channelsCount: Number(channels.length),
      threadsCount: Number(serializedThreads.length),
      emojisCount: Number(guild.emojis.cache.size || 0),
      stickersCount: Number(guild.stickers.cache.size || 0),
      createdAt: toIso(guild.createdAt),
    },
    roles,
    channels: serializedChannels,
    threads: serializedThreads,
    members,
    bans: bansCollection
      ? [...bansCollection.values()].map((ban) => ({
          user: {
            id: String(ban.user.id),
            username: String(ban.user.username || ""),
            discriminator: String(ban.user.discriminator || "0"),
            tag: String(ban.user.tag || ""),
            bot: Boolean(ban.user.bot),
            createdAt: toIso(ban.user.createdAt),
          },
          reason: ban.reason || null,
        }))
      : [],
    invites: invitesCollection
      ? [...invitesCollection.values()].map((invite) => ({
          code: String(invite.code),
          url: invite.url || null,
          channelId: invite.channelId ? String(invite.channelId) : null,
          inviterId: invite.inviterId ? String(invite.inviterId) : null,
          targetType: invite.targetType ?? null,
          targetUserId: invite.targetUserId ? String(invite.targetUserId) : null,
          expiresAt: toIso(invite.expiresAt),
          createdAt: toIso(invite.createdAt),
          temporary: Boolean(invite.temporary),
          maxAge: Number(invite.maxAge ?? 0),
          maxUses: Number(invite.maxUses ?? 0),
          uses: Number(invite.uses ?? 0),
        }))
      : [],
    webhooks: webhooksCollection
      ? [...webhooksCollection.values()].map((hook) => ({
          id: String(hook.id),
          type: Number(hook.type ?? 0),
          guildId: hook.guildId ? String(hook.guildId) : null,
          channelId: hook.channelId ? String(hook.channelId) : null,
          name: hook.name || null,
          avatar: hook.avatar || null,
          applicationId: hook.applicationId ? String(hook.applicationId) : null,
          sourceGuildId: hook.sourceGuild?.id ? String(hook.sourceGuild.id) : null,
          sourceChannelId: hook.sourceChannel?.id ? String(hook.sourceChannel.id) : null,
        }))
      : [],
    emojis,
    stickers,
    scheduledEvents,
    integrations: Array.isArray(integrations)
      ? integrations.map((integration) => ({
          id: String(integration.id),
          name: String(integration.name || ""),
          type: String(integration.type || ""),
          enabled: Boolean(integration.enabled),
          syncing: Boolean(integration.syncing),
          roleId: integration.roleId ? String(integration.roleId) : null,
          expireBehavior: integration.expireBehavior ?? null,
          expireGracePeriod: integration.expireGracePeriod ?? null,
          userId: integration.user?.id ? String(integration.user.id) : null,
          account: integration.account
            ? {
                id: String(integration.account.id || ""),
                name: String(integration.account.name || ""),
              }
            : null,
          syncedAt: toIso(integration.syncedAt),
          subscriberCount: Number(integration.subscriberCount ?? 0),
          revoked: Boolean(integration.revoked),
          application: integration.application
            ? {
                id: String(integration.application.id || ""),
                name: String(integration.application.name || ""),
                icon: integration.application.icon || null,
              }
            : null,
        }))
      : [],
    autoModerationRules: autoModerationRules
      ? [...autoModerationRules.values()].map((rule) => ({
          id: String(rule.id),
          name: String(rule.name || ""),
          creatorId: rule.creatorId ? String(rule.creatorId) : null,
          eventType: Number(rule.eventType ?? 0),
          triggerType: Number(rule.triggerType ?? 0),
          triggerMetadata:
            typeof rule.triggerMetadata?.toJSON === "function"
              ? rule.triggerMetadata.toJSON()
              : rule.triggerMetadata || null,
          enabled: Boolean(rule.enabled),
          exemptChannels: Array.isArray(rule.exemptChannels)
            ? rule.exemptChannels.map(String)
            : [],
          exemptRoles: Array.isArray(rule.exemptRoles)
            ? rule.exemptRoles.map(String)
            : [],
          actions: Array.isArray(rule.actions)
            ? rule.actions.map((action) =>
                typeof action?.toJSON === "function" ? action.toJSON() : action,
              )
            : [],
        }))
      : [],
    auditLogs,
    messages: {
      channels: messagesByChannel,
      threads: messagesByThread,
    },
  };

  const serialized = JSON.stringify(backupPayload);
  const compressed = await gzipAsync(serialized, {
    level: zlib.constants.Z_BEST_COMPRESSION,
  });

  const fileName = `${backupId}.json.gz`;
  const absolutePath = path.join(outputDir, fileName);
  await fs.writeFile(absolutePath, compressed);

  return {
    backupId,
    fileName,
    absolutePath,
    sizeBytes: compressed.length,
    stats: {
      members: members.length,
      roles: roles.length,
      channels: serializedChannels.length,
      threads: serializedThreads.length,
      messages:
        Object.values(messagesByChannel).reduce((sum, arr) => sum + arr.length, 0) +
        Object.values(messagesByThread).reduce((sum, arr) => sum + arr.length, 0),
      emojis: emojis.length,
      stickers: stickers.length,
      bans: backupPayload.bans.length,
      invites: backupPayload.invites.length,
      webhooks: backupPayload.webhooks.length,
      scheduledEvents: scheduledEvents.length,
      integrations: backupPayload.integrations.length,
      automodRules: backupPayload.autoModerationRules.length,
      auditLogs: auditLogs.length,
    },
  };
}

async function readGuildBackup(guildId, backupId) {
  const filePath = getBackupFilePath(guildId, backupId);
  const compressed = await fs.readFile(filePath);
  const uncompressed = await gunzipAsync(compressed);
  const payload = JSON.parse(uncompressed.toString("utf8"));
  return {
    filePath,
    sizeBytes: compressed.length,
    payload,
  };
}

async function deleteGuildBackup(guildId, backupId) {
  const filePath = getBackupFilePath(guildId, backupId);
  await fs.unlink(filePath);
  return { filePath };
}

function parseBackupIdFromFileName(fileName) {
  const raw = String(fileName || "");
  if (!raw.toLowerCase().endsWith(".json.gz")) return null;
  return raw.slice(0, -8).trim().toUpperCase() || null;
}

function toSafeDateLabel(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function readBackupMeta(guildId, backupId) {
  const { payload } = await readGuildBackup(guildId, backupId);
  return {
    backupId: String(payload?.backupId || backupId || "")
      .trim()
      .toUpperCase(),
    guildName: String(payload?.guild?.name || ""),
    createdAt: payload?.createdAt || null,
    source: String(payload?.source || "manual")
      .trim()
      .toLowerCase(),
  };
}

async function listGuildBackupMetas(
  guildId,
  { search = "", limit = 25, offset = 0 } = {},
) {
  const folder = getBackupFolder(guildId);
  const normalizedSearch = String(search || "")
    .trim()
    .toLowerCase();
  const safeLimit = Math.max(1, Math.min(250, Number(limit || 25)));
  const safeOffset = Math.max(0, Number(offset || 0));

  const files = await fs.readdir(folder).catch(() => []);
  const backupFiles = files
    .filter((name) => String(name).toLowerCase().endsWith(".json.gz"))
    .slice(0, 250);

  const withStats = await Promise.all(
    backupFiles.map(async (name) => {
      const filePath = path.join(folder, name);
      const stat = await fs.stat(filePath).catch(() => null);
      return {
        name,
        mtimeMs: Number(stat?.mtimeMs || 0),
      };
    }),
  );

  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const out = [];
  let seen = 0;
  for (const file of withStats) {
    const backupId = parseBackupIdFromFileName(file.name);
    if (!backupId) continue;
    if (normalizedSearch && !backupId.toLowerCase().includes(normalizedSearch)) {
      const hitName = file.name.toLowerCase().includes(normalizedSearch);
      if (!hitName) continue;
    }
    const meta = await readBackupMeta(guildId, backupId).catch(() => null);
    if (!meta) continue;

    const guildName = meta.guildName || "Unknown Guild";
    const dateLabel = toSafeDateLabel(meta.createdAt || file.mtimeMs);
    const label = `${guildName} | ${dateLabel} (${meta.backupId})`;
    const haystack = `${label} ${meta.backupId}`.toLowerCase();
    if (normalizedSearch && !haystack.includes(normalizedSearch)) continue;

    if (seen < safeOffset) {
      seen += 1;
      continue;
    }

    out.push({
      backupId: meta.backupId,
      guildName,
      createdAt: meta.createdAt || null,
      source: meta.source || "manual",
      label,
    });
    if (out.length >= safeLimit) break;
  }

  return out;
}

async function listGuildBackupMetasPaginated(
  guildId,
  { search = "", page = 1, pageSize = 10 } = {},
) {
  const safePageSize = Math.max(1, Math.min(25, Number(pageSize || 10)));
  const safePage = Math.max(1, Number(page || 1));

  const all = await listGuildBackupMetas(guildId, {
    search,
    limit: 500,
    offset: 0,
  });

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const finalPage = Math.min(safePage, totalPages);
  const start = (finalPage - 1) * safePageSize;
  const items = all.slice(start, start + safePageSize);

  return {
    items,
    total,
    totalPages,
    page: finalPage,
    pageSize: safePageSize,
  };
}

module.exports = {
  createGuildBackup,
  readGuildBackup,
  deleteGuildBackup,
  listGuildBackupMetas,
  listGuildBackupMetasPaginated,
};
