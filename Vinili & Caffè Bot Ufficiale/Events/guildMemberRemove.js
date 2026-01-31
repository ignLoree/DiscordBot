const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Staff = require('../Schemas/Staff/staffSchema');
const Ticket = require("../Schemas/Ticket/ticketSchema");
const createTranscript = require("../Utils/Ticket/createTranscript");

module.exports = {
    name: 'guildMemberRemove',
    async execute(member) {
        try {
            const guild = member.guild;
            const totalVoice = guild.channels.cache.get('1442569096700104754');
            if (totalVoice) {
                totalVoice.setName(`༄☕︲User: ${guild.memberCount}`).catch(() => {});
            }
            const ticket = await Ticket.findOne({ userId: member.id, open: true });
            if (ticket) {
                const channel = guild.channels.cache.get(ticket.channelId);
                if (channel) {
                    const transcriptTXT = await createTranscript(channel);
                    ticket.open = false;
                    ticket.transcript = transcriptTXT;
                    ticket.closeReason = "Utente uscito dal server";
                    await ticket.save();
                    const logChannel = guild.channels.cache.get("1442569290682208296");
                    const createdAtFormatted = ticket.createdAt
                        ? `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>`
                        : "Data non disponibile";
                    if (logChannel) {
                        await logChannel.send({
                            files: [{
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
                        });
                    }
                    setTimeout(() => channel.delete().catch(() => {}), 1000);
                }
            }
            const staffDoc = await Staff.findOne({
                guildId: guild.id,
                userId: member.id
            });
            if (!staffDoc) return;
            const newRole = guild.roles.cache.get('1442568949605597264');
            const newRoleName = newRole ? newRole.name : "༄ User";
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
            const resignChannel = guild.channels.cache.get('1442569234004709391');
            if (resignChannel) {
                const msg =
                    `**<a:laydowntorest:1444006796661358673> DEPEX** ${member.user}
<:member_role_icon:1330530086792728618> \`${lastRole}\` <a:vegarightarrow:1443673039156936837> \`${newRoleName}\`
<:discordstaff:1443651872258003005> __Dimissioni (Esce dal server)__`;
                await resignChannel.send({ content: msg });
            }
            const partnerships = await Staff.find({ managerId: member.id });
            if (partnerships.length > 0) {
                try {
                    const dmChannel = await member.createDM().catch(() => null);
                    if (dmChannel) {
                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setLabel("Rientra nel server")
                                .setStyle(ButtonStyle.Link)
                                .setURL("https://discord.gg/viniliecaffe")
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