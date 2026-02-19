const {
  EmbedBuilder,
  PermissionsBitField,
  ActivityType,
} = require("discord.js");
const mongoose = require("mongoose");
const SupporterStatus = require("../Schemas/Supporter/supporterStatusSchema");
const IDs = require("../Utils/Config/ids");

const ROLE_ID = IDs.roles.Supporter;
const PERK_ROLE_ID = IDs.roles.PicPerms;
const CHANNEL_ID = IDs.channels.supporters;
const INVITE_REGEX = /(?:discord\.gg|\.gg)\/viniliecaffe/i;

const statusCache = new Map();
const pendingChecks = new Map();
const removalChecks = new Map();
const bootstrappedUsers = new Set();

const PENDING_MS = 3 * 60 * 1000;
const CLEANUP_MS = 60 * 1000;
const LINK_WARMUP_MS = 2 * 60 * 1000;
const REMOVE_CONFIRM_MS = 2 * 60 * 1000;
const ANNOUNCE_COOLDOWN_MS = 30 * 60 * 1000;

let cleanupInterval = null;
let bootstrapRan = false;
const cleanupIntervalsByGuild = new Map();

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

function getCustomStatus(presence) {
  if (!presence?.activities?.length) return "";
  const custom = presence.activities.find(
    (activity) => activity.type === ActivityType.Custom,
  );
  return String(custom?.state || "");
}

function hasCustomActivity(presence) {
  if (!presence?.activities?.length) return false;
  return presence.activities.some(
    (activity) => activity.type === ActivityType.Custom,
  );
}

function hasInvite(presence) {
  const status = getCustomStatus(presence).toLowerCase();
  return INVITE_REGEX.test(status);
}

function getInviteState(presence) {
  if (!presence) return null;
  if (!hasCustomActivity(presence)) return null;
  return hasInvite(presence);
}

function resolveInviteState(presence, fallback = false) {
  const inviteState = getInviteState(presence);
  if (inviteState === null) return Boolean(fallback);
  return inviteState;
}

function isOfflinePresence(presence) {
  return !presence || ["offline", "invisible"].includes(presence.status);
}

function withDefaultState(prev = {}) {
  return {
    hasLink: Boolean(prev.hasLink),
    lastAnnounced: prev.lastAnnounced || 0,
    lastMessageId: prev.lastMessageId || null,
    lastSeenOnlineAt: prev.lastSeenOnlineAt || 0,
  };
}

function canManageRoles(member) {
  const me = member.guild.members.me;
  if (!me) return false;
  return me.permissions.has(PermissionsBitField.Flags.ManageRoles);
}

async function addRoleIfPossible(member) {
  if (!ROLE_ID) return false;
  const me = member.guild.members.me;
  if (!me) {
    global.logger.warn(
      "[presenceUpdate] Bot member not cached; cannot add supporter role.",
    );
    return false;
  }
  if (!canManageRoles(member)) {
    global.logger.warn(
      "[presenceUpdate] Missing Manage Roles permission; cannot add supporter role.",
    );
    return false;
  }

  const role = member.guild.roles.cache.get(ROLE_ID);
  if (!role) {
    global.logger.warn("[presenceUpdate] Supporter role not found:", ROLE_ID);
    return false;
  }
  if (role.position >= me.roles.highest.position) {
    global.logger.warn(
      "[presenceUpdate] Bot role hierarchy prevents adding supporter role:",
      ROLE_ID,
    );
    return false;
  }
  if (member.roles.cache.has(ROLE_ID)) return false;

  await member.roles.add(role);
  return true;
}

async function addPerkRoleIfPossible(member) {
  if (!PERK_ROLE_ID) return false;
  const me = member.guild.members.me;
  if (!me) return false;
  if (!canManageRoles(member)) return false;

  const role = member.guild.roles.cache.get(PERK_ROLE_ID);
  if (!role) return false;
  if (role.position >= me.roles.highest.position) return false;
  if (member.roles.cache.has(PERK_ROLE_ID)) return false;

  await member.roles.add(role).catch(() => {});
  return true;
}

async function removeRoleIfPossible(member) {
  if (!ROLE_ID) return false;
  const me = member.guild.members.me;
  if (!me) {
    global.logger.warn(
      "[presenceUpdate] Bot member not cached; cannot remove supporter role.",
    );
    return false;
  }
  if (!canManageRoles(member)) {
    global.logger.warn(
      "[presenceUpdate] Missing Manage Roles permission; cannot remove supporter role.",
    );
    return false;
  }

  const role = member.guild.roles.cache.get(ROLE_ID);
  if (!role) {
    global.logger.warn("[presenceUpdate] Supporter role not found:", ROLE_ID);
    return false;
  }
  if (role.position >= me.roles.highest.position) {
    global.logger.warn(
      "[presenceUpdate] Bot role hierarchy prevents removing supporter role:",
      ROLE_ID,
    );
    return false;
  }
  if (!member.roles.cache.has(ROLE_ID)) return false;

  await member.roles.remove(role);
  return true;
}

