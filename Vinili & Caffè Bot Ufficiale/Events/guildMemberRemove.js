const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Staff = require('../Schemas/Staff/staffSchema');
const Ticket = require("../Schemas/Ticket/ticketSchema");
const { createTranscript, createTranscriptHtml, saveTranscriptHtml } = require("../Utils/Ticket/transcriptUtils");
const { InviteTrack } = require('../Schemas/Community/communitySchemas');
const IDs = require('../Utils/Config/ids');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member) {
        try {
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
            const staffDoc = await Staff.findOne({
                guildId: guild.id,
                userId: member.id
            });
            if (staffDoc) {
            const newRole = guild.roles.cache.get(IDs.roles.user);
            const newRoleName = newRole ? newRole.name : "? User";
            let lastRole = "Nessun ruolo salvato";
            if (staffDoc.rolesHistory.length > 0) {
                const lastRoleIdOrName =
                    staffDoc.rolesHistory[staffDoc.rolesHistory.length - 1].newRole;
                const roleFromGuild = guild.roles.cache.get(lastRoleIdOrName);
                lastRole = roleFromGuild ? roleFromGuild.name : lastRoleIdOrName;
            }
            staffDoc.rolesHistory.push({
                oldRole: lastRole,
                newRole: newRoleName,
                reason: "Dimissioni"
            });
            await staffDoc.save();
            const resignChannel = guild.channels.cache.get(IDs.channels.resignLog);
            if (resignChannel) {
                const msg =
                    `**<a:laydowntorest:1444006796661358673> DEPEX** ${member.user}
<:member_role_icon:1330530086792728618> \`${lastRole}\` <a:vegarightarrow:1443673039156936837> \`${newRoleName}\`
<:discordstaff:1443651872258003005> __Dimissioni (Esce dal server)__`;
                await resignChannel.send({ content: msg });
            }
            }
            const partnerships = await Staff.find({ managerId: member.id });
            if (partnerships.length > 0) {
                try {
                    const partnerLogChannel = guild.channels.cache.get(IDs.channels.partnerManagerLeaveLog);
                    if (partnerLogChannel) {
                        for (const doc of partnerships) {
                            const lastPartner = doc.partnerActions && doc.partnerActions.length
                                ? doc.partnerActions[doc.partnerActions.length - 1]
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
                        if (!stillOut) {
                            for (const doc of partnerships) {
                                doc.managerId = null;
                                await doc.save();
                            }
                        }
                    }, 5 * 60 * 1000);
                } catch (err) {
                    global.logger.error(err);
                }
            }
        } catch (err) {
            global.logger.error(err);
        }
    }
}


