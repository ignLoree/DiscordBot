const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const Ticket = require('../../Schemas/Ticket/ticketSchema');
const { createTranscript, createTranscriptHtml, saveTranscriptHtml } = require('../../Utils/Ticket/transcriptUtils');
const { safeReply: safeReplyHelper, safeEditReply: safeEditReplyHelper } = require('../../Utils/Moderation/reply');
const IDs = require('../../Utils/Config/ids');

async function handleTicketInteraction(interaction) {
    const handledButtons = new Set([
        'ticket_partnership',
        'ticket_highstaff',
        'ticket_supporto',
        'ticket_open_desc_modal',
        'claim_ticket',
        'close_ticket',
        'close_ticket_motivo',
        'accetta',
        'rifiuta',
        'unclaim'
    ]);
    const handledSelectMenus = new Set(['ticket_open_menu']);
    const handledModals = new Set(['modal_close_ticket', 'ticket_open_desc_modal_submit']);
    const selectedTicketAction = interaction.isStringSelectMenu && interaction.isStringSelectMenu() && handledSelectMenus.has(interaction.customId)
        ? interaction.values?.[0]
        : null;
    const ticketActionId = selectedTicketAction || interaction.customId;

    const isTicketButton = interaction.isButton && interaction.isButton() && handledButtons.has(interaction.customId);
    const isTicketSelect = interaction.isStringSelectMenu && interaction.isStringSelectMenu() && handledSelectMenus.has(interaction.customId);
    const isTicketModal = interaction.isModalSubmit && interaction.isModalSubmit() && handledModals.has(interaction.customId);
    if (!isTicketButton && !isTicketModal && !isTicketSelect) return false;
    const TICKETS_CATEGORY_NAME = '⁰⁰・ 　　　　    　    TICKETS 　　　    　    ・';
    const LOG_CHANNEL = IDs.channels.commandError;
    const ROLE_STAFF = IDs.roles.staff;
    const ROLE_HIGHSTAFF = IDs.roles.highStaff;
    const ROLE_PARTNERMANAGER = IDs.roles.partnerManager;
    const ROLE_USER = IDs.roles.user;
    const ROLE_TICKETPARTNER_BLACKLIST = IDs.roles.ticketPartnerBlacklist;
    const ROLE_TICKET_BLACKLIST = IDs.roles.ticketBlacklist;
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

    function normalizeCategoryName(name) {
        return String(name || '')
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[・`'".,;:!?\-_=+()[\]{}|/\\]/g, '');
    }

    function isTicketCategoryName(name) {
        const normalized = normalizeCategoryName(name);
        return normalized.includes('tickets');
    }

    function buildOverflowTicketCategoryName(index) {
        return `${TICKETS_CATEGORY_NAME} #${index}`;
    }

    async function createTicketsCategory(guild) {
        if (!guild) return null;
        if (!interaction.client.ticketCategoryCache) {
            interaction.client.ticketCategoryCache = new Map();
        }
        const getChildrenCount = (categoryId) => guild.channels.cache.filter((ch) => ch.parentId === categoryId).size;

        const cachedCategoryId = interaction.client.ticketCategoryCache.get(guild.id);
        if (cachedCategoryId) {
            const cachedCategory = guild.channels.cache.get(cachedCategoryId)
                || await guild.channels.fetch(cachedCategoryId).catch(() => null);
            if (cachedCategory && cachedCategory.type === 4) {
                if (isTicketCategoryName(cachedCategory.name)) {
                    const isFull = getChildrenCount(cachedCategory.id) >= 50;
                    if (!isFull) return cachedCategory;
                }
            }
        }

        await guild.channels.fetch().catch(() => null);
        const ticketCategories = guild.channels.cache
            .filter((ch) => ch.type === 4 && isTicketCategoryName(ch.name))
            .sort((a, b) => (a.rawPosition - b.rawPosition) || a.id.localeCompare(b.id));

        const exactCategory = ticketCategories.find((ch) => ch.name === TICKETS_CATEGORY_NAME);
        if (exactCategory) {
            if (getChildrenCount(exactCategory.id) < 50) {
                interaction.client.ticketCategoryCache.set(guild.id, exactCategory.id);
                return exactCategory;
            }
        } else if (ticketCategories.length > 0) {
            const firstTicketCategory = ticketCategories[0];
            await firstTicketCategory.setName(TICKETS_CATEGORY_NAME).catch(() => { });
            if (getChildrenCount(firstTicketCategory.id) < 50) {
                interaction.client.ticketCategoryCache.set(guild.id, firstTicketCategory.id);
                return firstTicketCategory;
            }
        }

        for (const category of ticketCategories) {
            if (category.name === TICKETS_CATEGORY_NAME) continue;
            if (getChildrenCount(category.id) < 50) {
                interaction.client.ticketCategoryCache.set(guild.id, category.id);
                return category;
            }
        }

        if (ticketCategories.length === 0) {
            const category = await guild.channels.create({
                name: TICKETS_CATEGORY_NAME,
                type: 4,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    }
                ]
            }).catch(() => null);
            if (!category) return null;
            await category.setPosition(0).catch(() => {});
            interaction.client.ticketCategoryCache.set(guild.id, category.id);
            return category;
        }

        const namesInUse = new Set(ticketCategories.map((ch) => String(ch.name || '')));
        let overflowIndex = 2;
        let overflowName = buildOverflowTicketCategoryName(overflowIndex);
        while (namesInUse.has(overflowName) && overflowIndex < 1000) {
            overflowIndex += 1;
            overflowName = buildOverflowTicketCategoryName(overflowIndex);
        }

        const category = await guild.channels.create({
            name: overflowName,
            type: 4,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                }
            ]
        }).catch(() => null);
        if (!category) return null;

        await category.setPosition(0).catch(() => {});
        interaction.client.ticketCategoryCache.set(guild.id, category.id);
        return category;
    }

    try {
        if (isTicketButton || isTicketSelect) {
            if (!interaction.guild || !interaction.member) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione non valida (fuori dal server).')], flags: 1 << 6 });
                return true;
            }
            const partnerOpenButtons = ['ticket_partnership'];
            if (partnerOpenButtons.includes(ticketActionId) && interaction.member?.roles?.cache?.has(ROLE_TICKETPARTNER_BLACKLIST)) {
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
            const ticketOpenButtons = ['ticket_partnership', 'ticket_supporto', 'ticket_highstaff'];
            if (ticketOpenButtons.includes(ticketActionId) && interaction.member?.roles?.cache?.has(ROLE_TICKET_BLACKLIST)) {
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
            const userOnlyTickets = ['ticket_partnership', 'ticket_highstaff'];
            if (userOnlyTickets.includes(ticketActionId) && !interaction.member?.roles?.cache?.has(ROLE_USER)) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Devi avere il ruolo **USER** per aprire questo ticket')], flags: 1 << 6 });
                return true;
            }
            const ticketConfig = {
                ticket_supporto: {
                    type: "supporto",
                    emoji: "⭐",
                    name: "supporto",
                    role: ROLE_STAFF,
                    requiredRoles: [],
                    embed: new EmbedBuilder()
                        .setTitle("<:vsl_ticket:1329520261053022208> • **__TICKET SUPPORTO__**")
                        .setDescription(`<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> 🠆 Attendi un membro dello **__\`STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Descrivi supporto, segnalazione o problema in modo chiaro.`)
                        .setColor("#6f4e37")
                },
                ticket_partnership: {
                    type: "partnership",
                    emoji: "🤝",
                    name: "partnership",
                    role: ROLE_PARTNERMANAGER,
                    requiredRoles: [ROLE_USER],
                    embed: new EmbedBuilder()
                        .setTitle("<:vsl_ticket:1329520261053022208> • **__TICKET PARTNERSHIP__**")
                        .setDescription(`<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> 🠆 Attendi un **__\`PARTNER MANAGER\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Manda la tua descrizione tramite il bottone nel messaggio qui sotto.`)
                        .setColor("#6f4e37")
                },
                ticket_highstaff: {
                    type: "high",
                    emoji: "✨",
                    name: "highstaff",
                    role: ROLE_HIGHSTAFF,
                    requiredRoles: [ROLE_USER],
                    embed: new EmbedBuilder()
                        .setTitle("<:vsl_ticket:1329520261053022208> • **__TICKET HIGH STAFF__**")
                        .setDescription(`<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> 🠆 Attendi un **__\`HIGH STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Specifica se riguarda Verifica Selfie, Donazioni, Sponsor o HighStaff.`)
                        .setColor("#6f4e37")
                }
            };
            const config = ticketConfig[ticketActionId];
            if (!config && ![
                'claim_ticket',
                'close_ticket',
                'close_ticket_motivo',
                'accetta',
                'rifiuta',
                'unclaim',
                'ticket_open_desc_modal'
            ].includes(interaction.customId)) {
                await safeReply(interaction, {
                    embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Categoria ticket non valida. Riprova dal pannello.')],
                    flags: 1 << 6
                });
                return true;
            }
            if (config) {
                if (!interaction.deferred && !interaction.replied) {
                    try {
                        await interaction.deferReply({ flags: 1 << 6 });
                    } catch (_) { }
                }
                if (!interaction.client.ticketOpenLocks) {
                    interaction.client.ticketOpenLocks = new Set();
                }
                const ticketLockKey = `${interaction.guild.id}:${interaction.user.id}`;
                if (interaction.client.ticketOpenLocks.has(ticketLockKey)) {
                    await safeReply(interaction, {
                        embeds: [makeErrorEmbed('Attendi', '<:attentionfromvega:1443651874032062505> Sto già aprendo un ticket per te, aspetta un attimo.')],
                        flags: 1 << 6
                    });
                    return true;
                }
                interaction.client.ticketOpenLocks.add(ticketLockKey);
                try {
                if (['ticket_partnership', 'ticket_highstaff', 'accetta', 'rifiuta', 'unclaim'].includes(ticketActionId) && !interaction.member?.roles?.cache?.has(ROLE_USER)) {
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
                const ticketsCategory = await createTicketsCategory(interaction.guild);
                if (!ticketsCategory) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Impossibile creare o trovare la categoria ticket')], flags: 1 << 6 });
                    return true;
                }
                const channel = await interaction.guild.channels.create({
                    name: `༄${config.emoji}︲${config.name}᲼${interaction.user.username}`,
                    type: 0,
                    parent: ticketsCategory.id,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.roles.everyone,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: interaction.user.id,
                            allow: TICKET_PERMISSIONS
                        },
                        ...(config.type === 'supporto'
                            ? [
                                {
                                    id: ROLE_STAFF,
                                    allow: TICKET_PERMISSIONS
                                },
                                {
                                    id: ROLE_HIGHSTAFF,
                                    allow: TICKET_PERMISSIONS
                                },
                                {
                                    id: ROLE_PARTNERMANAGER,
                                    deny: [PermissionFlagsBits.ViewChannel]
                                }
                            ]
                            : []),
                        ...(config.type === 'partnership'
                            ? [
                                {
                                    id: ROLE_PARTNERMANAGER,
                                    allow: TICKET_PERMISSIONS
                                },
                                {
                                    id: ROLE_HIGHSTAFF,
                                    allow: [
                                        PermissionFlagsBits.ViewChannel,
                                        PermissionFlagsBits.SendMessages,
                                        PermissionFlagsBits.ReadMessageHistory
                                    ],
                                    deny: []
                                },
                                {
                                    id: ROLE_STAFF,
                                    deny: [PermissionFlagsBits.ViewChannel]
                                }
                            ]
                            : []),
                        ...(config.type === 'high'
                            ? [
                                {
                                    id: ROLE_HIGHSTAFF,
                                    allow: TICKET_PERMISSIONS
                                },
                                {
                                    id: ROLE_STAFF,
                                    deny: [PermissionFlagsBits.ViewChannel]
                                },
                                {
                                    id: ROLE_PARTNERMANAGER,
                                    deny: [PermissionFlagsBits.ViewChannel]
                                }
                            ]
                            : [])
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
                    new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Chiudi").setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId("close_ticket_motivo").setLabel("📝 Chiudi Con Motivo").setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId("claim_ticket").setLabel("✅ Claim").setStyle(ButtonStyle.Success)
                );
                const mainMsg = await channel.send({ embeds: [config.embed], components: [row] }).catch(err => {
                    global.logger.error(err);
                    return null;
                });
                const descriptionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_open_desc_modal')
                        .setLabel('📝 Invia Descrizione')
                        .setStyle(ButtonStyle.Primary)
                );
                const descriptionPrompt = await channel.send({
                    content: `<@${interaction.user.id}> usa il pulsante qui sotto per inviare la descrizione del ticket.`,
                    components: [descriptionRow]
                }).catch(() => null);
                await Ticket.create({
                    userId: interaction.user.id,
                    channelId: channel.id,
                    ticketType: config.type,
                    open: true,
                    messageId: mainMsg?.id || null,
                    descriptionPromptMessageId: descriptionPrompt?.id || null,
                    descriptionSubmitted: false
                }).catch(err => global.logger.error(err));
                let tagRole = config.type === 'partnership' ? ROLE_PARTNERMANAGER : config.role;
                const mentionMsg = await channel.send(`<@${interaction.user.id}> ${tagRole ? `<@&${tagRole}>` : ''}`).catch(() => null);
                if (mentionMsg) {
                    setTimeout(() => {
                        mentionMsg.delete().catch(() => { });
                    }, 100);
                }
                await safeEditReply(interaction, { embeds: [new EmbedBuilder().setTitle('<:vegacheckmark:1443666279058772028> Ticket Creato').setDescription(`Aperto un nuovo ticket: ${channel}`).setColor('#6f4e37')], flags: 1 << 6 });
                return true;
                } finally {
                    interaction.client.ticketOpenLocks.delete(ticketLockKey);
                }
            }
            if (interaction.customId === 'claim_ticket') {
                if (!interaction.channel) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione fuori canale')], flags: 1 << 6 });
                    return true;
                }
                const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticket) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket non trovato')], flags: 1 << 6 });
                    return true;
                }
                const canClaimSupport = ticket.ticketType === 'supporto' && STAFF_ROLES.some(r => interaction.member?.roles?.cache?.has(r));
                const canClaimPartnership = ticket.ticketType === 'partnership'
                    && (interaction.member?.roles?.cache?.has(ROLE_PARTNERMANAGER) || interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF));
                const canClaimHigh = ticket.ticketType === 'high' && interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF);
                if (!canClaimSupport && !canClaimPartnership && !canClaimHigh) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo lo staff può claimare i ticket')], flags: 1 << 6 });
                    return true;
                }
                if (ticket.userId === interaction.user.id) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Non puoi claimare il ticket che hai aperto tu.')], flags: 1 << 6 });
                    return true;
                }
                if (ticket.claimedBy) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket già claimato')], flags: 1 << 6 });
                    return true;
                }
                const claimedTicket = await Ticket.findOneAndUpdate(
                    {
                        channelId: interaction.channel.id,
                        $or: [{ claimedBy: null }, { claimedBy: { $exists: false } }]
                    },
                    { $set: { claimedBy: interaction.user.id } },
                    { new: true }
                ).catch(() => null);
                if (!claimedTicket) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket già claimato')], flags: 1 << 6 });
                    return true;
                }
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
                        if (ticket.ticketType === 'supporto') {
                            for (const r of STAFF_ROLES) {
                                await interaction.channel.permissionOverwrites.edit(r, {
                                    ViewChannel: true,
                                    SendMessages: false,
                                    ReadMessageHistory: true
                                });
                            }
                        }
                        if (ticket.ticketType === 'partnership') {
                            await interaction.channel.permissionOverwrites.edit(ROLE_PARTNERMANAGER, {
                                ViewChannel: true,
                                SendMessages: false,
                                ReadMessageHistory: true
                            });
                            await interaction.channel.permissionOverwrites.edit(ROLE_HIGHSTAFF, {
                                ViewChannel: true,
                                SendMessages: false,
                                ReadMessageHistory: true
                            });
                        } else if (ticket.ticketType === 'high') {
                            await interaction.channel.permissionOverwrites.edit(ROLE_HIGHSTAFF, {
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
                    new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Chiudi").setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId("close_ticket_motivo").setLabel("📝 Chiudi con motivo").setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId("unclaim").setLabel("🔓 Unclaim").setStyle(ButtonStyle.Secondary)
                );
                try {
                    if (interaction.channel && claimedTicket.messageId) {
                        const msg = await interaction.channel.messages.fetch(claimedTicket.messageId).catch(() => null);
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
                await safeReply(interaction, { embeds: [new EmbedBuilder().setTitle('Ticket Claimato').setDescription(`Ticket preso in carico da <@${claimedTicket.claimedBy}>`).setColor('#6f4e37')] });
                return true;
            }
            if (interaction.customId === 'ticket_open_desc_modal') {
                if (!interaction.channel) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione fuori canale')], flags: 1 << 6 });
                    return true;
                }
                const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticketDoc) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket non trovato')], flags: 1 << 6 });
                    return true;
                }
                if (interaction.user.id !== ticketDoc.userId) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo chi ha aperto il ticket può inviare la descrizione.')], flags: 1 << 6 });
                    return true;
                }
                if (ticketDoc.descriptionSubmitted) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Hai già inviato la descrizione iniziale.')], flags: 1 << 6 });
                    return true;
                }
                const modal = new ModalBuilder().setCustomId('ticket_open_desc_modal_submit').setTitle('Descrizione Ticket');
                const input = new TextInputBuilder()
                    .setCustomId('ticket_description')
                    .setLabel('Inserisci la descrizione')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMinLength(8)
                    .setMaxLength(1000);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal).catch(err => {
                    global.logger.error(err);
                });
                return true;
            }
            if (interaction.customId === 'unclaim') {
                if (!interaction.channel) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione fuori canale')], flags: 1 << 6 });
                    return true;
                }
                const ticketButtonsOriginal = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Chiudi').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('close_ticket_motivo').setLabel('📝 Chiudi Con Motivo').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('claim_ticket').setLabel('✅ Claim').setStyle(ButtonStyle.Success)
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
                const unclaimedTicket = await Ticket.findOneAndUpdate(
                    { channelId: interaction.channel.id, claimedBy: interaction.user.id },
                    { $set: { claimedBy: null } },
                    { new: true }
                ).catch(() => null);
                if (!unclaimedTicket) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo chi ha claimato può unclaimare il ticket.')], flags: 1 << 6 });
                    return true;
                }
                try {
                    if (interaction.channel && unclaimedTicket.messageId) {
                        const msg = await interaction.channel.messages.fetch(unclaimedTicket.messageId).catch(() => null);
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
                const ticketDoc = await Ticket.findOne({ channelId: interaction.channel?.id });
                if (!ticketDoc) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket non trovato')], flags: 1 << 6 });
                    return true;
                }
                if (ticketDoc && ticketDoc.userId === interaction.user.id) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Non puoi chiudere da solo il ticket che hai aperto.')], flags: 1 << 6 });
                    return true;
                }
                const canCloseSupport = ticketDoc.ticketType === 'supporto' && STAFF_ROLES.some(r => interaction.member?.roles?.cache?.has(r));
                const canClosePartnership = ticketDoc.ticketType === 'partnership'
                    && (interaction.member?.roles?.cache?.has(ROLE_PARTNERMANAGER) || interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF));
                const canCloseHigh = ticketDoc.ticketType === 'high' && interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF);
                if (!canCloseSupport && !canClosePartnership && !canCloseHigh) {
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
                const ticketDoc = await Ticket.findOne({ channelId: interaction.channel?.id });
                if (!ticketDoc) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket non trovato')], flags: 1 << 6 });
                    return true;
                }
                if (ticketDoc && ticketDoc.userId === interaction.user.id) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Non puoi chiudere da solo il ticket che hai aperto.')], flags: 1 << 6 });
                    return true;
                }
                const canCloseSupport = ticketDoc.ticketType === 'supporto' && STAFF_ROLES.some(r => interaction.member?.roles?.cache?.has(r));
                const canClosePartnership = ticketDoc.ticketType === 'partnership'
                    && (interaction.member?.roles?.cache?.has(ROLE_PARTNERMANAGER) || interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF));
                const canCloseHigh = ticketDoc.ticketType === 'high' && interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF);
                if (!canCloseSupport && !canClosePartnership && !canCloseHigh) {
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
                const canHandleCloseRequest = interaction.user.id === ticketDoc.userId || interaction.user.id === ticketDoc.claimedBy;
                if (!canHandleCloseRequest) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo opener o claimer possono gestire questa richiesta.')], flags: 1 << 6 });
                    return true;
                }
                const channel = interaction.channel;
                const transcriptTXT = await createTranscript(channel).catch(() => '');
                const transcriptHTML = await createTranscriptHtml(channel).catch(() => '');
                const transcriptHtmlPath = transcriptHTML
                    ? await saveTranscriptHtml(channel, transcriptHTML).catch(() => null)
                    : null;
                const createdAtFormatted = ticketDoc.createdAt
                    ? `<t:${Math.floor(ticketDoc.createdAt.getTime() / 1000)}:F>`
                    : 'Data non disponibile';
                const motivo = ticketDoc.closeReason || 'Nessun motivo inserito';
                const logChannel = interaction.guild.channels.cache.get(IDs.channels.ticketCloseLogAlt);
                if (logChannel) {
                    await logChannel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Ticket Chiuso')
                                .setDescription(`\n**Aperto da:** <@${ticketDoc.userId}>\n**Chiuso da:** ${interaction.user}\n**Creato il:** ${createdAtFormatted}\n**Claimato da:** ${ticketDoc.claimedBy ? `<@${ticketDoc.claimedBy}>` : 'Non claimato'}\n**Motivo:** ${motivo}\n`)
                                .setColor('#6f4e37')
                        ],
                        files: transcriptHtmlPath
                            ? [{ attachment: transcriptHtmlPath, name: `transcript_${channel.id}.html` }]
                            : [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${channel.id}.txt` }]
                    }).catch(() => { });
                }
                try {
                    const member = await interaction.guild.members.fetch(ticketDoc.userId).catch(() => null);
                    if (member) {
                        await member.send({
                            embeds: [new EmbedBuilder().setTitle('Ticket Chiuso').setDescription(`**Aperto da:** <@${ticketDoc.userId}>\n**Chiuso da:** ${interaction.user}\n**Creato il:** ${createdAtFormatted}\n**Claimato da:** ${ticketDoc.claimedBy ? `<@${ticketDoc.claimedBy}>` : 'Non claimato'}\n**Motivo:** ${motivo}\n`).setColor('#6f4e37')],
                            files: transcriptHtmlPath
                                ? [{ attachment: transcriptHtmlPath, name: `transcript_${channel.id}.html` }]
                                : [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${channel.id}.txt` }]
                        }).catch(() => { });
                    }
                } catch (err) { global.logger.error(err); }
                await Ticket.updateOne({ channelId: channel.id }, { $set: { open: false, transcript: transcriptTXT, closeReason: motivo, closedAt: new Date() } }).catch(() => { });
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
                const canHandleCloseRequest = interaction.user.id === ticketDoc.userId || interaction.user.id === ticketDoc.claimedBy;
                if (!canHandleCloseRequest) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo opener o claimer possono gestire questa richiesta.')], flags: 1 << 6 });
                    return true;
                }
                await interaction.update({ embeds: [new EmbedBuilder().setTitle('Richiesta di chiusura').setDescription(`<:vegax:1443934876440068179> ${interaction.user} ha rifiutato la richiesta di chiusura`).setColor('Red')], components: [] }).catch(() => { });
                return true;
            }
        }
        if (isTicketModal && interaction.customId === 'ticket_open_desc_modal_submit') {
            if (!interaction.channel) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione fuori canale')], flags: 1 << 6 });
                return true;
            }
            try {
                await interaction.deferReply({ flags: 1 << 6 });
            } catch (_) { }
            const description = interaction.fields.getTextInputValue('ticket_description')?.trim();
            const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id });
            if (!ticketDoc) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket non trovato')], flags: 1 << 6 });
                return true;
            }
            if (interaction.user.id !== ticketDoc.userId) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo chi ha aperto il ticket può inviare la descrizione.')], flags: 1 << 6 });
                return true;
            }
            const updatedTicket = await Ticket.findOneAndUpdate(
                { channelId: interaction.channel.id, descriptionSubmitted: { $ne: true } },
                {
                    $set: {
                        descriptionSubmitted: true,
                        descriptionText: description,
                        descriptionSubmittedAt: new Date()
                    }
                },
                { new: true }
            ).catch(() => null);
            if (!updatedTicket) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> La descrizione è già stata inviata.')], flags: 1 << 6 });
                return true;
            }

            const chunks = [];
            const maxChunkLen = 3900;
            for (let i = 0; i < description.length; i += maxChunkLen) {
                chunks.push(description.slice(i, i + maxChunkLen));
            }
            const descriptionEmbeds = chunks.map((chunk, index) => {
                const embed = new EmbedBuilder()
                    .setColor('#6f4e37')
                    .setDescription(`\`\`\`\n${chunk}\n\`\`\``);
                return embed;
            });
            if (descriptionEmbeds.length > 0) {
                await interaction.channel.send({ embeds: descriptionEmbeds }).catch(() => { });
            }

            const promptId = updatedTicket.descriptionPromptMessageId || ticketDoc.descriptionPromptMessageId || null;
            if (promptId) {
                const promptMessage = await interaction.channel.messages.fetch(promptId).catch(() => null);
                if (promptMessage) {
                    await promptMessage.delete().catch(() => { });
                }
            }
            await interaction.deleteReply().catch(() => { });
            return true;
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
            const transcriptHTML = await createTranscriptHtml(targetInteraction.channel).catch(() => '');
            const transcriptHtmlPath = transcriptHTML
                ? await saveTranscriptHtml(targetInteraction.channel, transcriptHTML).catch(() => null)
                : null;
            ticket.open = false;
            ticket.transcript = transcriptTXT;
            await ticket.save().catch(() => { });
            const createdAtFormatted = ticket.createdAt
                ? `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>`
                : 'Data non disponibile';
            const logChannel = targetInteraction.guild?.channels?.cache?.get(LOG_CHANNEL);
            if (logChannel) {
                await logChannel.send({
                    files: transcriptHtmlPath
                        ? [{ attachment: transcriptHtmlPath, name: `transcript_${targetInteraction.channel.id}.html` }]
                        : [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${targetInteraction.channel.id}.txt` }],
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
                        files: transcriptHtmlPath
                            ? [{ attachment: transcriptHtmlPath, name: `transcript_${targetInteraction.channel.id}.html` }]
                            : [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${targetInteraction.channel.id}.txt` }],
                        embeds: [new EmbedBuilder().setTitle('Ticket Chiuso').setDescription(`**Aperto da:** <@${ticket.userId}>\n**Chiuso da:** ${targetInteraction.user}\n**Aperto il:** ${createdAtFormatted}\n**Claimato da:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Non claimato'}\n**Motivo:** ${motivo ? motivo : 'Nessun motivo inserito'}`).setColor('#6f4e37')]
                    })
                } catch (err) {
                    if (err.code !== 50007) {
                        global.logger.error(err);
                    }
                }
            }
            await Ticket.updateOne({ channelId: targetInteraction.channel.id }, { $set: { open: false, transcript: transcriptTXT, claimedBy: ticket.claimedBy || null, closeReason: motivo || null, closedAt: new Date() } }).catch(() => { });
            await safeEditReply(targetInteraction, { embeds: [new EmbedBuilder().setDescription("🔒 Il ticket verrà chiuso...").setColor('#6f4e37')]});
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
