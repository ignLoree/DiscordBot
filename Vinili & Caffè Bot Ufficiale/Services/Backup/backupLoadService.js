const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { readGuildBackup } = require("./serverBackupService");

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
];

const ACTION_KEYS = new Set(LOAD_ACTIONS.map((a) => a.key));
const DEFAULT_ACTIONS = new Set(LOAD_ACTIONS.map((a) => a.key));
const SESSION_TTL_MS = 1000 * 60 * 20;
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

function createLoadSession({ guildId, userId, backupId, selectedActions = null }) {
  pruneSessions();
  const id = makeSessionId();
  const actions = sanitizeActions(selectedActions || [...DEFAULT_ACTIONS]);
  sessions.set(id, {
    id,
    guildId: String(guildId),
    userId: String(userId),
    backupId: String(backupId || "").trim().toUpperCase(),
    actions,
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
  return activeLoadsByGuild.get(key) || null;
}

function startActiveLoad({ guildId, userId, backupId, actions }) {
  const key = String(guildId || "");
  if (!key) return null;
  const state = {
    guildId: key,
    userId: String(userId || ""),
    backupId: String(backupId || "").toUpperCase(),
    actions: Array.from(sanitizeActions(actions)),
    startedAtMs: Date.now(),
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
  Object.assign(state, patch);
  return state;
}

function requestCancelActiveLoad(guildId) {
  const state = getActiveLoadState(guildId);
  if (!state) return false;
  state.cancelRequested = true;
  return true;
}

function throwIfCancelled(guildId) {
  const state = getActiveLoadState(guildId);
  if (state?.cancelRequested) {
    throw new BackupLoadCancelledError();
  }
}

function buildLoadWarningEmbed(backupId) {
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
        `Backup ID: \`${String(backupId || "").toUpperCase()}\``,
      ].join("\n"),
    );
}

function buildLoadInProgressEmbed(backupId) {
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
        `Backup ID: \`${String(backupId || "").toUpperCase()}\``,
      ].join("\n"),
    );
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

function buildPreflightWarningEmbed({ guild, payload, actions, backupId }) {
  const safeActions = sanitizeActions(actions);
  const lines = [];
  const backupRoles = (Array.isArray(payload?.roles) ? payload.roles : []).filter(
    (r) => String(r?.name || "").trim() !== "@everyone",
  );
  const backupChannels = Array.isArray(payload?.channels) ? payload.channels : [];
  const backupThreads = Array.isArray(payload?.threads) ? payload.threads : [];
  const backupMembers = Array.isArray(payload?.members) ? payload.members : [];
  const backupBans = Array.isArray(payload?.bans) ? payload.bans : [];
  const totalMessages = countBackupMessages(payload);
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
    lines.push(`• **${totalMessages}** messages will be loaded`);
  }
  if (safeActions.has("load_pinned_messages")) {
    lines.push(`• **${pinnedMessages}** pinned messages will be loaded`);
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
      ].join("\n"),
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
      ].join("\n"),
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
      ].join("\n"),
    );
}

function buildLoadComponents(sessionId, selectedActions) {
  const selected = sanitizeActions(selectedActions);
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

  return [selectRow, buttonRow];
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
        type: Number(ow?.type ?? 0),
        allow: BigInt(String(ow?.allow ?? "0")),
        deny: BigInt(String(ow?.deny ?? "0")),
      };
    })
    .filter(Boolean);
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

