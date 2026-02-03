const { EmbedBuilder, PermissionsBitField, ActivityType } = require('discord.js');
const { text } = require('express');

const ROLE_ID = '1442568948271943721';
const CHANNEL_ID = '1442569123426074736';
const INVITE_REGEX = /(?:discord\.gg|\.gg)\/viniliecaffe/i;
const statusCache = new Map();

function getCustomStatus(presence) {
    if (!presence?.activities?.length) return '';
    const custom = presence.activities.find((activity) => activity.type === ActivityType.Custom);
    return (custom?.state || '').toString();
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

module.exports = {
    name: 'presenceUpdate',
    async execute(oldPresence, newPresence) {
        try {
            const member = newPresence?.member || oldPresence?.member;
            if (!member || member.user?.bot) return;

            const userId = member.id;
            const prev = statusCache.get(userId);
            const prevHas = typeof prev?.hasLink === 'boolean' ? prev.hasLink : hasInvite(oldPresence);
            const newHas = hasInvite(newPresence);
            const isOffline = !newPresence || ['offline', 'invisible'].includes(newPresence.status);

            if (isOffline) {
                if (!statusCache.has(userId)) {
                    statusCache.set(userId, { hasLink: prevHas, lastAnnounced: prev?.lastAnnounced || 0 });
                }
                return;
            }

            if (!prevHas && newHas) {
                const roleAdded = await addRoleIfPossible(member);
                if (roleAdded) {
                    const channel = member.guild.channels.cache.get(CHANNEL_ID);
                    if (channel) {
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
                                '<a:VC_Coffe:1448695567244066827> • \`x2\` di multi in **vocale** e **testuale**',
                                '<a:VC_Infinity:1448687797266288832> • Inviare **media** in __ogni chat__',
                                '<a:VC_HeartWhite:1448673535253024860> • Mandare **adesivi** __esterni__ in **qualsiasi chat**',
                                '',
                                '<a:VC_Arrow:1448672967721615452> Metti \`.gg/viniliecaffe\` o \`discord.gg/viniliecaffe\` nel tuo status_!☆_',
                            ].join('\n'))
                            .setFooter({ text: '☕ Grazie per il tuo supporto!'})
                        await channel.send({ content: `<@${member.id}>`, embeds: [embed] });
                    }
                    statusCache.set(userId, { hasLink: true, lastAnnounced: Date.now() });
                    return;
                }
            }

            if (prevHas && !newHas) {
                await removeRoleIfPossible(member);
                statusCache.set(userId, { hasLink: false, lastAnnounced: prev?.lastAnnounced || 0 });
                return;
            }

            statusCache.set(userId, { hasLink: newHas, lastAnnounced: prev?.lastAnnounced || 0 });
        } catch (error) {
            global.logger.error(error);
        }
    }
};
