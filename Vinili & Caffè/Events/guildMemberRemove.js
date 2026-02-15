const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Staff = require('../Schemas/Staff/staffSchema');
const Ticket = require("../Schemas/Ticket/ticketSchema");
const { createTranscript, createTranscriptHtml, saveTranscriptHtml } = require("../Utils/Ticket/transcriptUtils");
const { InviteTrack, ExpUser, ActivityUser, LevelHistory } = require('../Schemas/Community/communitySchemas');
const { MinigameUser } = require('../Schemas/Minigames/minigameSchema');
const IDs = require('../Utils/Config/ids');
const { scheduleStaffListRefresh } = require('../Utils/Community/staffListUtils');
const { queueIdsCatalogSync } = require('../Utils/Config/idsAutoSync');
const { scheduleMemberCounterRefresh } = require('../Utils/Community/memberCounterUtils');
const SponsorMainLeave = require('../Schemas/Tags/tagsSchema');

const STAFF_TRACKED_ROLE_IDS = new Set([
    IDs.roles.PartnerManager,
    IDs.roles.Staff,
    IDs.roles.Helper,
    IDs.roles.Mod,
    IDs.roles.Coordinator,
    IDs.roles.Supervisor,
    IDs.roles.Admin,
    IDs.roles.Manager,
    IDs.roles.CoFounder,
    IDs.roles.Founder
]);

const JOIN_LEAVE_LOG_CHANNEL_ID = IDs.channels.joinLeaveLogs;

const MAIN_GUILD_ID = '1329080093599076474'
const OFFICIAL_INVITE_URL = 'https://discord.gg/viniliecaffe'
const SPONSOR_GUILD_IDS = [
    '1471511676019933354',
    '1471511928739201047',
    '1471512183547498579',
    '1471512555762483330',
    '1471512797140484230',
    '1471512808448458958'
]

function makeRejoinEmbed() {
    return new EmbedBuilder()
        .setColor('#ffb020')
        .setTitle('Rientra nel server principale')
        .setDescription(
            'Hai lasciato il server principale **Vinili & Caffè**.\n\n' +
            'Per mantenere l\'accesso ai server TAGS devi rientrare entro **24 ore**.\n\n' +
            'Clicca il bottone qui sotto per rientrare.'
        )
        .setFooter({ text: 'Se non rientri entro 24h sarai rimosso dal server e perderai la TAG.' });
}

function makeRejoinRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Rientra nel server principale')
            .setURL(OFFICIAL_INVITE_URL)
    );
}

function toUnix(date) {
    return Math.floor(date.getTime() / 1000);
}

