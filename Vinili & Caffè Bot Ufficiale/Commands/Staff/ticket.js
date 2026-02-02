const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Ticket = require('../../Schemas/Ticket/ticketSchema');
const createTranscript = require('../../Utils/Ticket/createTranscript');
const { hasAnyRole } = require('../../Utils/Moderation/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Ticket System')
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Setup Ticket System.')
                .addChannelOption(op =>
                    op.setName('canale')
                        .setDescription('Il canale in cui mandare il pannello dei ticket.')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Aggiungi una persona al ticket.')
                .addUserOption(op =>
                    op.setName('utente')
                        .setDescription('La persona da aggiungere al ticket.')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Rimuovi una persona dal ticket.')
                .addUserOption(op =>
                    op.setName('utente')
                        .setDescription('La persona da rimuovere dal ticket.')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('closerequest')
                .setDescription('Invia una richiesta di chiusura del ticket all\'utente principale.')
                .addStringOption(op =>
                    op.setName('reason')
                        .setDescription('Il motivo per cui chiedi di chiudere il ticket')
                )
        )
        .addSubcommand(sub =>
            sub.setName('close')
                .setDescription('Chiudi il ticket corrente.')
        )
        .addSubcommand(sub =>
            sub.setName('claim')
                .setDescription('Claima il ticket corrente per lo staff.')
        )
        .addSubcommand(sub =>
            sub.setName('unclaim')
                .setDescription('Rimuove il claim dal ticket corrente.')
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand()
        await interaction.deferReply()
        if (!interaction.inGuild()) {
            return await interaction.editReply({
                content: "<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.",
                flags: 1 << 6
            });
        }
        if (!interaction.member || !interaction.member.roles) {
            return await interaction.editReply({
                content: "<:vegax:1443934876440068179> Si è verificato un errore nel recuperare le informazioni del membro.",
                flags: 1 << 6
            });
        }
        switch (subcommand) {
            case 'setup': {
                const allowedRoles = ['1442568888096391260'];
                const hasAllowedRole = hasAnyRole(interaction.member, allowedRoles);
                if (!hasAllowedRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando!')
                                .setColor("#6f4e37")
                        ],
                        flags: 1 << 6
                    });
                }
                const ticketChannel = interaction.options.getChannel('canale');
                const ticketEmbed = new EmbedBuilder()
                    .setDescription(`<:vsl_ticket:1329520261053022208> **Tickets** di **Vinili & Caffè**!
<a:vegarightarrow:1443673039156936837> Abbiamo **__4__** tipi di __ticket__. I ticket sono **ordinati** per __importanza__, ovviamente quelli più __importanti__ sono quelli da usare **raramente**.
<:dot:1443660294596329582> **__\`PERKS\`__**
↪ Apri questo ticket per __richiedere__ i **perks** che ti spettano. Non aprire per richiedere __perks__ che necessitano di **permessi**, come mandare **__media__** in chat poiché sono dati **__automaticamente__**.
<:dot:1443660294596329582> **__\`SUPPORTO\`__**
↪ Apri questo ticket per richiedere **__supporto__** allo **__staff__** del server.
<:dot:1443660294596329582> **__\`PARTNERSHIP\`__**
↪ Apri questo ticket per richiedere una **partnership**. Se volessi effettuare una **collaborazione/sponsor**, apri un ticket **__\`HIGH STAFF\`__**
<:dot:1443660294596329582> **__\`HIGH STAFF\`__**
↪ Usa questa __sezione__ per **contattare** l'**__amministrazione__** del server.
<:attentionfromvega:1443651874032062505> Aprire un ticket **__inutile__** oppure **__non rispondere__** nell'arco di **\`24\` ore** comporterà un **warn**.`)
                    .setColor('#6f4e37')
                    .setFooter({ text: `© 2025 Vinili & Caffè. Tutti i diritti riservati.`, iconURL: `${interaction.guild.iconURL()}` });
                const ticketButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId('ticket_perks').setLabel('︲PERKS').setEmoji(`<a:Boost_Cycle:1329504283007385642>`).setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('ticket_supporto').setLabel('︲SUPPORTO').setEmoji(`<:discordstaff:1443651872258003005>`).setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('ticket_partnership').setLabel('︲PARTNERSHIP').setEmoji(`<:partneredserverowner:1443651871125409812>`).setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('ticket_highstaff').setLabel('︲HIGH STAFF').setEmoji(`<:reportmessage:1443670575376765130>`).setStyle(ButtonStyle.Secondary)
                    );
                await ticketChannel.send({ embeds: [ticketEmbed], components: [ticketButtons] });
                return await interaction.editReply({ content: `Pannello inviato nel canale ${ticketChannel}`, flags: 1 << 6 });
            }
            case 'add': {
                const allowedRoles = ['1442568910070349985', '1442568905582317740'];
                const hasAllowedRole = hasAnyRole(interaction.member, allowedRoles);
                if (!hasAllowedRole && !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setDescription('? Non hai il permesso per fare questo comando!').setColor("#6f4e37")],
                        flags: 1 << 6
                    });
                }
                const user = interaction.options.getUser('utente');
                await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
                return await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Aggiungi")
                            .setDescription(`<:vegacheckmark:1443666279058772028> ${user} è stato aggiunto a ${interaction.channel}`)
                            .setColor('#6f4e37')
                    ]
                });
            }
            case 'remove': {
                const allowedRoles = ['1442568910070349985', '1442568905582317740'];
                const hasAllowedRole = hasAnyRole(interaction.member, allowedRoles);
                if (!hasAllowedRole && !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando!').setColor("#6f4e37")],
                        flags: 1 << 6
                    });
                }
                const user = interaction.options.getUser('utente');
                await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false, SendMessages: false });
                return await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Rimuovi")
                            .setDescription(`<:vegacheckmark:1443666279058772028> ${user} è stato rimosso da ${interaction.channel}`)
                            .setColor('#6f4e37')
                    ]
                });
            }
            case 'closerequest': {
                const allowedRoles = ['1442568910070349985', '1442568905582317740'];
                const hasAllowedRole = hasAnyRole(interaction.member, allowedRoles);
                if (!hasAllowedRole && !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando!').setColor("#6f4e37")],
                        flags: 1 << 6
                    });
                }
                const reason = interaction.options.getString('reason');
                const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticketDoc)
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle("Errore").setDescription(`<:vegax:1443934876440068179> Questo non è un canale ticket`).setColor('#6f4e37')]
                    });
                const closeButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId('accetta').setLabel('☑️ Accetta e chiudi').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('rifiuta').setLabel('<:vegax:1443934876440068179> Rifiuta e mantieni aperto').setStyle(ButtonStyle.Secondary)
                    );
                return await interaction.editReply({
                    content: `<@${ticketDoc.userId}>`,
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Richiesta di chiusura")
                            .setDescription(`${interaction.user} ha richiesto di chiudere questo ticket.\nMotivo:\n\`\`\`${reason ? reason : "Nessun motivo inserito"}\`\`\``)
                            .setColor('#6f4e37')
                    ],
                    components: [closeButton]
                });
            }
            case 'close': {
                const LOG_CHANNEL = '1442569290682208296';
                const allowedRoles = ['1442568910070349985', '1442568905582317740'];
                const hasAllowedRole = hasAnyRole(interaction.member, allowedRoles);
                if (!hasAllowedRole && !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando!').setColor("#6f4e37")],
                        flags: 1 << 6
                    });
                }
                const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id });
                const transcriptTXT = await createTranscript(interaction.channel).catch(() => '');
                ticketDoc.open = false;
                ticketDoc.transcript = transcriptTXT;
                await ticketDoc.save().catch(() => { });
                const createdAtFormatted = ticketDoc.createdAt
                    ? `<t:${Math.floor(ticketDoc.createdAt.getTime() / 1000)}:F>`
                    : 'Data non disponibile';
                const logChannel = interaction.guild?.channels?.cache?.get(LOG_CHANNEL);
                if (!ticketDoc)
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle("Errore").setDescription(`<:vegax:1443934876440068179> Questo non è un canale ticket`).setColor('#6f4e37')]
                    });
                if (logChannel) {
                    await logChannel.send({
                        files: [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${interaction.channel.id}.txt` }],
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Ticket Chiuso')
                                .setDescription(`**Aperto da:** <@${ticketDoc.userId}>\n**Chiuso da:** ${interaction.user}\n**Aperto il:** ${createdAtFormatted}\n**Claimato da:** ${ticketDoc.claimedBy ? `<@${ticketDoc.claimedBy}>` : 'Non claimato'}\n**Motivo:** ${ticketDoc.closeReason ? ticketDoc.closeReason : 'Nessun motivo inserito'}`)
                                .setColor('#6f4e37')
                        ],
                    }).catch(err => global.logger.error(err));
                }
                const member = await interaction.guild.members.fetch(ticketDoc.userId).catch(() => null);
                if (member) {
                    try {
                        await member.send({
                            files: [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${interaction.channel.id}.txt` }],
                            embeds: [new EmbedBuilder().setTitle('Ticket Chiuso').setDescription(`**Aperto da:** <@${ticketDoc.userId}>\n**Chiuso da:** ${interaction.user}\n**Aperto il:** ${createdAtFormatted}\n**Claimato da:** ${ticketDoc.claimedBy ? `<@${ticketDoc.claimedBy}>` : 'Non claimato'}\n**Motivo:** ${ticketDoc.closeReason ? ticketDoc.closeReason : 'Nessun motivo inserito'}`).setColor('#6f4e37')]
                        })
                    } catch (err) {
                        if (err.code !== 50007) {
                            global.logger.error('[DM ERROR]', err);
                        }
                    }
                }
                await Ticket.updateOne({ channelId: interaction.channel.id }, { $set: { open: false, transcript: transcriptTXT, claimedBy: ticketDoc.claimedBy || null, closeReason: ticketDoc.closeReason || null, closedAt: new Date() } }).catch(() => { });
                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription("🔒 Il ticket verrà chiuso…")
                            .setColor('#6f4e37')
                    ],
                    flags: 1 << 6
                });
                setTimeout(() => {
                    if (interaction.channel) interaction.channel.delete().catch(() => { });
                }, 2000);
                return;
            }
            case 'claim': {
                const allowedRoles = ['1442568910070349985', '1442568905582317740'];
                const hasAllowedRole = hasAnyRole(interaction.member, allowedRoles);
                if (!hasAllowedRole && !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando!').setColor("Red")],
                        flags: 1 << 6
                    });
                }
                const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticketDoc)
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle("Errore").setDescription(`<:vegax:1443934876440068179> Questo non è un canale ticket`).setColor('#6f4e37')],
                        flags: 1 << 6
                    });
                if (ticketDoc.claimedBy) {
                    return await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("Errore")
                                .setDescription(`<:attentionfromvega:1443651874032062505> Questo ticket è già stato claimato da <@${ticketDoc.claimedBy}>`)
                                .setColor("Red")
                        ],
                        flags: 1 << 6
                    });
                }
                ticketDoc.claimedBy = interaction.user.id;
                await ticketDoc.save();
                await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
                    ViewChannel: true,
                    SendMessages: true
                });
                let msg;
                try {
                    msg = await interaction.channel.messages.fetch(ticketDoc.messageId);
                } catch {
                    const fallbackMessages = await interaction.channel.messages.fetch({ limit: 5 });
                    msg = fallbackMessages.first();
                }
                if (!msg) {
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle("Errore").setDescription("<:attentionfromvega:1443651874032062505> Non riesco a trovare il messaggio del ticket.").setColor("Red")],
                        flags: 1 << 6
                    });
                }
                const updatedEmbed = EmbedBuilder.from(msg.embeds[0]);
                const updatedButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Chiudi").setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId("close_ticket_motivo").setLabel("📝 Chiudi con motivo").setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId("unclaim").setLabel("🔓 Unclaim").setStyle(ButtonStyle.Secondary)
                    );
                await msg.edit({
                    embeds: [updatedEmbed],
                    components: [updatedButtons]
                });
                return await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Ticket Claimato")
                            .setDescription(`Il ticket è stato preso in carico da <@${ticketDoc.claimedBy}>`)
                            .setColor('#6f4e37')
                    ]
                });
            }
            case 'unclaim': {
                const allowedRoles = ['1442568910070349985', '1442568905582317740'];
                const hasAllowedRole = hasAnyRole(interaction.member, allowedRoles);
                if (!hasAllowedRole && !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando!').setColor("Red")],
                        flags: 1 << 6
                    });
                }
                const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticketDoc)
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle("Errore").setDescription("<:vegax:1443934876440068179> Questo non è un canale ticket").setColor('#6f4e37')],
                        flags: 1 << 6
                    });
                if (!ticketDoc.claimedBy) {
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle("Errore").setDescription("<:vegax:1443934876440068179> Questo ticket non è claimato.").setColor("Red")],
                        flags: 1 << 6
                    });
                }
                const oldClaimer = ticketDoc.claimedBy;
                if (interaction.user.id !== oldClaimer && !hasAllowedRole) {
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle("Errore").setDescription("<:vegax:1443934876440068179> Non puoi unclaimare questo ticket.").setColor("Red")],
                        flags: 1 << 6
                    });
                }
                ticketDoc.claimedBy = null;
                await ticketDoc.save();
                await interaction.channel.permissionOverwrites.delete(oldClaimer).catch(() => { });
                let msg;
                try {
                    msg = await interaction.channel.messages.fetch(ticketDoc.messageId);
                } catch {
                    const fallback = await interaction.channel.messages.fetch({ limit: 5 });
                    msg = fallback.first();
                }
                if (!msg) {
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle("Errore").setDescription("<:attentionfromvega:1443651874032062505> Non riesco a trovare il messaggio principale del ticket.").setColor("Red")],
                        flags: 1 << 6
                    });
                }
                const originalEmbed = EmbedBuilder.from(msg.embeds[0]);
                const originalButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Chiudi").setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId("close_ticket_motivo").setLabel("📝 Chiudi Con Motivo").setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId("claim_ticket").setLabel("🙋‍♂️ Claim").setStyle(ButtonStyle.Success)
                    );
                await msg.edit({
                    embeds: [originalEmbed],
                    components: [originalButtons]
                });
                return await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Ticket Unclaimato")
                            .setDescription(`<@${oldClaimer}> non gestisce più il ticket`)
                            .setColor('#6f4e37')
                    ]
                })
            }
        }
    }
}