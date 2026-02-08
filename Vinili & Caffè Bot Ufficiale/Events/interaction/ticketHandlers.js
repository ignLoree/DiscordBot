const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const Ticket = require('../../Schemas/Ticket/ticketSchema');
const createTranscript = require('../../Utils/Ticket/createTranscript');
const { safeReply: safeReplyHelper, safeEditReply: safeEditReplyHelper } = require('../../Utils/Moderation/reply');
const fs = require('fs');
const CONFIG = require('../../config');

async function handleTicketInteraction(interaction) {
    const handledButtons = new Set([
        'ticket_perks',
        'ticket_partnership',
        'ticket_highstaff',
        'ticket_supporto',
        'claim_ticket',
        'close_ticket',
        'close_ticket_motivo',
        'accetta',
        'rifiuta',
        'unclaim'
    ]);

    const isTicketButton = interaction.isButton && interaction.isButton() && handledButtons.has(interaction.customId);
    const isTicketModal = interaction.isModalSubmit && interaction.isModalSubmit() && interaction.customId === 'modal_close_ticket';
    if (!isTicketButton && !isTicketModal) return false;
    const TICKET_CATEGORY = '1442569056795230279';
    const LOG_CHANNEL = '1442569290682208296';
    const ROLE_STAFF = '1442568910070349985';
    const ROLE_HIGHSTAFF = '1442568894349840435';
    const ROLE_PARTNERMANAGER = '1442568905582317740';
    const ROLE_USER = '1442568949605597264';
    const ROLE_BOOSTER = '1329497467481493607';
    const ROLE_DONATOR = '1442568916114346096';
    const ROLE_SUPPORTER = '1442568948271943721';
    const ROLE_LEVEL5 = '1442568937303707789';
    const ROLE_TICKETPARTNER_BLACKLIST = '1443252279477272647';
    const ROLE_TICKET_BLACKLIST = '1463248847768785038';
    const STAFF_ROLES = [ROLE_STAFF, ROLE_HIGHSTAFF];
    const TICKET_PERMISSIONS = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions
    ];

    async function safeReply(target, payload) {
        return safeReplyHelper(target, payload);
    }

    function safeEditReply(target, payload) {
        return safeEditReplyHelper(target, payload);
    }

    function makeErrorEmbed(title, description) {
        return new EmbedBuilder().setTitle(title).setDescription(description).setColor('#6f4e37');
    }

    try {
        if (isTicketButton) {
            if (!interaction.guild || !interaction.member) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione non valida (fuori dal server).')], flags: 1 << 6 });
                return true;
            }
            const partnerOpenButtons = ['ticket_partnership'];
            if (partnerOpenButtons.includes(interaction.customId) && interaction.member?.roles?.cache?.has(ROLE_TICKETPARTNER_BLACKLIST)) {
                await safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#6f4e37')
                            .setDescription(`<:vegax:1443934876440068179> Non puoi usare questo bottone poichè sei blacklistato dalle partner. Se pensi sia un errore apri un <#1442569095068254219> \`HIGH STAFF\``)
                    ],
                    flags: 1 << 6
                });
                return true;
            }
            const ticketOpenButtons = ['ticket_partnership', 'ticket_perks', 'ticket_supporto', 'ticket_highstaff'];
            if (ticketOpenButtons.includes(interaction.customId) && interaction.member?.roles?.cache?.has(ROLE_TICKET_BLACKLIST)) {
                await safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#6f4e37')
                            .setDescription(`<:vegax:1443934876440068179> Non puoi usare questo bottone poichè sei blacklistato dai ticket.`)
                    ],
                    flags: 1 << 6
                });
                return true;
            }
            const userOnlyTickets = ['ticket_perks', 'ticket_partnership', 'ticket_highstaff'];
            if (userOnlyTickets.includes(interaction.customId) && !interaction.member?.roles?.cache?.has(ROLE_USER)) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Devi avere il ruolo **USER** per aprire questo ticket')], flags: 1 << 6 });
                return true;
            }
            const ticketConfig = {
                ticket_perks: {
                    type: "perks",
                    emoji: "??",
                    name: "perks",
                    role: ROLE_HIGHSTAFF,
                    requiredRoles: [ROLE_USER, ROLE_BOOSTER, ROLE_DONATOR, ROLE_SUPPORTER, ROLE_LEVEL5],
                    embed: new EmbedBuilder()
                        .setTitle("<:vsl_ticket:1329520261053022208>·**__TICKET PERKS__**")
                        .setDescription(`<a:ThankYou:1329504268369002507>·__Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ?? Attendi un **__\`HIGH STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ? Indica quali **perks** vuoi riscattare.`)
                        .setColor("#6f4e37")
                        .setFooter({ text: `© 2025 Vinili & Caffè. Tutti i diritti riservati.`, iconURL: interaction.guild?.iconURL?.() })
                },
                ticket_supporto: {
                    type: "supporto",
                    emoji: "??",
                    name: "supporto",
                    role: ROLE_STAFF,
                    requiredRoles: [],
                    embed: new EmbedBuilder()
                        .setTitle("<:vsl_ticket:1329520261053022208>·**__TICKET SUPPORTO__**")
                        .setDescription(`<a:ThankYou:1329504268369002507>·__Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ?? Attendi un membro dello **__\`STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ? Spiega subito il tuo problema.`)
                        .setColor("#6f4e37")
                        .setFooter({ text: `© 2025 Vinili & Caffè. Tutti i diritti riservati.`, iconURL: interaction.guild?.iconURL?.() })
                },
                ticket_partnership: {
                    type: "partnership",
                    emoji: "??",
                    name: "partnership",
                    role: ROLE_PARTNERMANAGER,
                    requiredRoles: [ROLE_USER],
                    embed: new EmbedBuilder()
                        .setTitle("<:vsl_ticket:1329520261053022208>·**__TICKET PARTNERSHIP__**")
                        .setDescription(`<a:ThankYou:1329504268369002507>·__Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ?? Attendi un **__\`PARTNER MANAGER\`__**.`)
                        .setColor("#6f4e37")
                        .setFooter({ text: `© 2025 Vinili & Caffè. Tutti i diritti riservati.`, iconURL: interaction.guild?.iconURL?.() })
                },
                ticket_highstaff: {
                    type: "high",
                    emoji: "?",
                    name: "highstaff",
                    role: ROLE_HIGHSTAFF,
                    requiredRoles: [ROLE_USER],
                    embed: new EmbedBuilder()
                        .setTitle("<:vsl_ticket:1329520261053022208>·**__TICKET HIGH__**")
                        .setDescription(`<a:ThankYou:1329504268369002507>·__Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ?? Attendi un **__\`HIGH STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ? Descrivi cosa vuoi segnalare.`)
                        .setColor("#6f4e37")
                        .setFooter({ text: `© 2025 Vinili & Caffè. Tutti i diritti riservati.`, iconURL: interaction.guild?.iconURL?.() })
                }
            };
            const config = ticketConfig[interaction.customId];
            if (!config && ![
                'claim_ticket',
                'close_ticket',
                'close_ticket_motivo',
                'accetta',
                'rifiuta',
                'unclaim'
            ].includes(interaction.customId)) {
                return true;
            }
            if (config) {
                if (['ticket_perks', 'ticket_partnership', 'ticket_highstaff', 'accetta', 'rifiuta', 'unclaim'].includes(interaction.customId) && !interaction.member?.roles?.cache?.has(ROLE_USER)) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Devi avere il ruolo **USER** per aprire questo ticket')], flags: 1 << 6 });
                    return true;
                }
                if (config.requiredRoles?.length > 0) {
                    const hasRole = config.requiredRoles.some(r => interaction.member?.roles?.cache?.has(r));
                    if (!hasRole) {
                        await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Non hai i requisiti per aprire questo ticket')], flags: 1 << 6 });
                        return true;
                    }
                }
                const existing = await Ticket.findOne({ userId: interaction.user.id, open: true });
                if (existing) {
                    await safeReply(interaction, { embeds: [new EmbedBuilder().setTitle('Ticket Aperto').setDescription(`<:vegax:1443934876440068179> Hai già un ticket aperto: <#${existing.channelId}>`).setColor('#6f4e37')], flags: 1 << 6 });
                    return true;
                }
                const channel = await interaction.guild.channels.create({
                    name: `?${config.emoji}?${config.name}?${interaction.user.username}`,
                    type: 0,
                    parent: TICKET_CATEGORY,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.roles.everyone,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: interaction.user.id,
                            allow: TICKET_PERMISSIONS
                        },
                        ...(config.type === 'partnership'
                            ? [
                                {
                                    id: ROLE_PARTNERMANAGER,
                                    allow: TICKET_PERMISSIONS
                                },
                                {
                                    id: ROLE_HIGHSTAFF,
                                    allow: TICKET_PERMISSIONS
                                },
                                {
                                    id: ROLE_STAFF,
                                    deny: [PermissionFlagsBits.ViewChannel]
                                }
                            ]
                            : [
                                {
                                    id: config.role,
                                    allow: TICKET_PERMISSIONS
                                },
                                {
                                    id: ROLE_PARTNERMANAGER,
                                    deny: [PermissionFlagsBits.ViewChannel]
                                }
                            ]
                        )
                    ]
                }).catch(err => {
                    global.logger.error(err);
                    return null;
                });
                if (!channel) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Impossibile creare il canale ticket')], flags: 1 << 6 });
                    return true;
                }
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("close_ticket").setLabel("?? Chiudi").setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId("close_ticket_motivo").setLabel("?? Chiudi Con Motivo").setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId("claim_ticket").setLabel("?? Claim").setStyle(ButtonStyle.Success)
                );
                const mainMsg = await channel.send({ embeds: [config.embed], components: [row] }).catch(err => {
                    global.logger.error(err);
                    return null;
                });
                await Ticket.create({
                    userId: interaction.user.id,
                    channelId: channel.id,
                    ticketType: config.type,
                    open: true,
                    messageId: mainMsg?.id || null
                }).catch(err => global.logger.error(err));
                let tagRole = config.type === 'partnership' ? ROLE_PARTNERMANAGER : config.role;
                const mentionMsg = await channel.send(`<@${interaction.user.id}> ${tagRole ? `<@&${tagRole}>` : ''}`).catch(() => null);
                if (mentionMsg) {
                    setTimeout(() => {
                        mentionMsg.delete().catch(() => { });
                    }, 100);
                }
                await safeReply(interaction, { embeds: [new EmbedBuilder().setTitle('?? Ticket Creato').setDescription(`Aperto un nuovo ticket: ${channel}`).setColor('#6f4e37')], flags: 1 << 6 });
                return true;
            }
            if (interaction.customId === 'claim_ticket') {
                if (!STAFF_ROLES.concat([ROLE_PARTNERMANAGER]).some(r => interaction.member?.roles?.cache?.has(r))) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo lo staff può claimare i ticket')], flags: 1 << 6 });
                    return true;
                }
                if (!interaction.channel) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione fuori canale')], flags: 1 << 6 });
                    return true;
                }
                const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticket) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket non trovato')], flags: 1 << 6 });
                    return true;
                }
                if (ticket.claimedBy) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket già claimato')], flags: 1 << 6 });
                    return true;
                }
                ticket.claimedBy = interaction.user.id;
                await ticket.save().catch(err => global.logger.error(err));
                if (interaction.channel) {
                    try {
                        await interaction.channel.permissionOverwrites.edit(ticket.userId, {
                            ViewChannel: true,
                            SendMessages: true,
                            EmbedLinks: true,
                            AttachFiles: true,
                            ReadMessageHistory: true,
                            AddReactions: true
                        });
                        await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
                            ViewChannel: true,
                            SendMessages: true,
                            EmbedLinks: true,
                            AttachFiles: true,
                            ReadMessageHistory: true,
                            AddReactions: true
                        });
                        for (const r of STAFF_ROLES) {
                            await interaction.channel.permissionOverwrites.edit(r, {
                                ViewChannel: true,
                                SendMessages: false,
                                ReadMessageHistory: true
                            });
                        }
                        if (ticket.ticketType === 'partnership') {
                            await interaction.channel.permissionOverwrites.edit(ROLE_PARTNERMANAGER, {
                                ViewChannel: true,
                                SendMessages: false,
                                ReadMessageHistory: true
                            });
                        } else {
                            await interaction.channel.permissionOverwrites.edit(ROLE_PARTNERMANAGER, {
                                ViewChannel: false
                            });
                        }
                    } catch (err) {
                        global.logger.error(err);
                    }
                }
                const claimedButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("close_ticket").setLabel("?? Chiudi").setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId("close_ticket_motivo").setLabel("?? Chiudi con motivo").setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId("unclaim").setLabel("?? Unclaim").setStyle(ButtonStyle.Secondary)
                );
                try {
                    if (interaction.channel && ticket.messageId) {
                        const msg = await interaction.channel.messages.fetch(ticket.messageId).catch(() => null);
                        if (!msg) {
                            const fallback = new EmbedBuilder()
                                .setTitle('Ticket')
                                .setDescription(`Ticket claimato da <@${interaction.user.id}>`)
                                .setColor('#6f4e37');
                            await interaction.channel.send({ embeds: [fallback], components: [claimedButtons] }).catch(() => { });
                        } else {
                            const embedDaUsare = (msg.embeds && msg.embeds[0]) ? EmbedBuilder.from(msg.embeds[0]) : new EmbedBuilder()
                                .setTitle('Ticket')
                                .setDescription(`Ticket claimato da <@${interaction.user.id}>`)
                                .setColor('#6f4e37');
                            await msg.edit({ embeds: [embedDaUsare], components: [claimedButtons] }).catch(err => global.logger.error(err));
                        }
                    }
                } catch (err) {
                    global.logger.error(err);
                }
                await safeReply(interaction, { embeds: [new EmbedBuilder().setTitle('Ticket Claimato').setDescription(`Ticket preso in carico da <@${ticket.claimedBy}>`).setColor('#6f4e37')] });
                return true;
            }
            if (interaction.customId === 'unclaim') {
                if (!interaction.channel) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione fuori canale')], flags: 1 << 6 });
                    return true;
                }
                const ticketButtonsOriginal = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('?? Chiudi').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('close_ticket_motivo').setLabel('?? Chiudi Con Motivo').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('claim_ticket').setLabel('?? Claim').setStyle(ButtonStyle.Success)
                );
                const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticketDoc) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Questo non è un ticket valido.')], flags: 1 << 6 });
                    return true;
                }
                if (!ticketDoc.claimedBy) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Questo ticket non è claimato.')], flags: 1 << 6 });
                    return true;
                }
                if (interaction.user.id !== ticketDoc.claimedBy) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo chi ha claimato può unclaimare il ticket.')], flags: 1 << 6 });
                    return true;
                }
                ticketDoc.claimedBy = null;
                await ticketDoc.save().catch(err => global.logger.error(err));
                try {
                    if (interaction.channel && ticketDoc.messageId) {
                        const msg = await interaction.channel.messages.fetch(ticketDoc.messageId).catch(() => null);
                        if (!msg) {
                            const fallback = new EmbedBuilder()
                                .setTitle('Ticket')
                                .setDescription('Ticket non claimato')
                                .setColor('#6f4e37');
                            await interaction.channel.send({ embeds: [fallback], components: [ticketButtonsOriginal] }).catch(() => { });
                        } else {
                            const embedUsato = (msg.embeds && msg.embeds[0]) ? EmbedBuilder.from(msg.embeds[0]) : new EmbedBuilder()
                                .setTitle('Ticket')
                                .setDescription('Ticket non claimato')
                                .setColor('#6f4e37');
                            await msg.edit({ embeds: [embedUsato], components: [ticketButtonsOriginal] }).catch(() => { });
                        }
                    }
                } catch (err) {
                    global.logger.error(err);
                }
                await safeReply(interaction, { embeds: [new EmbedBuilder().setTitle('Ticket Unclaimato').setDescription(`Il ticket non è più gestito da <@${interaction.user.id}>`).setColor('#6f4e37')] });
                return true;
            }
            if (interaction.customId === 'close_ticket_motivo') {
                if (!interaction.member) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione non valida')], flags: 1 << 6 });
                    return true;
                }
                if (!STAFF_ROLES.concat([ROLE_PARTNERMANAGER]).some(r => interaction.member?.roles?.cache?.has(r))) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Non puoi chiudere questo ticket')], flags: 1 << 6 });
                    return true;
                }
                const modal = new ModalBuilder().setCustomId('modal_close_ticket').setTitle('Chiudi Ticket con Motivo');
                const input = new TextInputBuilder().setCustomId('motivo').setLabel('Motivo della chiusura').setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal).catch(err => {
                    global.logger.error(err);
                });
                return true;
            }
            if (interaction.customId === 'close_ticket') {
                if (!interaction.member) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione non valida')], flags: 1 << 6 });
                    return true;
                }
                if (!STAFF_ROLES.concat([ROLE_PARTNERMANAGER]).some(r => interaction.member?.roles?.cache?.has(r))) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Non puoi chiudere questo ticket')], flags: 1 << 6 });
                    return true;
                }
                try { await interaction.deferReply({ flags: 1 << 6 }).catch(() => { }); } catch (e) { }
                await closeTicket(interaction, null, { safeReply, safeEditReply, makeErrorEmbed, LOG_CHANNEL });
                return true;
            }
            if (interaction.customId === 'accetta') {
                if (!interaction.channel) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione fuori canale')], flags: 1 << 6 });
                    return true;
                }
                const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticketDoc) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Non puoi chiudere questo ticket')], flags: 1 << 6 });
                    return true;
                }
                if (interaction.user.id !== ticketDoc.userId) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo il proprietario del ticket può accettare la chiusura.')], flags: 1 << 6 });
                    return true;
                }
                const channel = interaction.channel;
                const messages = await channel.messages.fetch({ limit: 100 }).catch(() => ({ values: () => [] }));
                const msgs = Array.isArray(messages) ? messages : Array.from(messages.values());
                const content = msgs.reverse().map(m => `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content || '**No message content**'}`).join('\n');
                const fileName = `transcript-${channel.id}.txt`;
                try {
                    fs.writeFileSync(fileName, content);
                } catch (e) {
                    global.logger.error(e);
                }
                const attachment = new AttachmentBuilder(fileName);
                const createdAtFormatted = ticketDoc.createdAt
                    ? `<t:${Math.floor(ticketDoc.createdAt.getTime() / 1000)}:F>`
                    : 'Data non disponibile';
                const motivo = ticketDoc.closeReason || 'Nessun motivo inserito';
                const logChannel = interaction.guild.channels.cache.get('1442570210784591912');
                if (logChannel) {
                    await logChannel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Ticket Chiuso')
                                .setDescription(`\n**Aperto da:** <@${ticketDoc.userId}>\n**Chiuso da:** ${interaction.user}\n**Creato il:** ${createdAtFormatted}\n**Claimato da:** ${ticketDoc.claimedBy ? `<@${ticketDoc.claimedBy}>` : 'Non claimato'}\n**Motivo:** ${motivo}\n`)
                                .setColor('#6f4e37')
                        ],
                        files: [attachment]
                    }).catch(() => { });
                }
                try {
                    const member = await interaction.guild.members.fetch(ticketDoc.userId).catch(() => null);
                    if (member) {
                        await member.send({ embeds: [new EmbedBuilder().setTitle('Ticket Chiuso').setDescription(`**Aperto da:** <@${ticketDoc.userId}>\n**Chiuso da:** ${interaction.user}\n**Creato il:** ${createdAtFormatted}\n**Claimato da:** ${ticketDoc.claimedBy ? `<@${ticketDoc.claimedBy}>` : 'Non claimato'}\n**Motivo:** ${motivo}\n`).setColor('#6f4e37')], files: [attachment] }).catch(() => { });
                    }
                } catch (err) { global.logger.error(err); }
                try { fs.unlinkSync(fileName); } catch (e) { }
                await Ticket.updateOne({ channelId: channel.id }, { $set: { open: false, transcript: content, closeReason: motivo, closedAt: new Date() } }).catch(() => { });
                await channel.delete().catch(() => { });
                return true;
            }
            if (interaction.customId === 'rifiuta') {
                if (!interaction.channel) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione fuori canale')], flags: 1 << 6 });
                    return true;
                }
                const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticketDoc) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Non puoi chiudere questo ticket')], flags: 1 << 6 });
                    return true;
                }
                if (interaction.user.id !== ticketDoc.userId) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo il proprietario del ticket può rifiutare la chiusura.')], flags: 1 << 6 });
                    return true;
                }
                await interaction.update({ embeds: [new EmbedBuilder().setTitle('Richiesta di chiusura').setDescription(`<:vegax:1443934876440068179> ${interaction.user} ha rifiutato la richiesta di chiusura`).setColor('Red')], components: [] }).catch(() => { });
                return true;
            }
        }
        if (isTicketModal && interaction.customId === 'modal_close_ticket') {
            try { await interaction.deferReply({ flags: 1 << 6 }).catch(() => { }); } catch (e) { }
            const motivo = interaction.fields.getTextInputValue('motivo');
            await closeTicket(interaction, motivo, { safeReply, safeEditReply, makeErrorEmbed, LOG_CHANNEL });
            return true;
        }
    } catch (err) {
        global.logger.error(err);
        try {
            await safeReply(interaction, { embeds: [makeErrorEmbed('Errore Interno', '<:vegax:1443934876440068179> Si è verificato un errore durante l\'elaborazione.')], flags: 1 << 6 }).catch(() => { });
        } catch (e) {
            global.logger.info(e);
        }
    }
    return true;
    async function closeTicket(targetInteraction, motivo, helpers) {
        const { safeReply, safeEditReply, makeErrorEmbed, LOG_CHANNEL } = helpers;
        try {
            if (!targetInteraction || !targetInteraction.channel) {
                await safeReply(targetInteraction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione non valida')], flags: 1 << 6 });
                return;
            }
            const ticket = await Ticket.findOne({ channelId: targetInteraction.channel.id });
            if (!ticket) {
                await safeReply(targetInteraction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket non trovato')], flags: 1 << 6 });
                return;
            }
            const transcriptTXT = await createTranscript(targetInteraction.channel).catch(() => '');
            ticket.open = false;
            ticket.transcript = transcriptTXT;
            await ticket.save().catch(() => { });
            const createdAtFormatted = ticket.createdAt
                ? `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>`
                : 'Data non disponibile';
            const logChannel = targetInteraction.guild?.channels?.cache?.get(LOG_CHANNEL);
            if (logChannel) {
                await logChannel.send({
                    files: [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${targetInteraction.channel.id}.txt` }],
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Ticket Chiuso')
                            .setDescription(`**Aperto da:** <@${ticket.userId}>\n**Chiuso da:** ${targetInteraction.user}\n**Aperto il:** ${createdAtFormatted}\n**Claimato da:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Non claimato'}\n**Motivo:** ${motivo ? motivo : 'Nessun motivo inserito'}`)
                            .setColor('#6f4e37')
                    ],
                }).catch(err => global.logger.error(err));
            }
            const member = await targetInteraction.guild.members.fetch(ticket.userId).catch(() => null);
            if (member) {
                try {
                    await member.send({
                        files: [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${targetInteraction.channel.id}.txt` }],
                        embeds: [new EmbedBuilder().setTitle('Ticket Chiuso').setDescription(`**Aperto da:** <@${ticket.userId}>\n**Chiuso da:** ${targetInteraction.user}\n**Aperto il:** ${createdAtFormatted}\n**Claimato da:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Non claimato'}\n**Motivo:** ${motivo ? motivo : 'Nessun motivo inserito'}`).setColor('#6f4e37')]
                    })
                } catch (err) {
                    if (err.code !== 50007) {
                        global.logger.error(err);
                    }
                }
            }
            await Ticket.updateOne({ channelId: targetInteraction.channel.id }, { $set: { open: false, transcript: transcriptTXT, claimedBy: ticket.claimedBy || null, closeReason: motivo || null, closedAt: new Date() } }).catch(() => { });
            await safeEditReply(targetInteraction, { embeds: [new EmbedBuilder().setDescription("?? Il ticket verrà chiuso...").setColor('#6f4e37')]});
            setTimeout(() => {
                if (targetInteraction.channel) targetInteraction.channel.delete().catch(() => { });
            }, 2000);
        } catch (err) {
            global.logger.error(err);
            await safeReply(targetInteraction, { embeds: [makeErrorEmbed('Errore', "<:vegax:1443934876440068179> Errore durante la chiusura del ticket")], flags: 1 << 6 }).catch(() => { });
        }
    }
}

module.exports = { handleTicketInteraction };