async function resolveGuildChannel(guild, channelId) {
    if (!guild || !channelId) return null;
    return guild.channels.cache.get(channelId)
        || await guild.channels.fetch(channelId).catch(() => null);
}

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, client) {
        try {
            if (member?.user?.bot && member?.guild?.id) {
                queueIdsCatalogSync(client, member.guild.id, 'botLeave');
            }
            if (member?.guild?.id === IDs.guilds.main) {
                scheduleStaffListRefresh(client, member.guild.id);
            }

            const joinLeaveLogChannel = await resolveGuildChannel(member.guild, JOIN_LEAVE_LOG_CHANNEL_ID);
            if (joinLeaveLogChannel && !member.user?.bot) {
                const leaveLogEmbed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setTitle('Member Left')
                    .setDescription([
                        `${member.user} ${member.user.tag}`,
                        '',
                        `**User ID:** ${member.user.id}`,
                        `**Left At:** <t:${toUnix(new Date())}:F>`
                    ].join('\n'))
                    .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
                    .setTimestamp();

                await joinLeaveLogChannel.send({ embeds: [leaveLogEmbed] }).catch((err) => {
                    global.logger.error('[guildMemberRemove] Failed to send leave log:', err);
                });
            }

            await InviteTrack.findOneAndUpdate(
                { guildId: member.guild.id, userId: member.id, active: true },
                { $set: { active: false, leftAt: new Date() } }
            ).catch(() => { });

            if (member?.guild?.id === MAIN_GUILD_ID && !member.user?.bot) {
                const userId = member.id;

                const inSomeSponsor = await (async () => {
                    for (const sid of SPONSOR_GUILD_IDS) {
                        const g = member.client.guilds.cache.get(sid);
                        if (!g) continue;
                        const m = await g.members.fetch(userId).catch(() => null);
                        if (m) return true;
                    }
                    return false;
                })();

                if (inSomeSponsor) {
                    const now = new Date();
                    const kickAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

                    await SponsorMainLeave.updateOne(
                        { userId },
                        { $set: { userId, leftAt: now, kickAt, dmSent: false, dmFailed: false } },
                        { upsert: true }
                    ).catch(() => { });

                    const dmOk = await member.user
                        .send({ embeds: [makeRejoinEmbed()], components: [makeRejoinRow()] })
                        .then(() => true)
                        .catch(() => false);

                    await SponsorMainLeave.updateOne(
                        { userId },
                        { $set: dmOk ? { dmSent: true } : { dmFailed: true } }
                    ).catch(() => { });
                }
            }

            const guild = member.guild;
            scheduleMemberCounterRefresh(guild, { delayMs: 300, secondPassMs: 2200 });
            const openTickets = await Ticket.find({ userId: member.id, open: true }).catch(() => []);
            if (openTickets.length > 0) {
                const logChannel = guild.channels.cache.get(IDs.channels.ticketLogs)
                    || await guild.channels.fetch(IDs.channels.ticketLogs).catch(() => null)
                    || guild.channels.cache.get(IDs.channels.serverBotLogs)
                    || await guild.channels.fetch(IDs.channels.serverBotLogs).catch(() => null);
                for (const ticket of openTickets) {
                    const channel = guild.channels.cache.get(ticket.channelId) || await guild.channels.fetch(ticket.channelId).catch(() => null);
                    if (!channel) {
                        await Ticket.updateOne(
                            { _id: ticket._id },
                            { $set: { open: false, closeReason: "Utente uscito dal server", closedAt: new Date() } }
                        ).catch(() => { });
                        continue;
                    }

                    const transcriptTXT = await createTranscript(channel).catch(() => "");
                    const transcriptHTML = await createTranscriptHtml(channel).catch(() => "");
                    const transcriptHtmlPath = transcriptHTML
                        ? await saveTranscriptHtml(channel, transcriptHTML).catch(() => null)
                        : null;
                    ticket.open = false;
                    ticket.transcript = transcriptTXT;
                    ticket.closeReason = "Utente uscito dal server";
                    ticket.closedAt = new Date();
                    await ticket.save().catch(() => { });

                    const createdAtFormatted = ticket.createdAt
                        ? `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>`
                        : "Data non disponibile";
                    if (logChannel) {
                        await logChannel.send({
                            files: transcriptHtmlPath
                                ? [{ attachment: transcriptHtmlPath, name: `transcript_${channel.id}.html` }]
                                : [{
                                    attachment: Buffer.from(transcriptTXT, "utf-8"),
                                    name: `transcript_${channel.id}.txt`
                                }],
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle("Ticket Chiuso")
                                    .setDescription(`
**<:member_role_icon:1330530086792728618> Aperto da:** <@${ticket.userId}>
**<:discordstaff:1443651872258003005> Chiuso da:** ${member.client.user}
**<:Clock:1330530065133338685> Aperto il:** ${createdAtFormatted}
**<a:VC_Verified:1448687631109197978> Claimato da:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Non claimato"}
**<:reportmessage:1443670575376765130> Motivo:** Utente uscito dal server
`)
                                    .setColor("#6f4e37")
                            ]
                        }).catch(() => { });
                    }
                    setTimeout(() => channel.delete().catch(() => { }), 1000);
                }
            }
            const hadTrackedStaffRole = member.roles?.cache
                ? [...STAFF_TRACKED_ROLE_IDS].some((roleId) => member.roles.cache.has(roleId))
                : false;

            if (hadTrackedStaffRole) {
                const resignChannel = guild.channels.cache.get(IDs.channels.pexDepex);
                if (resignChannel) {
                    const highestTrackedRole = member.roles.cache
                        .filter((role) => STAFF_TRACKED_ROLE_IDS.has(role.id))
                        .sort((a, b) => b.position - a.position)
                        .first();
                    const roleLabel = highestTrackedRole?.name || "Staff/PM";
                    const userRole = guild.roles.cache.get(IDs.roles.Member);
                    const userRoleLabel = userRole?.name || "? User";
                    const msg =
                        `**<a:laydowntorest:1444006796661358673> DEPEX** ${member.user}
<:member_role_icon:1330530086792728618> \`${roleLabel}\` <a:vegarightarrow:1443673039156936837> \`${userRoleLabel}\`
<:discordstaff:1443651872258003005> __Dimissioni (Esce dal server)__`;
                    await resignChannel.send({ content: msg }).catch(() => { });
                }

                await Staff.deleteOne({
                    guildId: guild.id,
                    userId: member.id
                }).catch(() => { });
            }
            const mainGuildId = IDs.guilds.main;
            const partnerships = await Staff.find({
                guildId: mainGuildId,
                $or: [
                    { managerId: member.id },
                    { 'partnerActions.managerId': member.id }
                ]
            }).catch(() => []);

            if (partnerships.length > 0) {
                try {
                    const mainGuild = client.guilds.cache.get(mainGuildId) || await client.guilds.fetch(mainGuildId).catch(() => null);
                    if (!mainGuild) return;

                    const partnerLogChannel =
                        mainGuild.channels.cache.get(IDs.channels.partnerLogs)
                        || await mainGuild.channels.fetch(IDs.channels.partnerLogs).catch(() => null);
                    if (partnerLogChannel) {
                        const allWithThisManager = [];
                        for (const doc of partnerships) {
                            const actions = Array.isArray(doc.partnerActions) ? doc.partnerActions : [];
                            for (const action of actions) {
                                if (action?.managerId === member.id) {
                                    const dateMs = action?.date ? new Date(action.date).getTime() : 0;
                                    allWithThisManager.push({ doc, action, dateMs });
                                }
                            }
                        }
                        allWithThisManager.sort((a, b) => b.dateMs - a.dateMs);
                        const mostRecent = allWithThisManager[0];
                        if (mostRecent) {
                            const { action: lastPartner, doc: ownerDoc } = mostRecent;
                            const partnerName = lastPartner?.partner || 'Partner sconosciuta';
                            const inviteLink = lastPartner?.invite || 'Link non disponibile';
                            const lastPartnerDate = lastPartner?.date ? new Date(lastPartner.date) : null;
                            const hasValidDate = lastPartnerDate && !Number.isNaN(lastPartnerDate.getTime());
                            const lastPartnerTimestamp = hasValidDate
                                ? Math.floor(lastPartnerDate.getTime() / 1000)
                                : null;
                            const lastPartnerWhenText = lastPartnerTimestamp
                                ? `<t:${lastPartnerTimestamp}:F> (<t:${lastPartnerTimestamp}:R>)`
                                : 'Non disponibile';
                            const totalCount = allWithThisManager.length;
                            const extraLine = totalCount > 1
                                ? `\n**Partnership totali con questo manager:** ${totalCount} (mostrata la più recente)`
                                : '';
                            await partnerLogChannel.send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setColor('#6f4e37')
                                        .setDescription(
                                            `**<:vegax:1443934876440068179> Manager uscito dal server**\n` +
                                            `**Utente:** ${member.user}\n` +
                                            `**PM:** <@${ownerDoc.userId}>\n` +
                                            `**Partner:** ${partnerName}\n` +
                                            `**Invito:** ${inviteLink}\n` +
                                            `**Ultima partner:** ${lastPartnerWhenText}${extraLine}`
                                        )
                                ]
                            });
                        }
                    }
                    const dmChannel = await member.user.createDM().catch(() => null);
                    if (dmChannel) {
                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setLabel("Rientra nel server")
                                .setStyle(ButtonStyle.Link)
                                .setURL(IDs.links.invite)
                        );
                        await dmChannel.send({
                            content: `<:vegax:1443934876440068179> Sei uscito dal server! Rientra entro 5 minuti per non perdere la tua partnership.`,
                            components: [row]
                        }).catch((error) => {
                            if (error?.code !== 50007) {
                                global.logger.error(error);
                            }
                        });
                    }
                    setTimeout(async () => {
                        const stillOut = await guild.members.fetch(member.id).catch(() => null);
                        if (stillOut) return;

                        for (const doc of partnerships) {
                            const actions = Array.isArray(doc.partnerActions) ? doc.partnerActions : [];
                            const toRollback = actions.filter((action) => action?.managerId === member.id);

                            for (const action of toRollback) {
                                const channelId = action?.partnershipChannelId || IDs.channels.partnerships;
                                const channel = guild.channels.cache.get(channelId)
                                    || await guild.channels.fetch(channelId).catch(() => null);
                                if (!channel?.isTextBased?.()) continue;

                                const messageIds = Array.isArray(action?.partnerMessageIds) ? action.partnerMessageIds : [];
                                for (const messageId of messageIds) {
                                    if (!messageId) continue;
                                    const msg = await channel.messages.fetch(messageId).catch(() => null);
                                    if (msg) await msg.delete().catch(() => { });
                                }
                            }

                            const removedCount = toRollback.length;
                            if (removedCount > 0) {
                                doc.partnerActions = actions.filter((action) => action?.managerId !== member.id);
                                // Keep earned points even when partnership messages are auto-removed after leave timeout.
                            }
                            doc.managerId = null;
                            await doc.save().catch(() => { });
                        }
                    }, 5 * 60 * 1000);
                } catch (err) {
                    global.logger.error(err);
                }
            }

            await Promise.allSettled([
                ExpUser.deleteOne({ guildId: guild.id, userId: member.id }),
                ActivityUser.deleteOne({ guildId: guild.id, userId: member.id }),
                LevelHistory.deleteMany({ guildId: guild.id, userId: member.id }),
                MinigameUser.deleteOne({ guildId: guild.id, userId: member.id })
            ]);
        } catch (err) {
            global.logger.error(err);
        }
    }
}