function hasInviteNow(member) {
  return getInviteState(member.presence);
}

function recentlyOnline(info) {
  if (!info?.lastSeenOnlineAt) return false;
  return Date.now() - info.lastSeenOnlineAt < LINK_WARMUP_MS;
}

async function hasSupporterRole(member) {
  if (member.roles?.cache?.has(ROLE_ID)) return true;
  const fresh = await member.guild.members.fetch(member.id).catch(() => null);
  return fresh?.roles?.cache?.has(ROLE_ID) || false;
}

async function clearPending(userId, channel) {
  const pending = pendingChecks.get(userId);
  if (!pending) return;

  if (pending.timeout) clearTimeout(pending.timeout);
  if (pending.messageId && channel?.isTextBased?.()) {
    await channel.messages.delete(pending.messageId).catch(() => {});
  }
  pendingChecks.delete(userId);
}

async function resolveSupportersChannel(guild) {
  if (!guild || !CHANNEL_ID) return null;
  return (
    guild.channels.cache.get(CHANNEL_ID) ||
    (await guild.channels.fetch(CHANNEL_ID).catch(() => null))
  );
}

async function refreshMember(guild, userId) {
  if (!guild || !userId) return null;
  return (
    guild.members.cache.get(userId) ||
    (await guild.members.fetch(userId).catch(() => null))
  );
}

function scheduleRemovalConfirm(member, channel) {
  const userId = member.id;
  if (removalChecks.has(userId)) return;

  const timeout = setTimeout(async () => {
    removalChecks.delete(userId);

    const freshMember = await refreshMember(member.guild, userId);
    if (!freshMember) return;
    const liveChannel = channel?.isTextBased?.()
      ? channel
      : await resolveSupportersChannel(member.guild);

    const stillHasInvite = hasInviteNow(freshMember);
    if (stillHasInvite !== false) return;

    await removeRoleIfPossible(freshMember);
    try {
      await freshMember.send(
        "Hai rimosso il link dallo status: hai perso i tuoi perks. Per riaverli, rimetti il link nel tuo status.",
      );
    } catch { }

    const info = statusCache.get(userId);
    if (info?.lastMessageId && liveChannel?.isTextBased?.()) {
      await liveChannel.messages.delete(info.lastMessageId).catch(() => {});
    }

    statusCache.set(userId, {
      hasLink: false,
      lastAnnounced: info?.lastAnnounced || 0,
      lastMessageId: null,
      lastSeenOnlineAt: info?.lastSeenOnlineAt || 0,
    });
    await clearPersistedStatus(freshMember.guild.id, userId);
  }, REMOVE_CONFIRM_MS);

  removalChecks.set(userId, { timeout });
}

async function persistStatus(guildId, userId, payload) {
  if (!isDbReady()) return;
  try {
    await SupporterStatus.updateOne(
      { guildId, userId },
      { $set: payload, $setOnInsert: { guildId, userId } },
      { upsert: true },
    );
  } catch (error) {
    global.logger?.error?.("[SUPPORTER STATUS] Persist failed:", error);
  }
}

async function clearPersistedStatus(guildId, userId) {
  if (!isDbReady()) return;
  try {
    await SupporterStatus.deleteOne({ guildId, userId });
  } catch (error) {
    global.logger?.error?.("[SUPPORTER STATUS] Delete failed:", error);
  }
}

async function getPersistedStatus(guildId, userId) {
  if (!isDbReady() || !guildId || !userId) return null;
  try {
    return await SupporterStatus.findOne({ guildId, userId }).lean();
  } catch {
    return null;
  }
}

function buildPendingEmbed(member) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: member.user.username,
      iconURL: member.user.displayAvatarURL({ size: 256 }),
    })
    .setTitle("Nuovx sostenitore <a:VC_StarPink:1330194976440848500>")
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setDescription(
      [
        `<@${member.id}>, \`hai sbloccato:\``,
        `<:VC_Reply:1468262952934314131> Il ruolo <@&${ROLE_ID}> ti verra dato entro **3 minuti** dal bot!`,
        "<a:VC_Coffe:1448695567244066827> - `x2` di multi in **vocale** e **testuale**",
        "<a:VC_Infinity:1448687797266288832> - Inviare **media** in __ogni chat__",
        "<a:VC_HeartWhite:1448673535253024860> - Mandare **adesivi** __esterni__ in **qualsiasi chat**",
        "",
        "<a:VC_Arrow:1448672967721615452> Metti \`.gg/viniliecaffe\` o \`discord.gg/viniliecaffe\` nel tuo status .",
      ].join("\n"),
    )
    .setFooter({ text: "Grazie per il tuo supporto!" });
}

