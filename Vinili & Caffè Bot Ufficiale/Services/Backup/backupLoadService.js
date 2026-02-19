const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { readBackupByIdGlobal, createGuildBackup } = require("./serverBackupService");

const LOAD_ACTIONS = [
  {
    key: "delete_roles",
    label: "Delete Roles",
    description: "All existing roles will be deleted",
    emoji: "🗑️",
  },
  {
    key: "delete_channels",
    label: "Delete Channels",
    description: "All existing channels will be deleted",
    emoji: "🧹",
  },
  {
    key: "load_roles",
    label: "Load Roles",
    description: "New roles will be loaded",
    emoji: "🧩",
  },
  {
    key: "load_channels",
    label: "Load Channels",
    description: "New channels will be loaded",
    emoji: "📂",
  },
  {
    key: "load_settings",
    label: "Load Settings",
    description: "Server settings will be updated",
    emoji: "⚙️",
  },
  {
    key: "load_threads",
    label: "Load Threads",
    description: "Threads and forum posts will be loaded",
    emoji: "🧵",
  },
  {
    key: "load_member_info",
    label: "Load Member Info",
    description: "Member roles and nicknames will be loaded",
    emoji: "👥",
  },
  {
    key: "load_bans",
    label: "Load Bans",
    description: "Banned members will be loaded",
    emoji: "🔨",
  },
  {
    key: "load_messages",
    label: "Load Messages",
    description: "Messages will be loaded",
    emoji: "💬",
  },
  {
    key: "load_pinned_messages",
    label: "Pinned Messages",
    description: "Pinned messages will be loaded",
    emoji: "📌",
  },
  {
    key: "load_emojis",
    label: "Load Emojis",
    description: "Custom emojis will be loaded",
    emoji: "😀",
  },
  {
    key: "load_stickers",
    label: "Load Stickers",
    description: "Stickers will be loaded",
    emoji: "🏷️",
  },
  {
    key: "load_webhooks",
    label: "Load Webhooks",
    description: "Webhooks will be restored",
    emoji: "🪝",
  },
  {
    key: "load_invites",
    label: "Load Invites",
    description: "Invites will be recreated",
    emoji: "🔗",
  },
  {
    key: "load_events",
    label: "Load Events",
    description: "Scheduled events will be loaded",
    emoji: "📅",
  },
  {
    key: "load_automod_rules",
    label: "Load AutoMod Rules",
    description: "AutoMod rules will be loaded",
    emoji: "🛡️",
  },
];

const ACTION_KEYS = new Set(LOAD_ACTIONS.map((a) => a.key));
const DEFAULT_ACTIONS = new Set(LOAD_ACTIONS.map((a) => a.key));
const DEFAULT_MESSAGES_LIMIT = 1000;
const MAX_MESSAGES_LIMIT = 50000;
const MESSAGE_LIMIT_PRESETS = [
  { label: "100 messages", value: "100", description: "Ripristina max 100 messaggi" },
  { label: "500 messages", value: "500", description: "Ripristina max 500 messaggi" },
  { label: "1,000 messages", value: "1000", description: "Ripristina max 1000 messaggi" },
  { label: "5,000 messages", value: "5000", description: "Ripristina max 5000 messaggi" },
  { label: "10,000 messages", value: "10000", description: "Ripristina max 10000 messaggi" },
  { label: "All available", value: "ALL", description: "Ripristina tutti i messaggi nel backup" },
];
const SESSION_TTL_MS = 1000 * 60 * 20;
const ACTIVE_LOAD_STALE_MS = 1000 * 60 * 60 * 6;
const sessions = new Map();
const activeLoadsByGuild = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeSessionId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function pruneSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (!session || session.expiresAt <= now) sessions.delete(id);
  }
}

function sanitizeActions(values) {
  const out = new Set();
  const arr = Array.isArray(values) ? values : [];
  for (const value of arr) {
    const key = String(value || "").trim();
    if (ACTION_KEYS.has(key)) out.add(key);
  }
  if (!out.size) return new Set(DEFAULT_ACTIONS);
  return out;
}

function normalizeMessagesLimit(value, fallback = DEFAULT_MESSAGES_LIMIT) {
  const raw = String(value ? "").trim().toUpperCase();
  if (raw === "ALL" || raw === "0" || raw === "NONE" || raw === "UNLIMITED") {
    return null;
  }
  const num = Number(raw || fallback);
  if (!Number.isFinite(num)) {
    return Number(fallback || DEFAULT_MESSAGES_LIMIT);
  }
  const safe = Math.max(1, Math.min(MAX_MESSAGES_LIMIT, Math.floor(num)));
  return safe;
}

function formatMessagesLimit(limit) {
  if (limit == null) return "ALL";
  return String(Number(limit || 0));
}