async function applyBackupToGuild(guild, backupId, selectedActions) {
  const guildKey = String(guild?.id || "");
  const actions = sanitizeActions(selectedActions);
  const { payload } = await readGuildBackup(guild.id, backupId);
  const markPhase = (phase) => updateActiveLoad(guildKey, { phase });
  const bumpProcessed = (delta = 1) => {
    const state = getActiveLoadState(guildKey);
    if (!state) return;
    state.processed = Number(state.processed || 0) + Number(delta || 0);
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
  };

  const roleMap = new Map();
  roleMap.set(String(guild.id), String(guild.id));

  if (actions.has("delete_roles")) {
    markPhase("delete_roles");
    const roles = [...guild.roles.cache.values()]
      .filter((r) => r.editable && !r.managed && r.id !== guild.id)
      .sort((a, b) => a.position - b.position);
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
      .sort((a, b) => Number(a?.position ?? 0) - Number(b?.position ?? 0));

    for (const role of backupRoles) {
      throwIfCancelled(guildKey);
      const created = await guild.roles
        .create({
          name: String(role.name || "ruolo"),
          color: Number(role.color || 0),
          hoist: Boolean(role.hoist),
          mentionable: Boolean(role.mentionable),
          permissions: BigInt(String(role.permissions || "0")),
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

  const channelMap = new Map();

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
      .sort((a, b) => Number(a?.position ?? 0) - Number(b?.position ?? 0));

    for (const cat of categories) {
      throwIfCancelled(guildKey);
      const created = await guild.channels
        .create({
          name: String(cat.name || "categoria"),
          type: 4,
          position: Number(cat.position ?? 0),
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
      .sort((a, b) => Number(a?.position ?? 0) - Number(b?.position ?? 0));

    for (const ch of others) {
      throwIfCancelled(guildKey);
      const type = Number(ch?.type ?? 0);
      if (![0, 2, 5, 13, 15].includes(type)) continue;

      const parentId = ch.parentId ? channelMap.get(String(ch.parentId)) || null : null;
      const created = await guild.channels
        .create({
          name: String(ch.name || "canale"),
          type,
          topic: ch.topic || undefined,
          nsfw: Boolean(ch.nsfw),
          rateLimitPerUser: Number(ch.rateLimitPerUser ?? 0),
          bitrate: Number(ch.bitrate ?? 0) || undefined,
          userLimit: Number(ch.userLimit ?? 0) || undefined,
          parent: parentId || undefined,
          position: Number(ch.position ?? 0),
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

  if (actions.has("load_settings")) {
    markPhase("load_settings");
    throwIfCancelled(guildKey);
    const g = payload?.guild || {};
    await guild
      .edit({
        name: g.name || guild.name,
        description: g.description || null,
        verificationLevel: Number(g.verificationLevel ?? guild.verificationLevel),
        defaultMessageNotifications: Number(
          g.defaultMessageNotifications ?? guild.defaultMessageNotifications,
        ),
        explicitContentFilter: Number(g.explicitContentFilter ?? guild.explicitContentFilter),
        afkTimeout: Number(g.afkTimeout ?? guild.afkTimeout),
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
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      stats.createdThreads += 1;
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

    for (const [oldChannelId, messages] of entries) {
      throwIfCancelled(guildKey);
      const mapped = channelMap.get(String(oldChannelId));
      if (!mapped) continue;
      const channel = guild.channels.cache.get(mapped);
      if (!channel || !channel.isTextBased || !channel.isTextBased()) continue;

      const list = Array.isArray(messages) ? messages : [];
      for (const message of list) {
        throwIfCancelled(guildKey);
        const payloadToSend = normalizeMessagePayload(message, backupId);
        const sent = await channel.send(payloadToSend).catch(() => null);
        if (!sent) continue;
        stats.loadedMessages += 1;
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

  markPhase("completed");
  return stats;
}

async function handleBackupLoadInteraction(interaction) {
  const customId = String(interaction?.customId || "");
  const isSelect = interaction?.isStringSelectMenu?.();
  const isButton = interaction?.isButton?.();

  const isTarget =
    customId.startsWith("backup_load_actions:") ||
    customId.startsWith("backup_load_confirm:") ||
    customId.startsWith("backup_load_continue:") ||
    customId.startsWith("backup_load_cancel:");
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
        content: "Questo pannello non e tuo.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  if (String(session.guildId) !== String(interaction.guildId || "")) {
    await interaction
      .reply({
        content: "Questo pannello appartiene ad un altro server.",
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
        embeds: [buildLoadWarningEmbed(next.backupId)],
        components: buildLoadComponents(next.id, next.actions),
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
      const { payload } = await readGuildBackup(
        interaction.guildId,
        session.backupId,
      );
      await interaction
        .update({
          embeds: [
            buildPreflightWarningEmbed({
              guild: interaction.guild,
              payload,
              actions: [...session.actions],
              backupId: session.backupId,
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
    if (getActiveLoadState(interaction.guildId)) {
      await interaction
        .reply({
          content: "C'e gia un backup load in corso in questo server.",
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
    });
    await interaction.message
      .edit({
        embeds: [buildLoadInProgressEmbed(session.backupId)],
        components: buildDisabledComponents(interaction.message?.components),
      })
      .catch(() => {});

    try {
      const stats = await applyBackupToGuild(
        interaction.guild,
        session.backupId,
        [...session.actions],
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
};