async function startPendingFlow(member, channel) {
  if (pendingChecks.has(member.id)) return;

  const existing = statusCache.get(member.id);
  if (existing?.lastMessageId && channel?.isTextBased?.()) {
    await channel.messages.delete(existing.lastMessageId).catch(() => {});
  }

  pendingChecks.set(member.id, {
    timeout: null,
    messageId: null,
    inFlight: true,
  });
  const sent = await channel
    .send({
    content: `<@${member.id}>`,
      embeds: [buildPendingEmbed(member)],
    })
    .catch(() => null);

  if (sent) {
    const timeout = setTimeout(async () => {
      const freshMember = await refreshMember(member.guild, member.id);
      if (!freshMember) {
        pendingChecks.delete(member.id);
        return;
      }
      const liveChannel = await resolveSupportersChannel(member.guild);
      const stillHasInvite = hasInviteNow(freshMember);
      if (stillHasInvite === false) {
        if (liveChannel?.isTextBased?.()) {
          await liveChannel.messages.delete(sent.id).catch(() => {});
        }
        pendingChecks.delete(member.id);
        statusCache.set(member.id, {
          hasLink: false,
          lastAnnounced: statusCache.get(member.id)?.lastAnnounced || 0,
          lastMessageId: null,
          lastSeenOnlineAt: statusCache.get(member.id)?.lastSeenOnlineAt || 0,
        });
        return;
      }

      await addRoleIfPossible(freshMember);
      pendingChecks.delete(member.id);
    }, PENDING_MS);

    pendingChecks.set(member.id, {
      timeout,
      messageId: sent.id,
      inFlight: false,
    });
  } else {
    pendingChecks.delete(member.id);
  }

  statusCache.set(member.id, {
    hasLink: true,
    lastAnnounced: Date.now(),
    lastMessageId: sent?.id || null,
    lastSeenOnlineAt: statusCache.get(member.id)?.lastSeenOnlineAt || Date.now(),
  });
  await persistStatus(member.guild.id, member.id, {
    hasLink: true,
    lastMessageId: sent?.id || null,
    lastSentAt: new Date(),
  });
}

async function bootstrapSupporter(client) {
  if (bootstrapRan) return;
  bootstrapRan = true;

  for (const guild of client.guilds.cache.values()) {
    const channel = await resolveSupportersChannel(guild);
    if (!channel) continue;

    let persisted = [];
    if (isDbReady()) {
      try {
        persisted = await SupporterStatus.find({ guildId: guild.id }).lean();
      } catch {
        persisted = [];
      }
    }

    for (const doc of persisted) {
      if (!doc?.userId) continue;
      bootstrappedUsers.add(doc.userId);
      statusCache.set(doc.userId, {
        hasLink: Boolean(doc.hasLink),
        lastAnnounced: doc.lastSentAt ? new Date(doc.lastSentAt).getTime() : 0,
        lastMessageId: doc.lastMessageId || null,
        lastSeenOnlineAt: 0,
      });
    }

    await guild.members.fetch({ withPresences: true }).catch(() => null);
    for (const member of guild.members.cache.values()) {
      if (member.user?.bot) continue;
      if (isOfflinePresence(member.presence)) continue;
      if (!hasInvite(member.presence)) continue;
      if (member.roles.cache.has(ROLE_ID)) continue;
      if (pendingChecks.has(member.id)) continue;

      const existing = statusCache.get(member.id);
      if (existing?.lastMessageId) continue;
      if (bootstrappedUsers.has(member.id)) continue;

      await startPendingFlow(member, channel);
    }
  }
}

function startCleanupClock(client, guildId) {
  if (!client || !guildId) return;
  if (cleanupIntervalsByGuild.has(guildId)) return;

  const interval = setInterval(async () => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const channel = await resolveSupportersChannel(guild);

    for (const [userId, info] of statusCache.entries()) {
      const shouldCheck = info?.hasLink || info?.lastMessageId;
      if (!shouldCheck) continue;

      const member =
        guild.members.cache.get(userId) ||
        (await guild.members.fetch(userId).catch(() => null));
      if (!member) continue;
      if (isOfflinePresence(member.presence)) continue;
      if (pendingChecks.has(userId)) continue;

      const hasLink = hasInviteNow(member);
      if (hasLink === false) {
        if (recentlyOnline(info)) continue;
        await clearPending(userId, channel);
        scheduleRemovalConfirm(member, channel);
      }
    }
  }, CLEANUP_MS);
  cleanupIntervalsByGuild.set(guildId, interval);
}

