const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const Ticket = require('../../Schemas/Ticket/ticketSchema');
const { createTranscript, createTranscriptHtml, saveTranscriptHtml } = require('../../Utils/Ticket/transcriptUtils');
const { TICKETS_CATEGORY_NAME, buildOverflowTicketCategoryName } = require('../../Utils/Ticket/ticketCategoryUtils');
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
    const isHandledTicketModalId = (id) =>
        id === 'modal_close_ticket'
        || id.startsWith('modal_close_ticket:')
        || id === 'ticket_open_desc_modal_submit'
        || id.startsWith('ticket_open_desc_modal_submit:');
    const selectedTicketAction = interaction.isStringSelectMenu && interaction.isStringSelectMenu() && handledSelectMenus.has(interaction.customId)
        ? interaction.values?.[0]
        : null;
    const ticketActionId = selectedTicketAction || interaction.customId;

    const isTicketButton = interaction.isButton && interaction.isButton() && handledButtons.has(interaction.customId);
    const isTicketSelect = interaction.isStringSelectMenu && interaction.isStringSelectMenu() && handledSelectMenus.has(interaction.customId);
    const isTicketModal = interaction.isModalSubmit && interaction.isModalSubmit() && isHandledTicketModalId(String(interaction.customId || ''));
    if (!isTicketButton && !isTicketModal && !isTicketSelect) return false;
    const LOG_CHANNEL = IDs.channels.ticketLogs;
    const guildId = interaction.guild?.id;
    const sponsorStaffRole = (IDs.roles?.sponsorStaffRoleIds || {})[guildId] || null;
    const ROLE_STAFF = sponsorStaffRole;
    const ROLE_HIGHSTAFF = sponsorStaffRole;
    const ROLE_PARTNERMANAGER = sponsorStaffRole;
    const ROLE_USER = null;
    const ROLE_TICKETPARTNER_BLACKLIST = '0';
    const ROLE_TICKET_BLACKLIST = '0';
    const STAFF_ROLES = sponsorStaffRole ? [sponsorStaffRole] : [];
    const hasAdmin = (m) => Boolean(m?.permissions?.has(PermissionFlagsBits.Administrator));
    const hasStaffLikePermission = (m) => !m ? false : (
        m.permissions.has(PermissionFlagsBits.Administrator) ||
        m.permissions.has(PermissionFlagsBits.ManageChannels) ||
        m.permissions.has(PermissionFlagsBits.ManageGuild)
    );
    if (!interaction.client.ticketCloseLocks) {
        interaction.client.ticketCloseLocks = new Set();
    }
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

    async function sendTranscriptWithBrowserLink(target, payload, hasHtml) {
        if (!target?.send) return null;
        const sent = await target.send(payload).catch(() => null);
        if (!sent || !hasHtml) return sent;
        const attachment = sent.attachments?.find((att) => {
            const name = String(att?.name || '').toLowerCase();
            const url = String(att?.url || '').toLowerCase();
            return name.endsWith('.html') || url.includes('.html');
        });
        if (attachment?.url) {
            const baseContent = typeof payload?.content === 'string' ? payload.content.trim() : '';
            const transcriptButton = new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setURL(attachment.url)
                .setLabel('View Online Transcript')
                .setEmoji('📁');
            const row = new ActionRowBuilder().addComponents(transcriptButton);
            await sent.edit({
                content: baseContent || undefined,
                components: [row]
            }).catch(() => { });
        }
        return sent;
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

    function sanitizeTicketDescriptionInput(value) {
        let text = String(value || '');
        text = text
            .replace(/^```(?:[a-zA-Z0-9_-]+)?\n?/i, '')
            .replace(/```$/i, '')
            .replace(/<@!?\d+>/g, '')
            .replace(/<@&\d+>/g, '')
            .replace(/<#\d+>/g, '')
            .replace(/@everyone|@here/gi, '')
            .replace(/https?:\/\/(?!discord(?:app)?\.com\/invite\/|discord\.gg\/)\S+/gi, '');

        const normalizedLines = text
            .split(/\r?\n/)
            .map((line) => line.replace(/\s+/g, ' ').trim())
            .filter((line, index, arr) => line.length > 0 || (index > 0 && arr[index - 1]?.length > 0));

        return normalizedLines.join('\n').trim();
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
            const nameAlreadyUsed = guild.channels.cache.some(
                (ch) => ch.type === 4 && ch.id !== firstTicketCategory.id && ch.name === TICKETS_CATEGORY_NAME
            );
            if (!nameAlreadyUsed) {
                await firstTicketCategory.setName(TICKETS_CATEGORY_NAME).catch(() => { });
            }
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
            const existingWithExactName = guild.channels.cache.find(
                (ch) => ch.type === 4 && ch.name === TICKETS_CATEGORY_NAME
            );
            if (existingWithExactName && getChildrenCount(existingWithExactName.id) < 50) {
                interaction.client.ticketCategoryCache.set(guild.id, existingWithExactName.id);
                return existingWithExactName;
            }
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
                            .setDescription(`<:vegax:1443934876440068179> Non puoi usare questo bottone poichè sei blacklistato dalle partner. Se pensi sia un errore apri un <#1442569095068254219> \`Terza Categoria\``)
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
            if (ROLE_USER != null && !hasAdmin(interaction.member) && userOnlyTickets.includes(ticketActionId) && !interaction.member?.roles?.cache?.has(ROLE_USER)) {
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
                    requiredRoles: ROLE_USER ? [ROLE_USER] : [],
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
                    requiredRoles: ROLE_USER ? [ROLE_USER] : [],
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
                        await interaction.deferReply({ flags: 1 << 6 }).catch(() => {});
                    } catch { }
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
                if (ROLE_USER != null && !hasAdmin(interaction.member) && ['ticket_partnership', 'ticket_highstaff', 'accetta', 'rifiuta', 'unclaim'].includes(ticketActionId) && !interaction.member?.roles?.cache?.has(ROLE_USER)) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Devi avere il ruolo **USER** per aprire questo ticket')], flags: 1 << 6 });
                    return true;
                }
                if (!hasAdmin(interaction.member) && config.requiredRoles?.length > 0) {
                    const hasRole = config.requiredRoles.some(r => interaction.member?.roles?.cache?.has(r));
                    if (!hasRole) {
                        await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Non hai i requisiti per aprire questo ticket')], flags: 1 << 6 });
                        return true;
                    }
                }
                const existing = await Ticket.findOne({
                    guildId: interaction.guild.id,
                    userId: interaction.user.id,
                    open: true
                });
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
                    ].filter(o => o && o.id != null && o.id !== '')
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
                const existingAgain = await Ticket.findOne({
                    guildId: interaction.guild.id,
                    userId: interaction.user.id,
                    open: true
                });
                if (existingAgain) {
                    await channel.delete().catch(() => {});
                    await safeEditReply(interaction, { embeds: [new EmbedBuilder().setTitle('Ticket Aperto').setDescription(`<:vegax:1443934876440068179> Hai già un ticket aperto: <#${existingAgain.channelId}>`).setColor('#6f4e37')], flags: 1 << 6 });
                    return true;
                }
                let descriptionPrompt = null;
                if (config.type === 'partnership') {
                    const descriptionRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('ticket_open_desc_modal')
                            .setLabel('📝 Invia Descrizione')
                            .setStyle(ButtonStyle.Primary)
                    );
                    descriptionPrompt = await channel.send({
                        content: `<@${interaction.user.id}> usa il pulsante qui sotto per inviare la descrizione.`,
                        components: [descriptionRow]
                    }).catch(() => null);
                }
                let ticketCreated = false;
                try {
                    await Ticket.create({
                        guildId: interaction.guild.id,
                        userId: interaction.user.id,
                        channelId: channel.id,
                        ticketType: config.type,
                        open: true,
                        messageId: mainMsg?.id || null,
                        descriptionPromptMessageId: descriptionPrompt?.id || null,
                        descriptionSubmitted: false
                    });
                    ticketCreated = true;
                } catch (err) {
                    const isDuplicate = err?.code === 11000 || (err?.message && String(err.message).includes('E11000'));
                    if (isDuplicate) {
                        await channel.delete().catch(() => {});
                        const other = await Ticket.findOne({ guildId: interaction.guild.id, userId: interaction.user.id, open: true }).catch(() => null);
                        await safeEditReply(interaction, { embeds: [new EmbedBuilder().setTitle('Ticket Aperto').setDescription(`<:vegax:1443934876440068179> Hai già un ticket aperto${other?.channelId ? ': <#' + other.channelId + '>' : '.'}`).setColor('#6f4e37')], flags: 1 << 6 });
                        return true;
                    }
                    global.logger.error(err);
                }
                if (!ticketCreated) {
                    await channel.delete().catch(() => {});
                    await safeEditReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Impossibile creare il ticket, riprova.')], flags: 1 << 6 });
                    return true;
                }
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
                const canClaimByAdmin = hasAdmin(interaction.member);
                const canClaimByPerms = hasStaffLikePermission(interaction.member);
                if (!canClaimSupport && !canClaimPartnership && !canClaimHigh && !canClaimByAdmin && !canClaimByPerms) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo lo staff può claimare i ticket')], flags: 1 << 6 });
                    return true;
                }
                if (ticket.userId === interaction.user.id) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Non puoi claimare il ticket che hai aperto tu.')], flags: 1 << 6 });
                    return true;
                }
                const claimedByVal = ticket.claimedBy != null ? String(ticket.claimedBy).trim() : '';
                if (claimedByVal !== '') {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket già claimato')], flags: 1 << 6 });
                    return true;
                }
                let claimedTicket = await Ticket.findOneAndUpdate(
                    {
                        channelId: interaction.channel.id,
                        $or: [
                            { claimedBy: null },
                            { claimedBy: { $exists: false } },
                            { claimedBy: '' }
                        ]
                    },
                    { $set: { claimedBy: interaction.user.id } },
                    { new: true }
                ).catch(() => null);
                if (!claimedTicket) {
                    await Ticket.updateOne(
                        { channelId: interaction.channel.id },
                        { $set: { claimedBy: interaction.user.id } }
                    ).catch(() => null);
                    claimedTicket = await Ticket.findOne({ channelId: interaction.channel.id }).catch(() => null);
                    if (!claimedTicket) {
                        await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket già claimato')], flags: 1 << 6 });
                        return true;
                    }
                }
                if (interaction.channel) {
                    try {
                        if (ticket.userId) {
                            await interaction.channel.permissionOverwrites.edit(ticket.userId, {
                                ViewChannel: true,
                                SendMessages: true,
                                EmbedLinks: true,
                                AttachFiles: true,
                                ReadMessageHistory: true,
                                AddReactions: true
                            });
                        }
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
                                if (r) {
                                    await interaction.channel.permissionOverwrites.edit(r, {
                                        ViewChannel: true,
                                        SendMessages: false,
                                        ReadMessageHistory: true
                                    });
                                }
                            }
                        }
                        if (ticket.ticketType === 'partnership') {
                            if (ROLE_PARTNERMANAGER) {
                                await interaction.channel.permissionOverwrites.edit(ROLE_PARTNERMANAGER, {
                                    ViewChannel: true,
                                    SendMessages: false,
                                    ReadMessageHistory: true
                                });
                            }
                            if (ROLE_HIGHSTAFF) {
                                await interaction.channel.permissionOverwrites.edit(ROLE_HIGHSTAFF, {
                                    ViewChannel: true,
                                    SendMessages: false,
                                    ReadMessageHistory: true
                                });
                            }
                        } else if (ticket.ticketType === 'high') {
                            if (ROLE_HIGHSTAFF) {
                                await interaction.channel.permissionOverwrites.edit(ROLE_HIGHSTAFF, {
                                    ViewChannel: true,
                                    SendMessages: false,
                                    ReadMessageHistory: true
                                });
                            }
                        } else if (ROLE_PARTNERMANAGER) {
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
                const modal = new ModalBuilder().setCustomId(`ticket_open_desc_modal_submit:${interaction.user.id}`).setTitle('Descrizione Ticket');
                const input = new TextInputBuilder()
                    .setCustomId('ticket_description')
                    .setLabel('Inserisci la descrizione')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMinLength(8)
                    .setMaxLength(4000);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                const shown = await interaction.showModal(modal).then(() => true).catch(err => {
                    global.logger.error(err);
                    return false;
                });
                if (!shown) {
                    await safeReply(interaction, {
                        embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Impossibile aprire il modulo, riprova.')],
                        flags: 1 << 6
                    });
                }
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
                if (ticketDoc.userId === interaction.user.id) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Chi ha aperto il ticket non può usare questo pulsante.')], flags: 1 << 6 });
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
                if (!ticketDoc.claimedBy) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Questo ticket non è claimato.')], flags: 1 << 6 });
                    return true;
                }
                if (ticketDoc.claimedBy !== interaction.user.id) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo chi ha claimato il ticket può chiuderlo.')], flags: 1 << 6 });
                    return true;
                }
                const modal = new ModalBuilder().setCustomId(`modal_close_ticket:${interaction.user.id}`).setTitle('Chiudi Ticket con Motivo');
                const input = new TextInputBuilder().setCustomId('motivo').setLabel('Motivo della chiusura').setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                const shown = await interaction.showModal(modal).then(() => true).catch(err => {
                    global.logger.error(err);
                    return false;
                });
                if (!shown) {
                    await safeReply(interaction, {
                        embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Impossibile aprire il modulo, riprova.')],
                        flags: 1 << 6
                    });
                }
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
                if (!ticketDoc.claimedBy) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Questo ticket non è claimato.')], flags: 1 << 6 });
                    return true;
                }
                if (ticketDoc.claimedBy !== interaction.user.id) {
                    await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo chi ha claimato il ticket può chiuderlo.')], flags: 1 << 6 });
                    return true;
                }
                try { await interaction.deferReply({ flags: 1 << 6 }).catch(() => {}).catch(() => { }); } catch { }
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
                try { await interaction.deferReply({ flags: 1 << 6 }).catch(() => {}).catch(() => { }); } catch { }
                const motivo = ticketDoc.closeReason || 'Nessun motivo inserito';
                await closeTicket(interaction, motivo, { safeReply, safeEditReply, makeErrorEmbed, LOG_CHANNEL });
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
        if (isTicketModal && String(interaction.customId || '').startsWith('ticket_open_desc_modal_submit')) {
            if (!interaction.channel) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione fuori canale')], flags: 1 << 6 });
                return true;
            }
            try {
                await interaction.deferReply({ flags: 1 << 6 }).catch(() => {});
            } catch { }
            const rawDescription = interaction.fields.getTextInputValue('ticket_description')?.trim();
            const description = sanitizeTicketDescriptionInput(rawDescription);
            const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id });
            if (!ticketDoc) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket non trovato')], flags: 1 << 6 });
                return true;
            }
            if (interaction.user.id !== ticketDoc.userId) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo chi ha aperto il ticket può inviare la descrizione.')], flags: 1 << 6 });
                return true;
            }
            if (!description) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Dopo il filtro non c\'è testo valido da inviare.')], flags: 1 << 6 });
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
            const managerFooter = `\n\nManager: <@${interaction.user.id}>`;
            const maxChunkLen = 1900;
            for (let i = 0; i < description.length; i += maxChunkLen) {
                chunks.push(description.slice(i, i + maxChunkLen));
            }
            if (chunks.length === 0) chunks.push(description);
            if (chunks.length > 0) {
                for (let i = 0; i < chunks.length; i += 1) {
                    const isLast = i === chunks.length - 1;
                    const content = isLast ? `${chunks[i]}${managerFooter}` : chunks[i];
                    await interaction.channel.send({ content }).catch(() => { });
                }
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
        if (isTicketModal && String(interaction.customId || '').startsWith('modal_close_ticket')) {
            try { await interaction.deferReply({ flags: 1 << 6 }).catch(() => {}).catch(() => { }); } catch { }
            const ticketDoc = await Ticket.findOne({ channelId: interaction.channel?.id });
            if (!ticketDoc) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Ticket non trovato')], flags: 1 << 6 });
                return true;
            }
            if (ticketDoc.userId === interaction.user.id) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Non puoi chiudere da solo il ticket che hai aperto.')], flags: 1 << 6 });
                return true;
            }
            if (!ticketDoc.claimedBy) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Questo ticket non è claimato.')], flags: 1 << 6 });
                return true;
            }
            if (ticketDoc.claimedBy !== interaction.user.id) {
                await safeReply(interaction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Solo chi ha claimato il ticket può chiuderlo.')], flags: 1 << 6 });
                return true;
            }
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
        const closeLockKey = `${targetInteraction?.guildId || 'noguild'}:${targetInteraction?.channelId || targetInteraction?.channel?.id || 'nochannel'}`;
        if (interaction.client.ticketCloseLocks.has(closeLockKey)) {
            await safeReply(targetInteraction, {
                embeds: [makeErrorEmbed('Attendi', '<:attentionfromvega:1443651874032062505> Chiusura ticket già in corso, attendi un attimo.')],
                flags: 1 << 6
            });
            return;
        }
        interaction.client.ticketCloseLocks.add(closeLockKey);
        try {
            if (!targetInteraction || !targetInteraction.channel) {
                await safeReply(targetInteraction, { embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Interazione non valida')], flags: 1 << 6 });
                return;
            }
            // Atomic close: only one closer sends transcript (avoids duplicate from prefix+button or duplicate events)
            const ticket = await Ticket.findOneAndUpdate(
                { channelId: targetInteraction.channel.id, open: true },
                { $set: { open: false, closedAt: new Date() } },
                { new: true }
            );
            if (!ticket) {
                await safeReply(targetInteraction, { embeds: [makeErrorEmbed('Info', '<:attentionfromvega:1443651874032062505> Ticket già chiuso o chiusura già in corso.')], flags: 1 << 6 });
                return;
            }
            const transcriptTXT = await createTranscript(targetInteraction.channel).catch(() => '');
            const transcriptHTML = await createTranscriptHtml(targetInteraction.channel).catch(() => '');
            const transcriptHtmlPath = transcriptHTML
                ? await saveTranscriptHtml(targetInteraction.channel, transcriptHTML).catch(() => null)
                : null;
            await Ticket.updateOne(
                { channelId: targetInteraction.channel.id },
                { $set: { transcript: transcriptTXT, closeReason: motivo || null, claimedBy: ticket.claimedBy || null } }
            ).catch(() => { });
            const createdAtFormatted = ticket.createdAt
                ? `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>`
                : 'Data non disponibile';
            // Always send transcripts to the MAIN guild log channel, even when the ticket is in sponsor servers.
            const IDs = require('../../Utils/Config/ids');
            const mainGuildId = IDs?.guilds?.main || null;
            const mainLogChannelId = IDs?.channels?.ticketLogs || LOG_CHANNEL;

            const mainGuild = mainGuildId
                ? (interaction.client.guilds.cache.get(mainGuildId) || await interaction.client.guilds.fetch(mainGuildId).catch(() => null))
                : null;

            const logChannel = mainGuild?.channels?.cache?.get(mainLogChannelId)
                || (mainGuild ? await mainGuild.channels.fetch(mainLogChannelId).catch(() => null) : null)
                || targetInteraction.guild?.channels?.cache?.get(LOG_CHANNEL)
                || await targetInteraction.guild?.channels?.fetch(LOG_CHANNEL).catch(() => null);

            if (logChannel?.isTextBased?.()) {
                await sendTranscriptWithBrowserLink(logChannel, {
                    files: transcriptHtmlPath
                        ? [{ attachment: transcriptHtmlPath, name: `transcript_${targetInteraction.channel.id}.html` }]
                        : [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${targetInteraction.channel.id}.txt` }],
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Ticket Chiuso')
                            .setDescription(`<:member_role_icon:1330530086792728618> **Aperto da:** <@${ticket.userId}>\n<:discordstaff:1443651872258003005> **Chiuso da:** ${targetInteraction.user}\n<:Clock:1330530065133338685> **Aperto il:** ${createdAtFormatted}\n<a:VC_Verified:1448687631109197978> **Claimato da:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Non claimato'}\n<:reportmessage:1443670575376765130> **Motivo:** ${motivo ? motivo : 'Nessun motivo inserito'}`)
                            .setColor('#6f4e37')
                    ],
                }, Boolean(transcriptHtmlPath));
            }
            const member = await targetInteraction.guild.members.fetch(ticket.userId).catch(() => null);
            if (member) {
                try {
                    await sendTranscriptWithBrowserLink(member, {
                        files: transcriptHtmlPath
                            ? [{ attachment: transcriptHtmlPath, name: `transcript_${targetInteraction.channel.id}.html` }]
                            : [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${targetInteraction.channel.id}.txt` }],
                        embeds: [new EmbedBuilder().setTitle('Ticket Chiuso').setDescription(`<:member_role_icon:1330530086792728618> **Aperto da:** <@${ticket.userId}>\n<:discordstaff:1443651872258003005> **Chiuso da:** ${targetInteraction.user}\n<:Clock:1330530065133338685> **Aperto il:** ${createdAtFormatted}\n<a:VC_Verified:1448687631109197978> **Claimato da:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Non claimato'}\n<:reportmessage:1443670575376765130> **Motivo:** ${motivo ? motivo : 'Nessun motivo inserito'}`).setColor('#6f4e37')]
                    }, Boolean(transcriptHtmlPath));
                } catch (err) {
                    if (err.code !== 50007) {
                        global.logger.error(err);
                    }
                }
            }
            await safeEditReply(targetInteraction, { embeds: [new EmbedBuilder().setDescription("🔒 Il ticket verrà chiuso...").setColor('#6f4e37')]});
            setTimeout(() => {
                if (targetInteraction.channel) targetInteraction.channel.delete().catch(() => { });
            }, 2000);
        } catch (err) {
            global.logger.error(err);
            await safeReply(targetInteraction, { embeds: [makeErrorEmbed('Errore', "<:vegax:1443934876440068179> Errore durante la chiusura del ticket")], flags: 1 << 6 }).catch(() => { });
        } finally {
            interaction.client.ticketCloseLocks.delete(closeLockKey);
        }
    }
}

module.exports = { handleTicketInteraction };
