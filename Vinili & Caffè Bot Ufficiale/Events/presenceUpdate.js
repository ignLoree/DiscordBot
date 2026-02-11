const { EmbedBuilder, PermissionsBitField, ActivityType } = require('discord.js');
const mongoose = require('mongoose');
const SupporterStatus = require('../Schemas/Supporter/supporterStatusSchema');
const IDs = require('../Utils/Config/ids');

const ROLE_ID = IDs.roles.Supporter;
const PERK_ROLE_ID = IDs.roles.PicPerms;
const CHANNEL_ID = IDs.channels.suppporters;
const INVITE_REGEX = /(?:discord\.gg|\.gg)\/viniliecaffe/i;
const statusCache = new Map();
const pendingChecks = new Map();
const removalChecks = new Map();
const PENDING_MS = 3 * 60 * 1000;
const CLEANUP_MS = 60 * 1000;
const LINK_WARMUP_MS = 2 * 60 * 1000;
const REMOVE_CONFIRM_MS = 2 * 60 * 1000;
let cleanupInterval = null;
let bootstrapRan = false;
const bootstrappedUsers = new Set();

function isDbReady() {
    return mongoose.connection?.readyState === 1;
}

function getCustomStatus(presence) {
    if (!presence?.activities?.length) return '';
    const custom = presence.activities.find((activity) => activity.type === ActivityType.Custom);
    return (custom?.state || '').toString();
}

function hasCustomActivity(presence) {
    if (!presence?.activities?.length) return false;
    return presence.activities.some((activity) => activity.type === ActivityType.Custom);
}

function hasInvite(presence) {
    const status = getCustomStatus(presence).toLowerCase();
    return INVITE_REGEX.test(status);
}

async function addRoleIfPossible(member) {
    const me = member.guild.members.me;
    if (!me) {
        global.logger.warn('[presenceUpdate] Bot member not cached; cannot add supporter role.');
        return false;
    }
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        global.logger.warn('[presenceUpdate] Missing Manage Roles permission; cannot add supporter role.');
        return false;
    }
    const role = member.guild.roles.cache.get(ROLE_ID);
    if (!role) {
        global.logger.warn('[presenceUpdate] Supporter role not found:', ROLE_ID);
        return false;
    }
    if (role.position >= me.roles.highest.position) {
        global.logger.warn('[presenceUpdate] Bot role hierarchy prevents adding supporter role:', ROLE_ID);
        return false;
    }
    if (member.roles.cache.has(ROLE_ID)) return false;
    await member.roles.add(role);
    return true;
}

async function addPerkRoleIfPossible(member) {
    const me = member.guild.members.me;
    if (!me) return false;
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return false;
    const role = member.guild.roles.cache.get(PERK_ROLE_ID);
    if (!role) return false;
    if (role.position >= me.roles.highest.position) return false;
    if (member.roles.cache.has(PERK_ROLE_ID)) return false;
    await member.roles.add(role).catch(() => {});
    return true;
}

async function removeRoleIfPossible(member) {
    const me = member.guild.members.me;
    if (!me) {
        global.logger.warn('[presenceUpdate] Bot member not cached; cannot remove supporter role.');
        return false;
    }
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        global.logger.warn('[presenceUpdate] Missing Manage Roles permission; cannot remove supporter role.');
        return false;
    }
    const role = member.guild.roles.cache.get(ROLE_ID);
    if (!role) {
        global.logger.warn('[presenceUpdate] Supporter role not found:', ROLE_ID);
        return false;
    }
    if (role.position >= me.roles.highest.position) {
        global.logger.warn('[presenceUpdate] Bot role hierarchy prevents removing supporter role:', ROLE_ID);
        return false;
    }
    if (!member.roles.cache.has(ROLE_ID)) return false;
    await member.roles.remove(role);
    return true;
}

function hasInviteNow(member, userId) {
    void userId;
    return hasInvite(member.presence);
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
    if (pending.messageId && channel) {
        await channel.messages.delete(pending.messageId).catch(() => {});
    }
    pendingChecks.delete(userId);
}