function createLoadSession({
  guildId,
  userId,
  backupId,
  sourceGuildId = null,
  selectedActions = null,
  messagesLimit = DEFAULT_MESSAGES_LIMIT,
}) {
  pruneSessions();
  const id = makeSessionId();
  const actions = sanitizeActions(selectedActions || [...DEFAULT_ACTIONS]);
  sessions.set(id, {
    id,
    guildId: String(guildId),
    userId: String(userId),
    backupId: String(backupId || "").trim().toUpperCase(),
    sourceGuildId: sourceGuildId ? String(sourceGuildId) : null,
    actions,
    messagesLimit: normalizeMessagesLimit(messagesLimit, DEFAULT_MESSAGES_LIMIT),
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return id;
}

function getLoadSession(sessionId) {
  pruneSessions();
  const id = String(sessionId || "");
  const session = sessions.get(id);
  if (!session) return null;
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function updateLoadSessionActions(sessionId, values) {
  const session = getLoadSession(sessionId);
  if (!session) return null;
  session.actions = sanitizeActions(values);
  return session;
}

function updateLoadSessionMessagesLimit(sessionId, value) {
  const session = getLoadSession(sessionId);
  if (!session) return null;
  session.messagesLimit = normalizeMessagesLimit(value, session.messagesLimit);
  return session;
}

function deleteLoadSession(sessionId) {
  sessions.delete(String(sessionId || ""));
}

class BackupLoadCancelledError extends Error {
  constructor(message = "Backup load cancelled by user.") {
    super(message);
    this.name = "BackupLoadCancelledError";
    this.code = "BACKUP_LOAD_CANCELLED";
  }
}

function getActiveLoadState(guildId) {
  const key = String(guildId || "");
  if (!key) return null;
  const state = activeLoadsByGuild.get(key) || null;
  if (!state) return null;

  const phase = String(state.phase || "").toLowerCase();
  const startedAt = Number(state.startedAtMs || 0);
  const updatedAt = Number(state.updatedAtMs || startedAt || 0);
  const now = Date.now();

  if (["completed", "failed", "cancelled", "done"].includes(phase)) {
    activeLoadsByGuild.delete(key);
    return null;
  }

  if (!startedAt || now - Math.max(startedAt, updatedAt) > ACTIVE_LOAD_STALE_MS) {
    activeLoadsByGuild.delete(key);
    return null;
  }

  return state;
}

function startActiveLoad({ guildId, userId, backupId, actions, messagesLimit }) {
  const key = String(guildId || "");
  if (!key) return null;
  const state = {
    guildId: key,
    userId: String(userId || ""),
    backupId: String(backupId || "").toUpperCase(),
    actions: Array.from(sanitizeActions(actions)),
    messagesLimit: normalizeMessagesLimit(messagesLimit, DEFAULT_MESSAGES_LIMIT),
    startedAtMs: Date.now(),
    updatedAtMs: Date.now(),
    cancelRequested: false,
    phase: "starting",
    processed: 0,
  };
  activeLoadsByGuild.set(key, state);
  return state;
}

function finishActiveLoad(guildId) {
  const key = String(guildId || "");
  if (!key) return;
  activeLoadsByGuild.delete(key);
}

function updateActiveLoad(guildId, patch = {}) {
  const state = getActiveLoadState(guildId);
  if (!state) return null;
  Object.assign(state, patch, { updatedAtMs: Date.now() });
  return state;
}

function requestCancelActiveLoad(guildId) {
  const state = getActiveLoadState(guildId);
  if (!state) return false;
  state.cancelRequested = true;
  state.updatedAtMs = Date.now();
  return true;
}

function throwIfCancelled(guildId) {
  const state = getActiveLoadState(guildId);
  if (state?.cancelRequested) {
    throw new BackupLoadCancelledError();
  }
}

function clearStaleActiveLoad(guildId) {
  const key = String(guildId || "");
  if (!key) return false;
  const current = activeLoadsByGuild.get(key);
  if (!current) return false;

  const phase = String(current.phase || "").toLowerCase();
  const startedAt = Number(current.startedAtMs || 0);
  const updatedAt = Number(current.updatedAtMs || startedAt || 0);
  const now = Date.now();

  const isTerminal = ["completed", "failed", "cancelled", "done"].includes(phase);
  const isStale = !startedAt || now - Math.max(startedAt, updatedAt) > ACTIVE_LOAD_STALE_MS;

  if (isTerminal || isStale) {
    activeLoadsByGuild.delete(key);
    return true;
  }

  return false;
}

function buildLoadWarningEmbed(backupId, messagesLimit = DEFAULT_MESSAGES_LIMIT) {
  return new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("Warning")
    .setDescription(
      [
        "What do you want the bot to load from the backup?",
        "",
        "Select below what actions should be performed.",
        "In the next step the restore starts immediately.",
        "",
        `Messages limit: \`${formatMessagesLimit(messagesLimit)}\``,
        "",
        `Backup ID: \`${String(backupId || "").toUpperCase()}\``,
      ].filter(Boolean).join("\n"),
    );
}

function buildLoadInProgressEmbed(backupId, checkpointId = null) {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("Info")
    .setDescription(
      [
        "**The backup will start loading now.** Please be patient, this can take a while!",
        "",
        "Use `/backup status` to get the current status and `/backup cancel` to cancel the process.",
        "",
        "*This message might not be updated.*",
        "",
        checkpointId ? `Checkpoint ID: \`${String(checkpointId || "").toUpperCase()}\`` : null,
        `Backup ID: \`${String(backupId || "").toUpperCase()}\``,
      ].filter(Boolean).join("\n"),
    );
}

function buildLoadStartComponents(sessionId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`backup_load_status:${sessionId}`)
        .setLabel("View Status")
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

function countBackupMessages(payload) {
  const channels = payload?.messages?.channels || {};
  const threads = payload?.messages?.threads || {};
  const chCount = Object.values(channels).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0,
  );
  const thCount = Object.values(threads).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0,
  );
  return chCount + thCount;
}

function countBackupPinnedMessages(payload) {
  const channels = payload?.messages?.channels || {};
  const threads = payload?.messages?.threads || {};
  const allLists = [...Object.values(channels), ...Object.values(threads)];
  let total = 0;
  for (const list of allLists) {
    if (!Array.isArray(list)) continue;
    total += list.filter((m) => Boolean(m?.pinned)).length;
  }
  return total;
}

function buildPreflightWarningEmbed({
  guild,
  payload,
  actions,
  backupId,
  messagesLimit = DEFAULT_MESSAGES_LIMIT,
}) {
  const safeActions = sanitizeActions(actions);
  const lines = [];
  const backupRoles = (Array.isArray(payload?.roles) ? payload.roles : []).filter(
    (r) => String(r?.name || "").trim() !== "@everyone",
  );
  const backupChannels = Array.isArray(payload?.channels) ? payload.channels : [];
  const backupThreads = Array.isArray(payload?.threads) ? payload.threads : [];
  const backupMembers = Array.isArray(payload?.members) ? payload.members : [];
  const backupBans = Array.isArray(payload?.bans) ? payload.bans : [];
  const backupEmojis = Array.isArray(payload?.emojis) ? payload.emojis : [];
  const backupStickers = Array.isArray(payload?.stickers) ? payload.stickers : [];
  const backupWebhooks = Array.isArray(payload?.webhooks) ? payload.webhooks : [];
  const backupInvites = Array.isArray(payload?.invites) ? payload.invites : [];
  const backupEvents = Array.isArray(payload?.scheduledEvents)
    ? payload.scheduledEvents
    : [];
  const backupAutomodRules = Array.isArray(payload?.autoModerationRules)
    ? payload.autoModerationRules
    : [];
  const totalMessages = countBackupMessages(payload);
  const effectiveLimit = normalizeMessagesLimit(messagesLimit, DEFAULT_MESSAGES_LIMIT);
  const loadableMessages =
    effectiveLimit == null ? totalMessages : Math.min(totalMessages, effectiveLimit);
  const pinnedMessages = countBackupPinnedMessages(payload);

  if (safeActions.has("load_roles")) {
    lines.push(`• **${backupRoles.length}** roles will be created`);
  }
  if (safeActions.has("delete_roles")) {
    const rolesToDelete = [...guild.roles.cache.values()].filter(
      (r) => r.editable && !r.managed && r.id !== guild.id,
    ).length;
    lines.push(`• **${rolesToDelete}** roles will be deleted`);
  }
  if (safeActions.has("load_channels")) {
    lines.push(`• **${backupChannels.length}** channels will be created`);
  }
  if (safeActions.has("delete_channels")) {
    lines.push(`• **${guild.channels.cache.size}** channels will be deleted`);
  }
  if (safeActions.has("load_settings")) {
    lines.push("• Server settings will be updated");
  }
  if (safeActions.has("load_threads")) {
    lines.push(`• **${backupThreads.length}** threads will be created`);
  }
  if (safeActions.has("load_member_info")) {
    lines.push(`• **${backupMembers.length}** members will be updated`);
  }
  if (safeActions.has("load_bans")) {
    lines.push(`• **${backupBans.length}** bans will be loaded`);
  }
  if (safeActions.has("load_messages")) {
    lines.push(`• **${loadableMessages}** messages will be loaded (limit: \`${formatMessagesLimit(effectiveLimit)}\`)`);
  }
  if (safeActions.has("load_pinned_messages")) {
    lines.push(`• **${pinnedMessages}** pinned messages will be loaded`);
  }
  if (safeActions.has("load_emojis")) {
    lines.push(`• **${backupEmojis.length}** emojis will be loaded`);
  }
  if (safeActions.has("load_stickers")) {
    lines.push(`• **${backupStickers.length}** stickers will be loaded`);
  }
  if (safeActions.has("load_webhooks")) {
    lines.push(`• **${backupWebhooks.length}** webhooks will be loaded`);
  }
  if (safeActions.has("load_invites")) {
    lines.push(`• **${backupInvites.length}** invites will be loaded`);
  }
  if (safeActions.has("load_events")) {
    lines.push(`• **${backupEvents.length}** scheduled events will be loaded`);
  }
  if (safeActions.has("load_automod_rules")) {
    lines.push(`• **${backupAutomodRules.length}** AutoMod rules will be loaded`);
  }

  if (!lines.length) lines.push("• No action selected");

  return new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("Warning")
    .setDescription(
      [
        "**Hey, be careful!** The following actions will be taken on this server and **can not be undone**:",
        "",
        ...lines,
        "",
        `Backup ID: \`${String(backupId || "").toUpperCase()}\``,
      ].filter(Boolean).join("\n"),
    );
}

function buildPreflightButtons(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`backup_load_confirm:${sessionId}`)
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`backup_load_cancel:${sessionId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );
}

function buildLoadDoneEmbed(backupId, stats) {
  return new EmbedBuilder()
    .setColor("#2ecc71")
    .setTitle("Backup loaded")
    .setDescription(
      [
        `Ripristino completato per \`${String(backupId || "").toUpperCase()}\`.`,
        "",
        `Ruoli eliminati: **${stats.deletedRoles}**`,
        `Canali eliminati: **${stats.deletedChannels}**`,
        `Ruoli creati: **${stats.createdRoles}**`,
        `Canali creati: **${stats.createdChannels}**`,
        `Thread creati: **${stats.createdThreads}**`,
        `Member aggiornati: **${stats.updatedMembers}**`,
        `Ban applicati: **${stats.loadedBans}**`,
        `Messaggi inviati: **${stats.loadedMessages}**`,
        `Messaggi pinnati: **${stats.loadedPinnedMessages}**`,
        `Emoji create: **${stats.loadedEmojis}**`,
        `Sticker creati: **${stats.loadedStickers}**`,
        `Webhook creati: **${stats.loadedWebhooks}**`,
        `Inviti creati: **${stats.loadedInvites}**`,
        `Eventi creati: **${stats.loadedEvents}**`,
        `Regole AutoMod create: **${stats.loadedAutomodRules}**`,
      ].filter(Boolean).join("\n"),
    );
}

