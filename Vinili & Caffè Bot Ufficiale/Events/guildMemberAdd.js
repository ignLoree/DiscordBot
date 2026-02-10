const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { InviteTrack } = require('../Schemas/Community/communitySchemas');
const IDs = require('../Utils/Config/ids');

function toUnix(date) {
    return Math.floor(date.getTime() / 1000);
}

const INVITE_LOG_CHANNEL_ID = IDs.channels.inviteLog;
const THANKS_CHANNEL_ID = IDs.channels.thanks;
const INVITE_REWARD_ROLE_ID = IDs.roles.inviteReward;
const INVITE_EXTRA_ROLE_ID = IDs.roles.mediaBypass || '1468938195348754515';
const INFO_PERKS_CHANNEL_ID = IDs.channels.infoPerks;

async function resolveInviteInfo(member) {
    const guild = member.guild;
    if (!member.client.inviteCache) {
        member.client.inviteCache = new Map();
    }
    const invites = await guild.invites.fetch().catch(() => null);
    const cache = member.client.inviteCache.get(guild.id);
    let usedInvite = null;

    if (invites && cache) {
        for (const invite of invites.values()) {
            const cached = cache.get(invite.code);
            if (cached && typeof invite.uses === 'number' && invite.uses > (cached.uses || 0)) {
                usedInvite = invite;
                break;
            }
        }
    }

    if (invites) {
        const map = new Map();
        for (const invite of invites.values()) {
            map.set(invite.code, {
                uses: invite.uses || 0,
                inviterId: invite.inviter?.id || null
            });
        }
        member.client.inviteCache.set(guild.id, map);
    }

    let vanityCode = guild.vanityURLCode || null;
    if (!usedInvite && !vanityCode && guild.features?.includes('VANITY_URL')) {
        const vanityData = await guild.fetchVanityData().catch(() => null);
        vanityCode = vanityData?.code || null;
    }
    if (!usedInvite && vanityCode) {
        return {
            link: `https://discord.gg/${vanityCode}`,
            inviterTag: 'Vanity URL',
            totalInvites: 0,
            isVanity: true,
            inviterId: null
        };
    }

    const link = usedInvite ? `https://discord.gg/${usedInvite.code}` : 'Link non disponibile';
    const inviterId = usedInvite?.inviter?.id || null;
    const inviterTag = inviterId ? `<@${inviterId}>` : 'Sconosciuto';
    let totalInvites = 0;
    if (invites && inviterId) {
        totalInvites = invites
            .filter(inv => inv.inviter?.id === inviterId)
            .reduce((sum, inv) => sum + (inv.uses || 0), 0);
    }
    return { link, inviterTag, totalInvites, isVanity: false, inviterId };
}