function scheduleRemovalConfirm(member, channel) {
    const userId = member.id;
    if (removalChecks.has(userId)) return;
    const timeout = setTimeout(async () => {
        removalChecks.delete(userId);
        const stillHas = hasInviteNow(member, userId);
        if (stillHas) return;
        await removeRoleIfPossible(member);
        try {
            await member.send("Hai rimosso il link dallo status: hai perso i tuoi perks. Per riaverli, rimetti il link nel tuo status.");
        } catch {}
        const info = statusCache.get(userId);
        if (info?.lastMessageId && channel) {
            await channel.messages.delete(info.lastMessageId).catch(() => {});
        }
        statusCache.set(userId, { hasLink: false, lastAnnounced: info?.lastAnnounced || 0, lastMessageId: null, lastSeenOnlineAt: info?.lastSeenOnlineAt || 0 });
        await clearPersistedStatus(member.guild.id, userId);
    }, REMOVE_CONFIRM_MS);
    removalChecks.set(userId, { timeout });
}

async function persistStatus(guildId, userId, payload) {
    if (!isDbReady()) return;
    try {
        await SupporterStatus.updateOne(
            { guildId, userId },
            { $set: payload, $setOnInsert: { guildId, userId } },
            { upsert: true }
        );
    } catch (error) {
        global.logger.error('[SUPPORTER STATUS] Persist failed:', error);
    }
}

async function clearPersistedStatus(guildId, userId) {
    if (!isDbReady()) return;
    try {
        await SupporterStatus.deleteOne({ guildId, userId });
    } catch (error) {
        global.logger.error('[SUPPORTER STATUS] Delete failed:', error);
    }
}

async function startPendingFlow(member, channel) {
    if (pendingChecks.has(member.id)) return;
    const existing = statusCache.get(member.id);
    if (existing?.lastMessageId && channel) {
        await channel.messages.delete(existing.lastMessageId).catch(() => {});
    }
    pendingChecks.set(member.id, { timeout: null, messageId: null, inFlight: true });
    const embed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setAuthor({
            name: member.user.username,
            iconURL: member.user.displayAvatarURL({ size: 256 })
        })
        .setTitle('Nuovx sostenitore <a:VC_StarPink:1330194976440848500>')
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setDescription([
            `<@${member.id}>, \`hai sbloccato:\``,
            `<:VC_Reply:1468262952934314131> Il ruolo <@&${ROLE_ID}> ti verrà dato entro **3 minuti** dal bot!`,
            '<a:VC_Coffe:1448695567244066827> • `x2` di multi in **vocale** e **testuale**',
            '<a:VC_Infinity:1448687797266288832> • Inviare **media** in __ogni chat__',
            '<a:VC_HeartWhite:1448673535253024860> • Mandare **adesivi** __esterni__ in **qualsiasi chat**',
            '',
            '<a:VC_Arrow:1448672967721615452> Metti \`.gg/viniliecaffe\` o \`discord.gg/viniliecaffe\` nel tuo status .ᐟ ☆',
        ].join('\n'))
        .setFooter({ text: 'Grazie per il tuo supporto!'});

    const sent = await channel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(() => null);
    if (sent) {
        const timeout = setTimeout(async () => {
            const stillHas = hasInviteNow(member, member.id);
            if (!stillHas) {
                await channel.messages.delete(sent.id).catch(() => {});
                pendingChecks.delete(member.id);
                statusCache.set(member.id, { hasLink: false, lastAnnounced: statusCache.get(member.id)?.lastAnnounced || 0, lastMessageId: null });
                return;
            }
            await addRoleIfPossible(member);
            pendingChecks.delete(member.id);
        }, PENDING_MS);
        pendingChecks.set(member.id, { timeout, messageId: sent.id, inFlight: false });
    } else {
        pendingChecks.delete(member.id);
    }

    statusCache.set(member.id, { hasLink: true, lastAnnounced: Date.now(), lastMessageId: sent?.id || null });
    await persistStatus(member.guild.id, member.id, { hasLink: true, lastMessageId: sent?.id || null, lastSentAt: new Date() });
}

async function bootstrapSupporter(client) {
    if (bootstrapRan) return;
    bootstrapRan = true;
    for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.get(CHANNEL_ID);
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
            if (doc?.userId) {
                bootstrappedUsers.add(doc.userId);
                if (doc.lastMessageId) {
                    statusCache.set(doc.userId, {
                        hasLink: Boolean(doc.hasLink),
                        lastAnnounced: doc.lastSentAt ? new Date(doc.lastSentAt).getTime() : 0,
                        lastMessageId: doc.lastMessageId
                    });
                }
            }
        }
        await guild.members.fetch({ withPresences: true }).catch(() => null);
        for (const member of guild.members.cache.values()) {
            if (member.user?.bot) continue;
            if (!member.presence || ['offline', 'invisible'].includes(member.presence.status)) continue;
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
    if (cleanupInterval) return;
    cleanupInterval = setInterval(async () => {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        const channel = guild.channels.cache.get(CHANNEL_ID);
        for (const [userId, info] of statusCache.entries()) {
            const shouldCheck = info?.hasLink || info?.lastMessageId;
            if (!shouldCheck) continue;
            const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
            if (!member) continue;
            if (!member.presence || ['offline', 'invisible'].includes(member.presence.status)) {
                continue;
            }
            const hasLink = hasInviteNow(member, userId);
            if (pendingChecks.has(userId)) {
                continue;
            }
            if (!hasLink) {
                if (recentlyOnline(info)) {
                    continue;
                }
                if (pendingChecks.has(userId)) {
                    await clearPending(userId, channel);
                }
                scheduleRemovalConfirm(member, channel);
            }
        }
    }, CLEANUP_MS);
}