function buildLoadErrorEmbed(error) {
  const detail = String(error?.message || error || "Errore sconosciuto").slice(0, 700);
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("Backup load failed")
    .setDescription(`<:vegax:1443934876440068179> ${detail}`);
}

function buildLoadCancelledEmbed(backupId) {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("Info")
    .setDescription(
      [
        "The loading process has been **cancelled**.",
        "",
        "Use `/backup load` to try again.",
      ].filter(Boolean).join("\n"),
    );
}

function buildLoadComponents(
  sessionId,
  selectedActions,
  messagesLimit = DEFAULT_MESSAGES_LIMIT,
) {
  const selected = sanitizeActions(selectedActions);
  const limitValue = formatMessagesLimit(normalizeMessagesLimit(messagesLimit));
  const options = LOAD_ACTIONS.map((action) => ({
    label: action.label,
    description: action.description,
    value: action.key,
    emoji: action.emoji,
    default: selected.has(action.key),
  }));

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`backup_load_actions:${sessionId}`)
      .setPlaceholder("Select load actions")
      .setMinValues(1)
      .setMaxValues(options.length)
      .addOptions(options),
  );

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`backup_load_continue:${sessionId}`)
      .setLabel("Continue")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`backup_load_cancel:${sessionId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  const limitRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`backup_load_messages_limit:${sessionId}`)
      .setPlaceholder("Select messages limit")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        MESSAGE_LIMIT_PRESETS.map((item) => ({
          label: item.label,
          value: item.value,
          description: item.description,
          default: String(item.value).toUpperCase() === String(limitValue).toUpperCase(),
        })),
      ),
  );

  return [selectRow, limitRow, buttonRow];
}

function buildDisabledComponents(components) {
  const rows = Array.isArray(components) ? components : [];
  return rows.map((row) => {
    const json = row?.toJSON ? row.toJSON() : row;
    const child = Array.isArray(json?.components) ? json.components : [];
    return {
      type: 1,
      components: child.map((comp) =>
        comp && typeof comp === "object" ? { ...comp, disabled: true } : comp,
      ),
    };
  });
}

function mapOverwriteId(rawId, roleMap, guild) {
  const id = String(rawId || "");
  if (!id) return null;
  if (roleMap.has(id)) return roleMap.get(id);
  if (id === String(guild.id)) return String(guild.id);
  return id;
}

function buildPermissionOverwrites(overwrites, roleMap, guild) {
  const list = Array.isArray(overwrites) ? overwrites : [];
  return list
    .map((ow) => {
      const id = mapOverwriteId(ow?.id, roleMap, guild);
      if (!id) return null;
      return {
        id,
        type: Number(ow?.type ? 0),
        allow: BigInt(String(ow?.allow ? "0")),
        deny: BigInt(String(ow?.deny ? "0")),
      };
    })
    .filter(Boolean);
}

async function syncLoadedRoles({
  guild,
  backupRoles,
  roleMap,
  backupId,
  throwIfCancelledFn,
  bumpProcessedFn,
}) {
  const roles = (Array.isArray(backupRoles) ? backupRoles : [])
    .filter((r) => String(r?.name || "").trim() !== "@everyone")
    .sort((a, b) => Number(a?.position ? 0) - Number(b?.position ? 0));

  for (const backupRole of roles) {
    throwIfCancelledFn();
    const mappedRoleId = roleMap.get(String(backupRole.id || ""));
    if (!mappedRoleId) continue;
    const role = guild.roles.cache.get(mappedRoleId);
    if (!role || !role.editable) continue;

    const icon = await resolveAssetInput(backupRole.iconData || backupRole.iconURL || null);
    await role
      .edit({
        name: String(backupRole.name || role.name),
        color: Number(backupRole.color || 0),
        hoist: Boolean(backupRole.hoist),
        mentionable: Boolean(backupRole.mentionable),
        permissions: BigInt(String(backupRole.permissions || "0")),
        ...(icon ? { icon } : {}),
        unicodeEmoji: backupRole.unicodeEmoji || undefined,
        reason: `Backup load ${backupId}`,
      })
      .catch(() => null);
    bumpProcessedFn();
    await sleep(120);
  }

  for (const backupRole of roles) {
    throwIfCancelledFn();
    const mappedRoleId = roleMap.get(String(backupRole.id || ""));
    if (!mappedRoleId) continue;
    const role = guild.roles.cache.get(mappedRoleId);
    if (!role || !role.editable) continue;
    await role
      .setPosition(Number(backupRole.position ? role.position), {
        reason: `Backup load ${backupId}`,
      })
      .catch(() => null);
    bumpProcessedFn();
    await sleep(100);
  }
}

async function syncLoadedChannels({
  guild,
  backupChannels,
  roleMap,
  channelMap,
  backupId,
  throwIfCancelledFn,
  bumpProcessedFn,
}) {
  const channels = Array.isArray(backupChannels) ? backupChannels : [];
  const categories = channels
    .filter((c) => Number(c?.type) === 4)
    .sort((a, b) => Number(a?.position ? 0) - Number(b?.position ? 0));
  const others = channels
    .filter((c) => Number(c?.type) !== 4)
    .sort((a, b) => Number(a?.position ? 0) - Number(b?.position ? 0));

  for (const backupChannel of [...categories, ...others]) {
    throwIfCancelledFn();
    const mappedChannelId = channelMap.get(String(backupChannel.id || ""));
    if (!mappedChannelId) continue;
    const channel = guild.channels.cache.get(mappedChannelId);
    if (!channel || !channel.manageable) continue;

    const parentMapped = backupChannel.parentId
      ? channelMap.get(String(backupChannel.parentId)) || null
      : null;
    const patch = {
      name: String(backupChannel.name || channel.name),
      position: Number(backupChannel.position ? channel.position),
      permissionOverwrites: buildPermissionOverwrites(
        backupChannel.permissionOverwrites,
        roleMap,
        guild,
      ),
      reason: `Backup load ${backupId}`,
    };

    if (Number(backupChannel.type) !== 4) {
      patch.parent = parentMapped || null;
    }
    if ("topic" in backupChannel && "topic" in channel) {
      patch.topic = backupChannel.topic || null;
    }
    if ("nsfw" in backupChannel && "nsfw" in channel) {
      patch.nsfw = Boolean(backupChannel.nsfw);
    }
    if ("rateLimitPerUser" in backupChannel && "rateLimitPerUser" in channel) {
      patch.rateLimitPerUser = Number(backupChannel.rateLimitPerUser ? 0);
    }
    if ("bitrate" in backupChannel && "bitrate" in channel) {
      patch.bitrate = Number(backupChannel.bitrate ? channel.bitrate ? 0) || undefined;
    }
    if ("userLimit" in backupChannel && "userLimit" in channel) {
      patch.userLimit = Number(backupChannel.userLimit ? 0) || undefined;
    }
    if ("rtcRegion" in backupChannel && "rtcRegion" in channel) {
      patch.rtcRegion = backupChannel.rtcRegion || null;
    }
    if ("videoQualityMode" in backupChannel && "videoQualityMode" in channel) {
      patch.videoQualityMode = backupChannel.videoQualityMode ? undefined;
    }
    if ("defaultAutoArchiveDuration" in backupChannel && "defaultAutoArchiveDuration" in channel) {
      patch.defaultAutoArchiveDuration = backupChannel.defaultAutoArchiveDuration ? undefined;
    }
    if ("defaultThreadRateLimitPerUser" in backupChannel && "defaultThreadRateLimitPerUser" in channel) {
      patch.defaultThreadRateLimitPerUser = backupChannel.defaultThreadRateLimitPerUser ? undefined;
    }
    if ("defaultForumLayout" in backupChannel && "defaultForumLayout" in channel) {
      patch.defaultForumLayout = backupChannel.defaultForumLayout ? undefined;
    }
    if ("defaultSortOrder" in backupChannel && "defaultSortOrder" in channel) {
      patch.defaultSortOrder = backupChannel.defaultSortOrder ? undefined;
    }
    if ("availableTags" in backupChannel && "availableTags" in channel) {
      patch.availableTags = Array.isArray(backupChannel.availableTags)
        ? backupChannel.availableTags
        : undefined;
    }
    if ("defaultReactionEmoji" in backupChannel && "defaultReactionEmoji" in channel) {
      patch.defaultReactionEmoji = backupChannel.defaultReactionEmoji || undefined;
    }

    await channel.edit(patch).catch(() => null);
    bumpProcessedFn();
    await sleep(120);
  }
}

function normalizeMessagePayload(message, backupId) {
  const authorTag = message?.author?.tag || message?.author?.username || message?.author?.id || "Unknown";
  const contentRaw = String(message?.content || "").trim();
  const header = `**[${backupId}] ${authorTag}**`;
  const content = contentRaw ? `${header}\n${contentRaw}` : header;

  const embedList = Array.isArray(message?.embeds) ? message.embeds.slice(0, 10) : [];
  const embeds = embedList
    .map((emb) => {
      if (!emb || typeof emb !== "object") return null;
      const clone = { ...emb };
      if (Array.isArray(clone.fields) && clone.fields.length > 25) {
        clone.fields = clone.fields.slice(0, 25);
      }
      return clone;
    })
    .filter(Boolean);

  return {
    content: content.slice(0, 1990),
    embeds,
  };
}

function ensureManageGuild(interaction) {
  return Boolean(interaction?.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild));
}

async function resolveAssetInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("data:")) {
    const commaIndex = raw.indexOf(",");
    if (commaIndex < 0) return null;
    return Buffer.from(raw.slice(commaIndex + 1), "base64");
  }
  if (typeof fetch !== "function") return null;
  try {
    const response = await fetch(raw);
    if (!response?.ok) return null;
    const arr = await response.arrayBuffer();
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

async function applyBackupToGuild(
  guild,
  backupId,
  selectedActions,
  sourceGuildId = null,
  messagesLimit = DEFAULT_MESSAGES_LIMIT,
) {
  const guildKey = String(guild?.id || "");
  const actions = sanitizeActions(selectedActions);
  const ref = sourceGuildId ? `${sourceGuildId}:${backupId}` : backupId;
  const { payload } = await readBackupByIdGlobal(ref);
  const effectiveMessagesLimit = normalizeMessagesLimit(
    messagesLimit,
    DEFAULT_MESSAGES_LIMIT,
  );
  const markPhase = (phase) => updateActiveLoad(guildKey, { phase });
  const bumpProcessed = (delta = 1) => {
    const state = getActiveLoadState(guildKey);
    if (!state) return;
    state.processed = Number(state.processed || 0) + Number(delta || 0);
    state.updatedAtMs = Date.now();
  };

  const stats = {
    deletedRoles: 0,
    deletedChannels: 0,
    createdRoles: 0,
    createdChannels: 0,
    createdThreads: 0,
    updatedMembers: 0,
    loadedBans: 0,
    loadedMessages: 0,
    loadedPinnedMessages: 0,
    loadedEmojis: 0,
    loadedStickers: 0,
    loadedWebhooks: 0,
    loadedInvites: 0,
    loadedEvents: 0,
    loadedAutomodRules: 0,
  };

  const roleMap = new Map();
  roleMap.set(String(guild.id), String(guild.id));

  if (actions.has("delete_roles")) {
    markPhase("delete_roles");
    const candidateRoles = [...guild.roles.cache.values()]
      .filter((r) => !r.managed && r.id !== guild.id)
      .sort((a, b) => a.position - b.position);
    const undeletable = candidateRoles.filter((r) => !r.editable);
    if (undeletable.length > 0) {
      const preview = undeletable
        .slice(0, 8)
        .map((r) => `@${r.name}`)
        .join(", ");
      throw new Error(
        `Impossibile eliminare tutti i ruoli: alza il ruolo del bot sopra i ruoli target. Bloccanti: ${preview}${undeletable.length > 8 ? ", ..." : ""}`,
      );
    }
    const roles = candidateRoles;
    for (const role of roles) {
      throwIfCancelled(guildKey);
      const ok = await role.delete("Backup load - delete roles").catch(() => null);
      if (ok) stats.deletedRoles += 1;
      bumpProcessed();
      await sleep(150);
    }
  }

  if (actions.has("load_roles")) {
    markPhase("load_roles");
    const backupRoles = (Array.isArray(payload?.roles) ? payload.roles : [])
      .filter((r) => String(r?.name || "").trim() !== "@everyone")
      .sort((a, b) => Number(a?.position ? 0) - Number(b?.position ? 0));

    for (const role of backupRoles) {
      throwIfCancelled(guildKey);
      const created = await guild.roles
        .create({
          name: String(role.name || "ruolo"),
          color: Number(role.color || 0),
          hoist: Boolean(role.hoist),
          mentionable: Boolean(role.mentionable),
          permissions: BigInt(String(role.permissions || "0")),
          icon:
            (await resolveAssetInput(role.iconData || role.iconURL || null)) ||
            undefined,
          unicodeEmoji: role.unicodeEmoji || undefined,
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      roleMap.set(String(role.id), String(created.id));
      stats.createdRoles += 1;
      bumpProcessed();
      await sleep(150);
    }
  } else {
    const backupRoles = Array.isArray(payload?.roles) ? payload.roles : [];
    for (const oldRole of backupRoles) {
      if (String(oldRole?.name || "").trim() === "@everyone") {
        roleMap.set(String(oldRole.id), String(guild.id));
        continue;
      }
      const hit = guild.roles.cache.find((r) => String(r.name) === String(oldRole.name));
      if (hit) roleMap.set(String(oldRole.id), String(hit.id));
    }
  }

  if (actions.has("load_roles")) {
    markPhase("sync_role_permissions");
    await syncLoadedRoles({
      guild,
      backupRoles: payload?.roles,
      roleMap,
      backupId,
      throwIfCancelledFn: () => throwIfCancelled(guildKey),
      bumpProcessedFn: () => bumpProcessed(),
    });
  }

  const channelMap = new Map();
  const threadMap = new Map();

  if (actions.has("delete_channels")) {
    markPhase("delete_channels");
    const channels = [...guild.channels.cache.values()].sort((a, b) => a.position - b.position);
    for (const channel of channels) {
      throwIfCancelled(guildKey);
      const ok = await channel.delete("Backup load - delete channels").catch(() => null);
      if (ok) stats.deletedChannels += 1;
      bumpProcessed();
      await sleep(250);
    }
  }

  if (actions.has("load_channels")) {
    markPhase("load_channels");
    const backupChannels = Array.isArray(payload?.channels) ? payload.channels : [];
    const categories = backupChannels
      .filter((c) => Number(c?.type) === 4)
      .sort((a, b) => Number(a?.position ? 0) - Number(b?.position ? 0));

    for (const cat of categories) {
      throwIfCancelled(guildKey);
      const created = await guild.channels
        .create({
          name: String(cat.name || "categoria"),
          type: 4,
          position: Number(cat.position ? 0),
          permissionOverwrites: buildPermissionOverwrites(cat.permissionOverwrites, roleMap, guild),
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      channelMap.set(String(cat.id), String(created.id));
      stats.createdChannels += 1;
      bumpProcessed();
      await sleep(250);
    }

    const others = backupChannels
      .filter((c) => Number(c?.type) !== 4)
      .sort((a, b) => Number(a?.position ? 0) - Number(b?.position ? 0));

    for (const ch of others) {
      throwIfCancelled(guildKey);
      const type = Number(ch?.type ? 0);
      if (![0, 2, 5, 13, 15, 16].includes(type)) continue;

      const parentId = ch.parentId ? channelMap.get(String(ch.parentId)) || null : null;
      const created = await guild.channels
        .create({
          name: String(ch.name || "canale"),
          type,
          topic: ch.topic || undefined,
          nsfw: Boolean(ch.nsfw),
          rateLimitPerUser: Number(ch.rateLimitPerUser ? 0),
          bitrate: Number(ch.bitrate ? 0) || undefined,
          userLimit: Number(ch.userLimit ? 0) || undefined,
          rtcRegion: ch.rtcRegion || null,
          videoQualityMode: ch.videoQualityMode ? undefined,
          defaultAutoArchiveDuration: ch.defaultAutoArchiveDuration ? undefined,
          defaultThreadRateLimitPerUser: ch.defaultThreadRateLimitPerUser ? undefined,
          defaultForumLayout: ch.defaultForumLayout ? undefined,
          defaultSortOrder: ch.defaultSortOrder ? undefined,
          availableTags: Array.isArray(ch.availableTags) ? ch.availableTags : undefined,
          defaultReactionEmoji: ch.defaultReactionEmoji || undefined,
          parent: parentId || undefined,
          position: Number(ch.position ? 0),
          permissionOverwrites: buildPermissionOverwrites(ch.permissionOverwrites, roleMap, guild),
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      channelMap.set(String(ch.id), String(created.id));
      stats.createdChannels += 1;
      bumpProcessed();
      await sleep(250);
    }
  } else {
    const backupChannels = Array.isArray(payload?.channels) ? payload.channels : [];
    for (const oldChannel of backupChannels) {
      const hit = guild.channels.cache.find((c) => String(c.name) === String(oldChannel.name));
      if (hit) channelMap.set(String(oldChannel.id), String(hit.id));
    }
  }

  if (actions.has("load_channels")) {
    markPhase("sync_channel_permissions");
    await syncLoadedChannels({
      guild,
      backupChannels: payload?.channels,
      roleMap,
      channelMap,
      backupId,
      throwIfCancelledFn: () => throwIfCancelled(guildKey),
      bumpProcessedFn: () => bumpProcessed(),
    });
  }

  if (actions.has("load_settings")) {
    markPhase("load_settings");
    throwIfCancelled(guildKey);
    const g = payload?.guild || {};
    const iconInput = await resolveAssetInput(g.iconData || g.iconURL || null);
    const bannerInput = await resolveAssetInput(
      g.bannerData || g.bannerURL || null,
    );
    const splashInput = await resolveAssetInput(
      g.splashData || g.splashURL || null,
    );
    const discoverySplashInput = await resolveAssetInput(
      g.discoverySplashData || g.discoverySplashURL || null,
    );
    await guild
      .edit({
        name: g.name || guild.name,
        description: g.description || null,
        verificationLevel: Number(g.verificationLevel ? guild.verificationLevel),
        defaultMessageNotifications: Number(
          g.defaultMessageNotifications ? guild.defaultMessageNotifications,
        ),
        explicitContentFilter: Number(g.explicitContentFilter ? guild.explicitContentFilter),
        preferredLocale: g.preferredLocale || guild.preferredLocale,
        afkTimeout: Number(g.afkTimeout ? guild.afkTimeout),
        systemChannel: g.systemChannelId
          ? channelMap.get(String(g.systemChannelId)) || guild.systemChannelId || null
          : null,
        rulesChannel: g.rulesChannelId
          ? channelMap.get(String(g.rulesChannelId)) || guild.rulesChannelId || null
          : null,
        publicUpdatesChannel: g.publicUpdatesChannelId
          ? channelMap.get(String(g.publicUpdatesChannelId)) || guild.publicUpdatesChannelId || null
          : null,
        safetyAlertsChannel: g.safetyAlertsChannelId
          ? channelMap.get(String(g.safetyAlertsChannelId)) || guild.safetyAlertsChannelId || null
          : null,
        ...(iconInput ? { icon: iconInput } : {}),
        ...(bannerInput ? { banner: bannerInput } : {}),
        ...(splashInput ? { splash: splashInput } : {}),
        ...(discoverySplashInput ? { discoverySplash: discoverySplashInput } : {}),
      })
      .catch(() => null);
    bumpProcessed();
  }

  if (actions.has("load_threads")) {
    markPhase("load_threads");
    const backupThreads = Array.isArray(payload?.threads) ? payload.threads : [];
    for (const thread of backupThreads) {
      throwIfCancelled(guildKey);
      const mappedParent = channelMap.get(String(thread.parentId || ""));
      if (!mappedParent) continue;
      const parent = guild.channels.cache.get(mappedParent);
      if (!parent || !parent.threads || typeof parent.threads.create !== "function") continue;

      const created = await parent.threads
        .create({
          name: String(thread.name || "thread"),
          autoArchiveDuration: Number(thread.autoArchiveDuration || 1440),
          rateLimitPerUser: Number(thread.rateLimitPerUser || 0),
          invitable: Boolean(thread.invitable),
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      await created
        .edit({
          archived: Boolean(thread.archived),
          locked: Boolean(thread.locked),
          autoArchiveDuration: Number(thread.autoArchiveDuration || 1440),
          rateLimitPerUser: Number(thread.rateLimitPerUser || 0),
          permissionOverwrites: buildPermissionOverwrites(
            thread.permissionOverwrites,
            roleMap,
            guild,
          ),
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      stats.createdThreads += 1;
      threadMap.set(String(thread.id), String(created.id));
      bumpProcessed();
      await sleep(250);
    }
  }

  if (actions.has("load_member_info")) {
    markPhase("load_member_info");
    const backupMembers = Array.isArray(payload?.members) ? payload.members : [];
    for (const memberData of backupMembers) {
      throwIfCancelled(guildKey);
      const member = await guild.members.fetch(String(memberData.id || "")).catch(() => null);
      if (!member) continue;

      const targetRoles = (Array.isArray(memberData.roles) ? memberData.roles : [])
        .map((oldId) => roleMap.get(String(oldId)))
        .filter(Boolean)
        .filter((id) => id !== guild.id && guild.roles.cache.has(id));

      if (targetRoles.length > 0) {
        await member.roles.set(targetRoles, `Backup load ${backupId}`).catch(() => null);
      }
      if (typeof memberData.nickname === "string") {
        await member.setNickname(memberData.nickname || null, `Backup load ${backupId}`).catch(() => null);
      }
      stats.updatedMembers += 1;
      bumpProcessed();
      await sleep(120);
    }
  }

  if (actions.has("load_bans")) {
    markPhase("load_bans");
    const bans = Array.isArray(payload?.bans) ? payload.bans : [];
    for (const ban of bans) {
      throwIfCancelled(guildKey);
      const userId = String(ban?.user?.id || "").trim();
      if (!userId) continue;
      const ok = await guild.bans
        .create(userId, { reason: ban?.reason || `Backup load ${backupId}` })
        .catch(() => null);
      if (ok) stats.loadedBans += 1;
      bumpProcessed();
      await sleep(200);
    }
  }

  if (actions.has("load_messages")) {
    markPhase("load_messages");
    const msgByChannel = payload?.messages?.channels || {};
    const entries = Object.entries(msgByChannel);
    let restoredMessages = 0;

    for (const [oldChannelId, messages] of entries) {
      if (effectiveMessagesLimit != null && restoredMessages >= effectiveMessagesLimit) break;
      throwIfCancelled(guildKey);
      const mapped = channelMap.get(String(oldChannelId));
      if (!mapped) continue;
      const channel = guild.channels.cache.get(mapped);
      if (!channel || !channel.isTextBased || !channel.isTextBased()) continue;

      const list = Array.isArray(messages) ? messages : [];
      for (const message of list) {
        if (effectiveMessagesLimit != null && restoredMessages >= effectiveMessagesLimit) break;
        throwIfCancelled(guildKey);
        const payloadToSend = normalizeMessagePayload(message, backupId);
        const sent = await channel.send(payloadToSend).catch(() => null);
        if (!sent) continue;
        stats.loadedMessages += 1;
        restoredMessages += 1;
        bumpProcessed();

        if (actions.has("load_pinned_messages") && message?.pinned) {
          const pinned = await sent.pin("Backup load pinned message").catch(() => null);
          if (pinned) stats.loadedPinnedMessages += 1;
          if (pinned) bumpProcessed();
        }

        await sleep(350);
      }
    }

    const msgByThread = payload?.messages?.threads || {};
    const threadEntries = Object.entries(msgByThread);
    for (const [oldThreadId, messages] of threadEntries) {
      if (effectiveMessagesLimit != null && restoredMessages >= effectiveMessagesLimit) break;
      throwIfCancelled(guildKey);
      const mappedThreadId = threadMap.get(String(oldThreadId));
      if (!mappedThreadId) continue;
      const thread = guild.channels.cache.get(mappedThreadId);
      if (!thread || !thread.isTextBased || !thread.isTextBased()) continue;

      const list = Array.isArray(messages) ? messages : [];
      for (const message of list) {
        if (effectiveMessagesLimit != null && restoredMessages >= effectiveMessagesLimit) break;
        throwIfCancelled(guildKey);
        const payloadToSend = normalizeMessagePayload(message, backupId);
        const sent = await thread.send(payloadToSend).catch(() => null);
        if (!sent) continue;
        stats.loadedMessages += 1;
        restoredMessages += 1;
        bumpProcessed();

        if (actions.has("load_pinned_messages") && message?.pinned) {
          const pinned = await sent.pin("Backup load pinned message").catch(() => null);
          if (pinned) stats.loadedPinnedMessages += 1;
          if (pinned) bumpProcessed();
        }
        await sleep(350);
      }
    }
  }

  if (actions.has("load_emojis")) {
    markPhase("load_emojis");
    const emojis = Array.isArray(payload?.emojis) ? payload.emojis : [];
    for (const emoji of emojis) {
      throwIfCancelled(guildKey);
      if (!emoji?.name || !emoji?.url) continue;
      if (guild.emojis.cache.some((e) => String(e.name) === String(emoji.name))) continue;
      const attachment = await resolveAssetInput(emoji.url);
      if (!attachment) continue;
      const mappedRoles = (Array.isArray(emoji.roles) ? emoji.roles : [])
        .map((oldId) => roleMap.get(String(oldId)))
        .filter(Boolean);
      const created = await guild.emojis
        .create({
          attachment,
          name: String(emoji.name),
          roles: mappedRoles,
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      stats.loadedEmojis += 1;
      bumpProcessed();
      await sleep(350);
    }
  }

  if (actions.has("load_stickers")) {
    markPhase("load_stickers");
    const stickers = Array.isArray(payload?.stickers) ? payload.stickers : [];
    for (const sticker of stickers) {
      throwIfCancelled(guildKey);
      if (!sticker?.name || !sticker?.url) continue;
      if (guild.stickers.cache.some((s) => String(s.name) === String(sticker.name))) continue;
      const file = await resolveAssetInput(sticker.url);
      if (!file) continue;
      const created = await guild.stickers
        .create({
          file,
          name: String(sticker.name || "sticker"),
          description: sticker.description || undefined,
          tags: String(sticker.tags || "backup"),
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      stats.loadedStickers += 1;
      bumpProcessed();
      await sleep(350);
    }
  }

  if (actions.has("load_webhooks")) {
    markPhase("load_webhooks");
    const webhooks = Array.isArray(payload?.webhooks) ? payload.webhooks : [];
    for (const hook of webhooks) {
      throwIfCancelled(guildKey);
      const mappedChannelId = channelMap.get(String(hook?.channelId || ""));
      if (!mappedChannelId) continue;
      const channel = guild.channels.cache.get(mappedChannelId);
      if (!channel || typeof channel.createWebhook !== "function") continue;
      const avatar = await resolveAssetInput(hook?.avatar ? `https://cdn.discordapp.com/avatars/${hook.id}/${hook.avatar}.png` : null);
      const created = await channel
        .createWebhook({
          name: String(hook?.name || "backup-webhook"),
          avatar: avatar || undefined,
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      stats.loadedWebhooks += 1;
      bumpProcessed();
      await sleep(350);
    }
  }

  if (actions.has("load_invites")) {
    markPhase("load_invites");
    const invites = Array.isArray(payload?.invites) ? payload.invites : [];
    for (const invite of invites) {
      throwIfCancelled(guildKey);
      const mappedChannelId = channelMap.get(String(invite?.channelId || ""));
      if (!mappedChannelId) continue;
      const channel = guild.channels.cache.get(mappedChannelId);
      if (!channel || typeof channel.createInvite !== "function") continue;
      const created = await channel
        .createInvite({
          maxAge: Number(invite?.maxAge || 0),
          maxUses: Number(invite?.maxUses || 0),
          temporary: Boolean(invite?.temporary),
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      stats.loadedInvites += 1;
      bumpProcessed();
      await sleep(250);
    }
  }

  if (actions.has("load_events")) {
    markPhase("load_events");
    const events = Array.isArray(payload?.scheduledEvents)
      ? payload.scheduledEvents
      : [];
    for (const ev of events) {
      throwIfCancelled(guildKey);
      const mappedChannelId = ev?.channelId
        ? channelMap.get(String(ev.channelId)) || null
        : null;
      const created = await guild.scheduledEvents
        .create({
          name: String(ev?.name || "Backup Event"),
          description: ev?.description || undefined,
          scheduledStartTime: ev?.scheduledStartAt || new Date(Date.now() + 3600000),
          scheduledEndTime: ev?.scheduledEndAt || undefined,
          privacyLevel: Number(ev?.privacyLevel || 2),
          entityType: Number(ev?.entityType || 3),
          channel: mappedChannelId || undefined,
          entityMetadata: ev?.entityMetadata || undefined,
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      stats.loadedEvents += 1;
      bumpProcessed();
      await sleep(250);
    }
  }

  if (actions.has("load_automod_rules")) {
    markPhase("load_automod_rules");
    const rules = Array.isArray(payload?.autoModerationRules)
      ? payload.autoModerationRules
      : [];
    for (const rule of rules) {
      throwIfCancelled(guildKey);
      const exemptChannels = (Array.isArray(rule?.exemptChannels)
        ? rule.exemptChannels
        : [])
        .map((oldId) => channelMap.get(String(oldId)))
        .filter(Boolean);
      const exemptRoles = (Array.isArray(rule?.exemptRoles) ? rule.exemptRoles : [])
        .map((oldId) => roleMap.get(String(oldId)))
        .filter(Boolean);
      const created = await guild.autoModerationRules
        .create({
          name: String(rule?.name || "backup-rule"),
          eventType: Number(rule?.eventType || 1),
          triggerType: Number(rule?.triggerType || 1),
          triggerMetadata: rule?.triggerMetadata || undefined,
          actions: Array.isArray(rule?.actions) ? rule.actions : [],
          enabled: Boolean(rule?.enabled),
          exemptChannels,
          exemptRoles,
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      stats.loadedAutomodRules += 1;
      bumpProcessed();
      await sleep(250);
    }
  }

  markPhase("completed");
  return stats;
}

function compareBigIntString(left, right) {
  const a = String(left ? "0");
  const b = String(right ? "0");
  return BigInt(a) === BigInt(b);
}

function computePermissionDiffs(guild, payload) {
  const diffs = {
    rolePermissionMismatches: 0,
    channelOverwriteMismatches: 0,
    roleMissing: 0,
    channelMissing: 0,
  };

  const backupRoles = (Array.isArray(payload?.roles) ? payload.roles : []).filter(
    (r) => String(r?.name || "").trim() !== "@everyone",
  );
  for (const role of backupRoles) {
    const live = guild.roles.cache.find((r) => String(r.name) === String(role?.name || ""));
    if (!live) {
      diffs.roleMissing += 1;
      continue;
    }
    if (!compareBigIntString(live.permissions?.bitfield ? 0n, role?.permissions ? "0")) {
      diffs.rolePermissionMismatches += 1;
    }
  }

  const backupChannels = Array.isArray(payload?.channels) ? payload.channels : [];
  for (const ch of backupChannels) {
    const live = guild.channels.cache.find(
      (c) => Number(c?.type ? -1) === Number(ch?.type ? -2) && String(c?.name || "") === String(ch?.name || ""),
    );
    if (!live) {
      diffs.channelMissing += 1;
      continue;
    }

    const expected = Array.isArray(ch?.permissionOverwrites) ? ch.permissionOverwrites : [];
    const actualCache = live?.permissionOverwrites?.cache;
    if (!actualCache) {
      if (expected.length > 0) diffs.channelOverwriteMismatches += 1;
      continue;
    }

    let mismatch = false;
    for (const ow of expected) {
      const current = actualCache.get(String(ow?.id || ""));
      if (!current) {
        mismatch = true;
        break;
      }
      const allowOk = compareBigIntString(current.allow?.bitfield ? 0n, ow?.allow ? "0");
      const denyOk = compareBigIntString(current.deny?.bitfield ? 0n, ow?.deny ? "0");
      if (!allowOk || !denyOk) {
        mismatch = true;
        break;
      }
    }

    if (mismatch) diffs.channelOverwriteMismatches += 1;
  }

  return diffs;
}

async function runBackupDryRun(
  guild,
  backupRef,
  selectedActions = null,
  messagesLimit = DEFAULT_MESSAGES_LIMIT,
) {
  const actions = sanitizeActions(selectedActions || [...DEFAULT_ACTIONS]);
  const { payload, guildId: sourceGuildId, backupId } = await readBackupByIdGlobal(backupRef);
  const diff = computePermissionDiffs(guild, payload);
  const totalMessages = countBackupMessages(payload);
  const effectiveLimit = normalizeMessagesLimit(messagesLimit, DEFAULT_MESSAGES_LIMIT);

  const backupRoles = (Array.isArray(payload?.roles) ? payload.roles : []).filter(
    (r) => String(r?.name || "").trim() !== "@everyone",
  );
  const backupChannels = Array.isArray(payload?.channels) ? payload.channels : [];
  const backupThreads = Array.isArray(payload?.threads) ? payload.threads : [];
  const backupMembers = Array.isArray(payload?.members) ? payload.members : [];

  const summary = {
    backupId: String(backupId || "").toUpperCase(),
    sourceGuildId: String(sourceGuildId || ""),
    actions: [...actions],
    canDeleteRoles: [...guild.roles.cache.values()].every((r) => r.id === guild.id || r.managed || r.editable),
    canDeleteChannels: [...guild.channels.cache.values()].every((c) => c.deletable),
    expected: {
      createRoles: backupRoles.length,
      createChannels: backupChannels.length,
      createThreads: backupThreads.length,
      updateMembers: backupMembers.length,
      loadMessages: effectiveLimit == null ? totalMessages : Math.min(totalMessages, effectiveLimit),
      loadPinnedMessages: countBackupPinnedMessages(payload),
      messagesLimit: effectiveLimit,
    },
    permissions: diff,
  };

  return summary;
}

function buildDryRunEmbed(result) {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("Backup Dry Run")
    .setDescription(
      [
        `Backup ID: \`${String(result?.backupId || "")}\``,
        `Source Guild: \`${String(result?.sourceGuildId || "unknown")}\``,
        "",
        "**Planned Actions**",
        String(result?.actions || []).map((a) => `• \`${a}\``).join("\n") || "• none",
        "",
        "**Estimated Changes**",
        `• Roles to create: **${Number(result?.expected?.createRoles || 0)}**`,
        `• Channels to create: **${Number(result?.expected?.createChannels || 0)}**`,
        `• Threads to create: **${Number(result?.expected?.createThreads || 0)}**`,
        `• Members to update: **${Number(result?.expected?.updateMembers || 0)}**`,
        `• Messages to load: **${Number(result?.expected?.loadMessages || 0)}**`,
        `• Messages limit: \`${formatMessagesLimit(result?.expected?.messagesLimit)}\``,
        `• Pinned to load: **${Number(result?.expected?.loadPinnedMessages || 0)}**`,
        "",
        "**Permission Diff**",
        `• Missing roles: **${Number(result?.permissions?.roleMissing || 0)}**`,
        `• Role permission mismatches: **${Number(result?.permissions?.rolePermissionMismatches || 0)}**`,
        `• Missing channels: **${Number(result?.permissions?.channelMissing || 0)}**`,
        `• Channel overwrite mismatches: **${Number(result?.permissions?.channelOverwriteMismatches || 0)}**`,
        "",
        "**Safety Checks**",
        `• Deletable roles check: **${result?.canDeleteRoles ? "OK" : "BLOCKED"}**`,
        `• Deletable channels check: **${result?.canDeleteChannels ? "OK" : "BLOCKED"}**`,
      ].filter(Boolean).join("\n"),
    );
}
async function handleBackupLoadInteraction(interaction) {
  const customId = String(interaction?.customId || "");
  const isSelect = interaction?.isStringSelectMenu?.();
  const isButton = interaction?.isButton?.();

  const isTarget =
    customId.startsWith("backup_load_actions:") ||
    customId.startsWith("backup_load_messages_limit:") ||
    customId.startsWith("backup_load_confirm:") ||
    customId.startsWith("backup_load_continue:") ||
    customId.startsWith("backup_load_cancel:") ||
    customId.startsWith("backup_load_status:");
  if (!isTarget) return false;

  const sessionId = customId.split(":")[1] || "";
  const session = getLoadSession(sessionId);
  if (!session) {
    await interaction
      .reply({
        content: "Sessione backup scaduta. Riesegui `/backup load`.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  if (String(session.userId) !== String(interaction.user?.id || "")) {
    await interaction
      .reply({
        content: "Questo pannello non è tuo.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  if (String(session.guildId) !== String(interaction.guildId || "")) {
    await interaction
      .reply({
        content: "Questo pannello appartiene a un altro server.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  if (!ensureManageGuild(interaction)) {
    await interaction
      .reply({
        content: "Ti serve il permesso Manage Server per usare il backup load.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  if (isSelect && customId.startsWith("backup_load_actions:")) {
    const next = updateLoadSessionActions(sessionId, interaction.values || []);
    await interaction
      .update({
        embeds: [buildLoadWarningEmbed(next.backupId, next.messagesLimit)],
        components: buildLoadComponents(next.id, next.actions, next.messagesLimit),
      })
      .catch(() => {});
    return true;
  }

  if (isSelect && customId.startsWith("backup_load_messages_limit:")) {
    const selected = String(interaction.values?.[0] || "").trim();
    const next = updateLoadSessionMessagesLimit(sessionId, selected);
    await interaction
      .update({
        embeds: [buildLoadWarningEmbed(next.backupId, next.messagesLimit)],
        components: buildLoadComponents(next.id, next.actions, next.messagesLimit),
      })
      .catch(() => {});
    return true;
  }

  if (isButton && customId.startsWith("backup_load_cancel:")) {
    deleteLoadSession(sessionId);
    await interaction
      .update({
        embeds: [buildLoadCancelledEmbed(session.backupId)],
        components: [],
      })
      .catch(() => {});
    return true;
  }

  if (isButton && customId.startsWith("backup_load_continue:")) {
    try {
      const ref = session.sourceGuildId
        ? `${session.sourceGuildId}:${session.backupId}`
        : session.backupId;
      const { payload } = await readBackupByIdGlobal(ref);
      await interaction
        .update({
          embeds: [
            buildPreflightWarningEmbed({
              guild: interaction.guild,
              payload,
              actions: [...session.actions],
              backupId: session.backupId,
              messagesLimit: session.messagesLimit,
            }),
          ],
          components: [buildPreflightButtons(session.id)],
        })
        .catch(() => {});
    } catch (error) {
      global.logger?.error?.("[backup.load] failed:", error);
      await interaction
        .update({
          embeds: [buildLoadErrorEmbed(error)],
          components: [],
        })
        .catch(() => {});
    }

    return true;
  }

  if (isButton && customId.startsWith("backup_load_confirm:")) {
    clearStaleActiveLoad(interaction.guildId);
    if (getActiveLoadState(interaction.guildId)) {
      await interaction
        .reply({
          content: "C'è già un backup load in corso in questo server.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    await interaction.deferUpdate().catch(() => {});
    startActiveLoad({
      guildId: interaction.guildId,
      userId: session.userId,
      backupId: session.backupId,
      actions: [...session.actions],
      messagesLimit: session.messagesLimit,
    });
    await interaction.message
      .edit({
        embeds: [buildLoadInProgressEmbed(session.backupId)],
        components: buildLoadStartComponents(session.id),
      })
      .catch(() => {});

    void (async () => {
      try {
        let checkpointId = null;
        try {
          const checkpoint = await createGuildBackup(interaction.guild, {
            source: "automatic",
          });
          checkpointId = String(checkpoint?.backupId || "").toUpperCase() || null;
          updateActiveLoad(interaction.guildId, { checkpointId });
          if (checkpointId) {
            await interaction.message
              .edit({
                embeds: [buildLoadInProgressEmbed(session.backupId, checkpointId)],
                components: buildLoadStartComponents(session.id),
              })
              .catch(() => {});
          }
        } catch (checkpointError) {
          global.logger?.warn?.("[backup.load] checkpoint failed:", checkpointError);
        }

        const stats = await applyBackupToGuild(
          interaction.guild,
          session.backupId,
          [...session.actions],
          session.sourceGuildId,
          session.messagesLimit,
        );
        await interaction.message
          .edit({
            embeds: [buildLoadDoneEmbed(session.backupId, stats)],
            components: [],
          })
          .catch(() => {});
      } catch (error) {
        global.logger?.error?.("[backup.load] failed:", error);
        await interaction.message
          .edit({
            embeds: [
              error?.code === "BACKUP_LOAD_CANCELLED"
                ? buildLoadCancelledEmbed(session.backupId)
                : buildLoadErrorEmbed(error),
            ],
            components: [],
          })
          .catch(() => {});
      } finally {
        finishActiveLoad(interaction.guildId);
        deleteLoadSession(sessionId);
      }
    })();

    return true;
  }

  if (isButton && customId.startsWith("backup_load_status:")) {
    const status = getGuildBackupLoadStatus(interaction.guildId);
    if (!status) {
      await interaction
        .reply({
          content: "Nessun backup load in corso.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const startedAt = Math.floor(Number(status.startedAtMs || Date.now()) / 1000);
    await interaction
      .reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#3498db")
            .setTitle("Backup Load Status")
            .setDescription(
              [
                `Backup ID: \`${status.backupId}\``,
                `Started: <t:${startedAt}:R>`,
                `Phase: \`${status.phase}\``,
                `Processed items: **${status.processed}**`, 
                `Cancel requested: **${status.cancelRequested ? "yes" : "no"}**`, 
                `Messages limit: \`${formatMessagesLimit(status.messagesLimit)}\``,
                status.checkpointId ? `Checkpoint: \`${status.checkpointId}\`` : null,
              ].filter(Boolean).join("\n"),
            ),
        ],
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  return false;
}

function getGuildBackupLoadStatus(guildId) {
  const state = getActiveLoadState(guildId);
  if (!state) return null;
  return {
    guildId: state.guildId,
    userId: state.userId,
    backupId: state.backupId,
    actions: Array.isArray(state.actions) ? [...state.actions] : [],
    startedAtMs: Number(state.startedAtMs || Date.now()),
    cancelRequested: Boolean(state.cancelRequested),
    phase: String(state.phase || "starting"),
    processed: Number(state.processed || 0),
    messagesLimit: normalizeMessagesLimit(state.messagesLimit, DEFAULT_MESSAGES_LIMIT),
    checkpointId: state.checkpointId ? String(state.checkpointId).toUpperCase() : null,
  };
}

function cancelGuildBackupLoad(guildId) {
  return requestCancelActiveLoad(guildId);
}

module.exports = {
  LOAD_ACTIONS,
  DEFAULT_ACTIONS,
  createLoadSession,
  buildLoadWarningEmbed,
  buildLoadComponents,
  handleBackupLoadInteraction,
  getGuildBackupLoadStatus,
  cancelGuildBackupLoad,
  runBackupDryRun,
  buildDryRunEmbed,
};