async function applyOnlineState(member, userId, prev, prevHas) {
  const newHas = resolveInviteState(member.presence, prevHas);
  const lastSeenOnlineAt = Date.now();

  if (newHas && member.roles.cache.has(ROLE_ID)) {
    statusCache.set(userId, {
      hasLink: true,
      lastAnnounced: prev?.lastAnnounced || 0,
      lastMessageId: prev?.lastMessageId || null,
      lastSeenOnlineAt,
    });
    await persistStatus(member.guild.id, userId, {
      hasLink: true,
      lastMessageId: prev?.lastMessageId || null,
    });
    await addPerkRoleIfPossible(member);
    return;
  }

  if (newHas && (await hasSupporterRole(member))) {
    statusCache.set(userId, {
      hasLink: true,
      lastAnnounced: prev?.lastAnnounced || 0,
      lastMessageId: prev?.lastMessageId || null,
      lastSeenOnlineAt,
    });
    await persistStatus(member.guild.id, userId, {
      hasLink: true,
      lastMessageId: prev?.lastMessageId || null,
    });
    await addPerkRoleIfPossible(member);
    return;
  }

  if (!prevHas && newHas) {
    if (pendingChecks.has(userId)) return;
    if (prev?.lastMessageId) return;
    if (
      prev?.lastAnnounced &&
      Date.now() - prev.lastAnnounced < ANNOUNCE_COOLDOWN_MS
    )
      return;

    if (await hasSupporterRole(member)) {
      statusCache.set(userId, {
        hasLink: true,
        lastAnnounced: prev?.lastAnnounced || 0,
        lastSeenOnlineAt,
      });
      await persistStatus(member.guild.id, userId, { hasLink: true });
      await addPerkRoleIfPossible(member);
      return;
    }

    statusCache.set(userId, {
      hasLink: true,
      lastAnnounced: Date.now(),
      lastMessageId: prev?.lastMessageId || null,
      lastSeenOnlineAt,
    });

    const channel = await resolveSupportersChannel(member.guild);
    if (!channel) return;
    await startPendingFlow(member, channel);
    await addPerkRoleIfPossible(member);
    return;
  }

  if (prevHas && !newHas) {
    const channel = await resolveSupportersChannel(member.guild);
    await clearPending(userId, channel);

    statusCache.set(userId, {
      hasLink: false,
      lastAnnounced: prev?.lastAnnounced || 0,
      lastMessageId: prev?.lastMessageId || null,
      lastSeenOnlineAt,
    });
    await persistStatus(member.guild.id, userId, {
      hasLink: false,
      lastMessageId: prev?.lastMessageId || null,
    });
    scheduleRemovalConfirm(member, channel);
    return;
  }

  statusCache.set(userId, {
    hasLink: newHas,
    lastAnnounced: prev?.lastAnnounced || 0,
    lastMessageId: prev?.lastMessageId || null,
    lastSeenOnlineAt,
  });
  await persistStatus(member.guild.id, userId, {
    hasLink: newHas,
    lastMessageId: prev?.lastMessageId || null,
  });
}

module.exports = {
  name: "presenceUpdate",
  async execute(oldPresence, newPresence) {
    try {
      const member = newPresence?.member || oldPresence?.member;
      if (!member || member.user?.bot) return;

      startCleanupClock(member.client, member.guild.id);

      const userId = member.id;
      let prev = statusCache.get(userId);
      if (!prev) {
        const persisted = await getPersistedStatus(member.guild.id, userId);
        if (persisted) {
          prev = {
            hasLink: Boolean(persisted.hasLink),
            lastAnnounced: persisted.lastSentAt
              ? new Date(persisted.lastSentAt).getTime()
              : 0,
            lastMessageId: persisted.lastMessageId || null,
            lastSeenOnlineAt: 0,
          };
          statusCache.set(userId, prev);
        }
      }

      const prevHas =
        typeof prev?.hasLink === "boolean"
          ? prev.hasLink
          : resolveInviteState(oldPresence, false);

      if (isOfflinePresence(newPresence)) {
        if (!statusCache.has(userId)) {
          statusCache.set(
            userId,
            withDefaultState({
              hasLink: prevHas,
              lastAnnounced: prev?.lastAnnounced,
              lastSeenOnlineAt: prev?.lastSeenOnlineAt,
            }),
          );
        }
        return;
      }

      await applyOnlineState(member, userId, prev, prevHas);
    } catch (error) {
      global.logger?.error?.("[presenceUpdate] failed:", error);
    }
  },
  bootstrapSupporter,
};
