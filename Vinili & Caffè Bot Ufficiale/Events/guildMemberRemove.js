const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Staff = require('../Schemas/Staff/staffSchema');
const Ticket = require("../Schemas/Ticket/ticketSchema");
const { createTranscript, createTranscriptHtml, saveTranscriptHtml } = require("../Utils/Ticket/transcriptUtils");
const { InviteTrack, ExpUser, ActivityUser, LevelHistory } = require('../Schemas/Community/communitySchemas');
const { MinigameUser } = require('../Schemas/Minigames/minigameSchema');
const IDs = require('../Utils/Config/ids');
const { scheduleStaffListRefresh } = require('../Utils/Community/staffListUtils');

const STAFF_TRACKED_ROLE_IDS = new Set([
    IDs.roles.partnerManager,
    IDs.roles.staff,
    IDs.roles.helper,
    IDs.roles.moderator,
    IDs.roles.coordinator,
    IDs.roles.supervisor,
    IDs.roles.admin,
    IDs.roles.manager,
    IDs.roles.coOwner,
    IDs.roles.owner
]);

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, client) {
        try {
            if (member?.guild?.id === IDs.guilds.main) {
                scheduleStaffListRefresh(client, member.guild.id);
            }

            await InviteTrack.findOneAndUpdate(
                { guildId: member.guild.id, userId: member.id, active: true },
                { $set: { active: false, leftAt: new Date() } }
            ).catch(() => {});

            const guild = member.guild;
            const totalVoice = guild.channels.cache.get(IDs.channels.totalVoiceCounter);
            if (totalVoice) {
                totalVoice.setName(`༄☕︲ User: ${guild.memberCount}`).catch(() => {});
            }
            const openTickets = await Ticket.find({ userId: member.id, open: true }).catch(() => []);
            if (openTickets.length > 0) {
                const logChannel = guild.channels.cache.get(IDs.channels.ticketCloseLogAlt)
                    || await guild.channels.fetch(IDs.channels.ticketCloseLogAlt).catch(() => null)
                    || guild.channels.cache.get(IDs.channels.commandError)
                    || await guild.channels.fetch(IDs.channels.commandError).catch(() => null);
                for (const ticket of openTickets) {
                    const channel = guild.channels.cache.get(ticket.channelId) || await guild.channels.fetch(ticket.channelId).catch(() => null);
                    if (!channel) {
                        await Ticket.updateOne(
                            { _id: ticket._id },
                            { $set: { open: false, closeReason: "Utente uscito dal server", closedAt: new Date() } }
                        ).catch(() => {});
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
                    await ticket.save().catch(() => {});

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
**<:discordstaff:1443651872258003005> Chiuso da:** Sistema
**<:Clock:1330530065133338685> Aperto il:** ${createdAtFormatted}
**? Claimato da:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Non claimato"}
**<:reportmessage:1443670575376765130> Motivo:** Utente uscito dal server
`)
                                    .setColor("#6f4e37")
                            ]
                        }).catch(() => {});
                    }
                    setTimeout(() => channel.delete().catch(() => {}), 1000);
                }
            }
            const hadTrackedStaffRole = member.roles?.cache
                ? [...STAFF_TRACKED_ROLE_IDS].some((roleId) => member.roles.cache.has(roleId))
                : false;

            if (hadTrackedStaffRole) {
                const resignChannel = guild.channels.cache.get(IDs.channels.resignLog);
                if (resignChannel) {
                    const highestTrackedRole = member.roles.cache
                        .filter((role) => STAFF_TRACKED_ROLE_IDS.has(role.id))
                        .sort((a, b) => b.position - a.position)
                        .first();
                    const roleLabel = highestTrackedRole?.name || "Staff/PM";
                    const userRole = guild.roles.cache.get(IDs.roles.user);
                    const userRoleLabel = userRole?.name || "? User";
                    const msg =
                        `**<a:laydowntorest:1444006796661358673> DEPEX** ${member.user}
<:member_role_icon:1330530086792728618> \`${roleLabel}\` <a:vegarightarrow:1443673039156936837> \`${userRoleLabel}\`
<:discordstaff:1443651872258003005> __Dimissioni (Esce dal server)__`;
                    await resignChannel.send({ content: msg }).catch(() => {});
                }

                await Staff.deleteOne({
                    guildId: guild.id,
                    userId: member.id
                }).catch(() => {});
            }
            const partnerships = await Staff.find({
                guildId: guild.id,
                $or: [
                    { managerId: member.id },
                    { 'partnerActions.managerId': member.id }
                ]
            }).catch(() => []);
            if (partnerships.length > 0) {
                try {
                    const partnerLogChannel = guild.channels.cache.get(IDs.channels.partnerManagerLeaveLog)
                        || await guild.channels.fetch(IDs.channels.partnerManagerLeaveLog).catch(() => null);
                    if (partnerLogChannel) {
                        for (const doc of partnerships) {
                            const lastPartner = Array.isArray(doc.partnerActions)
                                ? [...doc.partnerActions].reverse().find((action) => action?.managerId === member.id) || doc.partnerActions[doc.partnerActions.length - 1]
                                : null;
                            const partnerName = lastPartner?.partner || 'Partner sconosciuta';
                            const inviteLink = lastPartner?.invite || 'Link non disponibile';
                            await partnerLogChannel.send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setColor('#6f4e37')
                                        .setDescription(
                                            `**<:vegax:1443934876440068179> Manager uscito dal server**\n` +
                                            `**Utente:** ${member.user}\n` +
                                            `**Partner:** ${partnerName}\n` +
                                            `**Invito:** ${inviteLink}`
                                        )
                                ]
                            });
                        }
                    }
                    const dmChannel = await member.createDM().catch(() => null);
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
                        });
                    }
                    setTimeout(async () => {
                        const stillOut = await guild.members.fetch(member.id).catch(() => null);
                        if (stillOut) return;

                        for (const doc of partnerships) {
                            const actions = Array.isArray(doc.partnerActions) ? doc.partnerActions : [];
                            const toRollback = actions.filter((action) => action?.managerId === member.id);

                            for (const action of toRollback) {
                                const channelId = action?.partnershipChannelId || IDs.channels.partnershipPosts;
                                const channel = guild.channels.cache.get(channelId)
                                    || await guild.channels.fetch(channelId).catch(() => null);
                                if (!channel?.isTextBased?.()) continue;

                                const messageIds = Array.isArray(action?.partnerMessageIds) ? action.partnerMessageIds : [];
                                for (const messageId of messageIds) {
                                    if (!messageId) continue;
                                    const msg = await channel.messages.fetch(messageId).catch(() => null);
                                    if (msg) await msg.delete().catch(() => {});
                                }
                            }

                            const removedCount = toRollback.length;
                            if (removedCount > 0) {
                                doc.partnerActions = actions.filter((action) => action?.managerId !== member.id);
                                doc.partnerCount = Math.max(0, Number(doc.partnerCount || 0) - removedCount);
                            }
                            doc.managerId = null;
                            await doc.save().catch(() => {});
                        }
                    }, 5 * 60 * 1000);
                } catch (err) {
                    global.logger.error(err);
                }
            }

            // Remove all user progression data when the member leaves.
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