async function trackInviteJoin(member, inviterId) {
    if (!inviterId || inviterId === member.id) return;
    const inviterMember = member.guild.members.cache.get(inviterId)
        || await member.guild.members.fetch(inviterId).catch(() => null);
    if (!inviterMember || inviterMember.user?.bot) return;
    await InviteTrack.findOneAndUpdate(
        { guildId: member.guild.id, userId: member.id },
        {
            $set: {
                inviterId,
                active: true,
                leftAt: null
            },
            $setOnInsert: {
                joinedAt: new Date()
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

async function tryAwardInviteRole(member, inviteInfo) {
    if (!inviteInfo || inviteInfo.isVanity || !inviteInfo.inviterId) return false;
    if ((inviteInfo.totalInvites || 0) < 5) return false;

    const guild = member.guild;
    const inviterMember = guild.members.cache.get(inviteInfo.inviterId)
        || await guild.members.fetch(inviteInfo.inviterId).catch(() => null);
    if (!inviterMember) return false;
    if (inviterMember.user?.bot) return false;
    const rewardRole = guild.roles.cache.get(INVITE_REWARD_ROLE_ID) || await guild.roles.fetch(INVITE_REWARD_ROLE_ID).catch(() => null);
    const extraRole = guild.roles.cache.get(INVITE_EXTRA_ROLE_ID) || await guild.roles.fetch(INVITE_EXTRA_ROLE_ID).catch(() => null);
    if (!rewardRole && !extraRole) return false;

    const me = guild.members.me;
    if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return false;
    const rolesToAdd = [];
    if (rewardRole && !inviterMember.roles.cache.has(rewardRole.id) && rewardRole.position < me.roles.highest.position) {
        rolesToAdd.push(rewardRole.id);
    }
    if (extraRole && !inviterMember.roles.cache.has(extraRole.id) && extraRole.position < me.roles.highest.position) {
        rolesToAdd.push(extraRole.id);
    }
    if (!rolesToAdd.length) return false;
    await inviterMember.roles.add(rolesToAdd).catch(() => {});
    return true;
}

async function addBotRoles(member) {
    const roleIds = [IDs.roles.autoAssignBotRole];
    const me = member.guild.members.me;

    if (!me) {
        global.logger.warn('[guildMemberAdd] Bot member not cached; cannot add bot roles.');
        return;
    }

    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        global.logger.warn('[guildMemberAdd] Missing Manage Roles permission; cannot add bot roles.');
        return;
    }

    const roles = roleIds
        .map(id => member.guild.roles.cache.get(id))
        .filter(Boolean);

    const missingRoles = roleIds.filter(id => !member.guild.roles.cache.has(id));
    if (missingRoles.length) {
        global.logger.warn('[guildMemberAdd] Some bot roles not found:', missingRoles);
    }

    if (!roles.length) return;

    const highestBotRole = me.roles.highest;
    const blocked = roles.filter(role => role.position >= highestBotRole.position);
    if (blocked.length) {
        global.logger.warn(
            '[guildMemberAdd] Bot role hierarchy prevents adding roles:',
            blocked.map(role => role.id)
        );
        return;
    }

    await member.roles.add(roles);
}

module.exports = {
    name: "guildMemberAdd",
    async execute(member) {
        try {
            if (member.user?.bot) {
                try {
                    await addBotRoles(member);
                } catch (error) {
                    global.logger.error('[guildMemberAdd] Failed to add bot roles:', error);
                }
                const channelwelcome = member.guild.channels.cache.get(IDs.channels.inviteLog);
                if (channelwelcome) {
                    const botEmbed = new EmbedBuilder()
                        .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL({ size: 128 }) })
                        .setTitle(`<a:VC_HeartsPink:1468685897389052008> Benvenuto/a su Vinili & Caffè <a:VC_HeartsPink:1468685897389052008>`)
                        .setDescription(`__${member.displayName}__ benvenuto/a nella nostra community <a:VC_Sparkles:1468546911936974889>\nPassa su <#1469429150669602961> per **abbellire il tuo profilo** con i ruoli & colori.`)
                        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                        .setImage(`https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db`)
                        .setColor('#6f4e37')
                        .setFooter({ text: `🚀 Ora siamo in ${member.guild.memberCount} ?` });

                    await channelwelcome.send({ content: `Ciao ${member.user}, benvenuto/a! <@&${IDs.roles.staff}> <a:VC_HeartOrange:1448673443762405386>`, embeds: [botEmbed] }).catch(() => { });
                }
                const inviteChannel = member.guild.channels.cache.get(INVITE_LOG_CHANNEL_ID);
                if (inviteChannel) {
                    try {
                        const info = await resolveInviteInfo(member);
                        if (info.isVanity) {
                            await inviteChannel.send({
                                content: `<:VC_Reply:1468262952934314131> Bot entrato tramite vanity **.gg/viniliecaffe**`
                            }).catch(() => { });
                        } else {
                            await inviteChannel.send({
                                content: `<:VC_Reply:1468262952934314131> Bot entrato con il link <${info.link}>,\n-# ? <a:VC_Arrow:1448672967721615452> __invitato da__ ${info.inviterTag} che ora ha **${info.totalInvites} inviti**.`
                            }).catch(() => { });
                        }
                    } catch {
                    }
                }
                return;
            }
            const minimumAgeDays = 3;
            const minAgeMs = minimumAgeDays * 24 * 60 * 60 * 1000;
            const accountAgeMs = Date.now() - member.user.createdAt.getTime();
            if (accountAgeMs < minAgeMs) {
                const logChannel = member.guild.channels.cache.get(IDs.channels.antiRaidLog);
                const createdTs = toUnix(member.user.createdAt);
                const nowTs = Math.floor(Date.now() / 1000);
                const dmEmbed = new EmbedBuilder()
                    .setTitle(`You have been kicked! in ${member.guild.name}!`)
                    .setColor('#6f4e37')
                    .setDescription(
                        [
                            `<:profile:1461732907508039834> **Member:** ${member?.displayName || member?.user?.username} [${member.user.id}]`,
                            `<:rightSort:1461726104422453298> **Reason:** Account is too young to be allowed.`,
                            `<:space:1461733157840621608><:rightSort:1461726104422453298> **Accounts Age:** <t:${createdTs}:R>.`,
                            `<:space:1461733157840621608><:rightSort:1461726104422453298> **Minimum Age:** \`${minimumAgeDays}\` days.`
                        ].join("\n")
                    );
                let dmSent = false;
                try {
                    await member.send({ embeds: [dmEmbed] });
                    dmSent = true;
                } catch {
                    dmSent = false;
                }
                let punished = false;
                try {
                    await member.kick("Account is too young to be allowed.");
                    punished = true;
                } catch {
                    punished = false;
                }
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#6f4e37')
                        .setTitle(`**${member.user.username} has been kicked!!**`)
                        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                        .setDescription(
                            [
                                `<:profile:1461732907508039834> **Member:** ${member?.displayName || member?.user?.username} **[${member.user.id}]**`,
                                `<:rightSort:1461726104422453298> **Reason:** Account is too young to be allowed.`,
                                `<:space:1461733157840621608><:rightSort:1461726104422453298> **Accounts Age:** <t:${createdTs}:R>.`,
                                `<:space:1461733157840621608><:rightSort:1461726104422453298> **Minimum Age:** \`${minimumAgeDays} days\`.`,
                                "",
                                "**More Details:**",
                                `<:noDM:1463645183840354517> **Member Direct Messaged?** ${dmSent ? "<:success:1461731530333229226>" : "<:cancel:1461730653677551691>"}`,
                                `<:space:1461733157840621608><:rightSort:1461726104422453298>**\`Dmng disabled.\`**`,
                                `<:kick:1463645181965242581> **Member Punished?** ${punished ? "<:success:1461731530333229226>" : "<:cancel:1461730653677551691>"}`
                            ].join("\n")
                        );
                    const actionEmbed = new EmbedBuilder()
                        .setColor('#6f4e37')
                        .setTitle("Member Kick")
                        .setDescription(
                            [
                                `<:rightSort:1461726104422453298> **Responsible:** <@${member.client.user.id}> / ${member.client.user.id}`,
                                `<:rightSort:1461726104422453298> **Target:** ${member.user} / ${member.user.id}`,
                                `<:rightSort:1461726104422453298> **Date:** <t:${nowTs}:F>`,
                                `<:rightSort:1461726104422453298> **Reason:** Account is too young to be allowed.`
                            ].join("\n")
                        );
                    await logChannel.send({ embeds: [logEmbed, actionEmbed] });
                }
                return;
            }
            const channelwelcome = member.guild.channels.cache.get(IDs.channels.inviteLog);
            if (!channelwelcome) {
                global.logger.info("[guildMemberAdd] Welcome channel not found.");
            }

            const totalvoicechannel = member.guild.channels.cache.get(IDs.channels.totalVoiceCounter);
            if (!totalvoicechannel) return;

            const totalmembers = `${member.guild.memberCount}`;
            await totalvoicechannel.setName(`༄☕︲ User: ${totalmembers}`).catch(() => { });

            const userEmbed = new EmbedBuilder()
                .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL({ size: 128 }) })
                .setTitle(`<a:VC_HeartsPink:1468685897389052008> Benvenuto/a su Vinili & Caffè <a:VC_HeartsPink:1468685897389052008>`)
                .setDescription(`__${member.displayName}__ benvenuto/a nella nostra community <a:VC_Sparkles:1468546911936974889>\nPassa su <#1469429150669602961> per **abbellire il tuo profilo** con i ruoli & colori.`)
                .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                .setImage(`https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db`)
                .setColor('#6f4e37')
                .setFooter({ text: `🚀 Ora siamo in ${member.guild.memberCount} ?` });
            if (channelwelcome) {
                await channelwelcome.send({ content: `Ciao ${member.user}, benvenuto/a! <@&${IDs.roles.staff}> <a:VC_HeartOrange:1448673443762405386>`, embeds: [userEmbed] }).catch(() => { });
            }

            const info = await resolveInviteInfo(member).catch(() => null);
            if (info && !info.isVanity && info.inviterId) {
                await trackInviteJoin(member, info.inviterId).catch(() => { });
            }
            const inviteChannel = member.guild.channels.cache.get(THANKS_CHANNEL_ID);
            const awarded = await tryAwardInviteRole(member, info).catch(() => false);
            if (inviteChannel && awarded && info?.inviterId) {
                const rewardEmbed = new EmbedBuilder()
                    .setColor('#6f4e37')
                    .setTitle('<a:ThankYou:1329504268369002507> Grazie per gli inviti!')
                    .setDescription(
                        `<@${info.inviterId}> hai fatto entrare almeno **5 persone** e hai ottenuto i ruoli <@&${INVITE_REWARD_ROLE_ID}> + <@&${INVITE_EXTRA_ROLE_ID}>.\n` +
                        `<a:Boost_Cycle:1329504283007385642> Controlla <#${INFO_PERKS_CHANNEL_ID}> per i nuovi vantaggi.`
                    );
                await inviteChannel.send({ embeds: [rewardEmbed] }).catch(() => {});
            }
            if (inviteChannel && info) {
                if (info.isVanity) {
                    await channelwelcome.send({
                        content: `<:VC_Reply:1468262952934314131> L'utente ha usato il link vanity **.gg/viniliecaffe**`
                    }).catch(() => { });
                    return;
                }
                await channelwelcome.send({
                    content: `<:VC_Reply:1468262952934314131> è entratx con il link <${info.link}>,\n-# ? <a:VC_Arrow:1448672967721615452> __invitato da__ ${info.inviterTag} che ora ha **${info.totalInvites} inviti**.`
                }).catch(() => { });
            }
        } catch (error) {
            global.logger.error(error);
        }
    }
};