module.exports = {
    name: 'presenceUpdate',
    async execute(oldPresence, newPresence) {
        try {
            const member = newPresence?.member || oldPresence?.member;
            if (!member || member.user?.bot) return;
            startCleanupClock(member.client, member.guild.id);

            const userId = member.id;
            const prev = statusCache.get(userId);
            const prevHas = typeof prev?.hasLink === 'boolean' ? prev.hasLink : hasInvite(oldPresence);
            const newHas = hasInvite(newPresence);
            const isOffline = !newPresence || ['offline', 'invisible'].includes(newPresence.status);
            const wasOffline = !oldPresence || ['offline', 'invisible'].includes(oldPresence.status);

            if (isOffline) {
                if (!statusCache.has(userId)) {
                    statusCache.set(userId, { hasLink: prevHas, lastAnnounced: prev?.lastAnnounced || 0, lastSeenOnlineAt: prev?.lastSeenOnlineAt || 0 });
                }
                return;
            }

            const lastSeenOnlineAt = Date.now();

            if (newHas && member.roles.cache.has(ROLE_ID)) {
                statusCache.set(userId, { hasLink: true, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt });
                await persistStatus(member.guild.id, userId, { hasLink: true, lastMessageId: prev?.lastMessageId || null });
                await addPerkRoleIfPossible(member);
                return;
            }

            if (newHas && await hasSupporterRole(member)) {
                statusCache.set(userId, { hasLink: true, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt });
                await persistStatus(member.guild.id, userId, { hasLink: true, lastMessageId: prev?.lastMessageId || null });
                await addPerkRoleIfPossible(member);
                return;
            }

            if (!prevHas && newHas) {
                if (pendingChecks.has(userId)) return;
                if (prev?.lastMessageId) return;
                if (prev?.lastAnnounced && Date.now() - prev.lastAnnounced < 5000) {
                    return;
                }
                if (prev?.lastMessageId) {
                    statusCache.set(userId, { hasLink: true, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt });
                    await persistStatus(member.guild.id, userId, { hasLink: true, lastMessageId: prev?.lastMessageId || null });
                    return;
                }
                if (await hasSupporterRole(member)) {
                    statusCache.set(userId, { hasLink: true, lastAnnounced: prev?.lastAnnounced || 0, lastSeenOnlineAt });
                    await persistStatus(member.guild.id, userId, { hasLink: true });
                    await addPerkRoleIfPossible(member);
                    return;
                }

                statusCache.set(userId, { hasLink: true, lastAnnounced: Date.now(), lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt });
                const channel = member.guild.channels.cache.get(CHANNEL_ID);
                if (!channel) return;
                await startPendingFlow(member, channel);
                await addPerkRoleIfPossible(member);
                return;
            }

            if (prevHas && !newHas) {
                void wasOffline;
                await clearPending(userId, member.guild.channels.cache.get(CHANNEL_ID));
                const channel = member.guild.channels.cache.get(CHANNEL_ID);
                statusCache.set(userId, {
                    hasLink: false,
                    lastAnnounced: prev?.lastAnnounced || 0,
                    lastMessageId: prev?.lastMessageId || null,
                    lastSeenOnlineAt
                });
                await persistStatus(member.guild.id, userId, {
                    hasLink: false,
                    lastMessageId: prev?.lastMessageId || null
                });
                scheduleRemovalConfirm(member, channel);
                return;
            }

            statusCache.set(userId, { hasLink: newHas, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt });
            await persistStatus(member.guild.id, userId, { hasLink: newHas, lastMessageId: prev?.lastMessageId || null });
        } catch (error) {
            global.logger.error(error);
        }
    }
    ,
    bootstrapSupporter
};
