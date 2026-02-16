async function runSponsorPanel(client) {
    // Bot Test: setup iniziale opzionale; i panel sono inviati da runSponsorVerifyPanels e runSponsorTicketPanels (chiamati da ready.js)
    return;
}

async function runSponsorVerifyPanels(client) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const { PersonalityPanel: Panel } = require('../Schemas/Community/communitySchemas');
    const { upsertPanelMessage } = require('../Utils/Embeds/panelUpsert');

    let SPONSOR_GUILD_IDS = Array.isArray(client.config?.sponsorGuildIds) ? [...client.config.sponsorGuildIds] : [];
    const VERIFY_CHANNEL_IDS = client.config?.sponsorVerifyChannelIds || {};
    if (SPONSOR_GUILD_IDS.length === 0) {
        SPONSOR_GUILD_IDS = Object.keys(VERIFY_CHANNEL_IDS);
    }

    if (SPONSOR_GUILD_IDS.length === 0) {
        global.logger.warn('[Bot Test] runSponsorVerifyPanels: nessuna guild in config (sponsorGuildIds o sponsorVerifyChannelIds). Controlla config.json.');
        return 0;
    }
    const botGuildIds = client.guilds.cache.map(g => g.id);
    const inSponsor = SPONSOR_GUILD_IDS.filter(id => botGuildIds.includes(id));
    const missing = SPONSOR_GUILD_IDS.filter(id => !botGuildIds.includes(id));
    global.logger.info('[Bot Test] Verify: bot in ' + client.guilds.cache.size + ' server. Sponsor da config: ' + SPONSOR_GUILD_IDS.length + '. Bot nei sponsor: ' + inSponsor.length + (missing.length ? '. Mancano (invita il bot): ' + missing.join(', ') : ''));

    let sent = 0;
    for (const guildId of SPONSOR_GUILD_IDS) {
        try {
            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) {
                global.logger.warn('[Bot Test] Verify panel: guild non trovata (bot non nel server?): ' + guildId);
                continue;
            }
            await guild.channels.fetch().catch(() => {});

            const channelId = VERIFY_CHANNEL_IDS[guildId];
            let channel = channelId
                ? (guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null))
                : guild.channels.cache.find(ch => ch.name?.toLowerCase().includes('start'));

            if (!channel?.isTextBased?.()) {
                global.logger.warn('[Bot Test] Verify panel: canale non trovato o non testuale in guild ' + guild.name + ' (' + guildId + '). sponsorVerifyChannelIds corretti in config.json?');
                continue;
            }

            const serverName = guild.name || 'this server';
            const verifyPanelEmbed = new EmbedBuilder()
                .setColor(client.config?.embedVerify || '#6f4e37')
                .setTitle('<:verification:1461725843125571758> **`Verification Required!`**')
                .setDescription(
                    '<:space:1461733157840621608> <:alarm:1461725841451909183> **Per accedere a `' + serverName + '` devi prima verificarti.**\n' +
                    '<:space:1461733157840621608><:space:1461733157840621608> <:rightSort:1461726104422453298> Clicca il pulsante **Verify** qui sotto per iniziare.'
                );
            const verifyRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('verify_start').setLabel('Verify').setStyle(ButtonStyle.Success)
            );

            let panelDoc = null;
            try {
                panelDoc = await Panel.findOneAndUpdate(
                    { guildId, channelId: channel.id },
                    { $setOnInsert: { guildId, channelId: channel.id } },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } catch (err) {
                global.logger.error('[Bot Test] Verify panel: errore MongoDB per guild ' + guildId + ':', err?.message || err);
                continue;
            }

            const panelMessage = await upsertPanelMessage(channel, client, {
                messageId: panelDoc?.verifyPanelMessageId || null,
                embeds: [verifyPanelEmbed],
                components: [verifyRow]
            });
            if (panelMessage?.id) {
                await Panel.updateOne(
                    { guildId, channelId: channel.id },
                    { $set: { verifyPanelMessageId: panelMessage.id } }
                ).catch(() => {});
                global.logger.info('[Bot Test] Verify panel inviato/aggiornato in ' + guild.name + ' (# ' + channel.name + ').');
                sent++;
            } else {
                global.logger.warn('[Bot Test] Verify panel: upsertPanelMessage non ha restituito messaggio in ' + guild.name);
            }
        } catch (err) {
            global.logger.error('[Bot Test] runSponsorVerifyPanels guild ' + guildId + ':', err?.message || err);
        }
    }
    return sent;
}

async function runSponsorTicketPanels(client) {
    const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
    const { PersonalityPanel: Panel } = require('../Schemas/Community/communitySchemas');
    const { upsertPanelMessage } = require('../Utils/Embeds/panelUpsert');

    let SPONSOR_GUILD_IDS = Array.isArray(client.config?.sponsorGuildIds) ? [...client.config.sponsorGuildIds] : [];
    const TICKET_CHANNEL_IDS = client.config?.sponsorTicketChannelIds || {};
    if (SPONSOR_GUILD_IDS.length === 0) {
        SPONSOR_GUILD_IDS = Object.keys(TICKET_CHANNEL_IDS);
    }
    // Ticket panel solo nel canale ticket dedicato (sponsorTicketChannelIds), non in quello di verifica
    if (SPONSOR_GUILD_IDS.length === 0) return 0;
    global.logger.info('[Bot Test] Ticket panel: ' + SPONSOR_GUILD_IDS.length + ' guild, canali da sponsorTicketChannelIds.');

    let sent = 0;

    for (const guildId of SPONSOR_GUILD_IDS) {
        try {
            const channelId = TICKET_CHANNEL_IDS[guildId];
            if (!channelId) {
                global.logger.warn('[Bot Test] Ticket panel: nessun canale ticket per guild ' + guildId + ' (aggiungi sponsorTicketChannelIds in config.json).');
                continue;
            }
            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) {
                global.logger.warn('[Bot Test] Ticket panel: guild non trovata: ' + guildId);
                continue;
            }
            await guild.channels.fetch().catch(() => {});
            const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
            if (!channel?.isTextBased?.()) {
                global.logger.warn('[Bot Test] Ticket panel: canale non trovato in ' + guild.name + ': ' + channelId);
                continue;
            }

            let panelDoc = null;
            try {
                panelDoc = await Panel.findOneAndUpdate(
                    { guildId, channelId: channel.id },
                    { $setOnInsert: { guildId, channelId: channel.id } },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } catch (err) {
                global.logger.error('[Bot Test] Ticket panel: MongoDB guild ' + guildId, err?.message || err);
                continue;
            }

            const ticketInfoEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(
                    '<:reportmessage:1443670575376765130> Apri un **ticket** in base alle tue _esigenze_.\n' +
                    '<:dot:1443660294596329582> Massimo **1** ticket alla volta.\n' +
                    '<:dot:1443660294596329582> Scegli la sezione corretta.'
                );

            const ticketPanelEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setAuthor({ name: 'Contatta lo Staff', iconURL: guild.iconURL() || undefined })
                .setDescription(
                    'Seleziona una categoria qui sotto per aprire un ticket.\n' +
                    '<:VC_1:1444099819680563200> **Supporto** – segnalazioni, problemi, informazioni.\n' +
                    '<:VC_2:1444099781864722535> **Partnership** – partnership con il server.\n' +
                    '<:VC_3:1444099746116534282> **HighStaff** – verifica selfie, donazioni, sponsor, admin.'
                );

            const ticketMenu = new StringSelectMenuBuilder()
                .setCustomId('ticket_open_menu')
                .setPlaceholder('Seleziona una categoria...')
                .addOptions(
                    { label: 'Supporto', description: 'Segnalazioni, problemi, informazioni', value: 'ticket_supporto', emoji: { id: '1443651872258003005', name: 'discordstaff' } },
                    { label: 'Partnership', description: 'Partnership con il server', value: 'ticket_partnership', emoji: { id: '1443651871125409812', name: 'partneredserverowner' } },
                    { label: 'HighStaff', description: 'Verifica Selfie, Donazioni, Sponsor', value: 'ticket_highstaff', emoji: { id: '1443670575376765130', name: 'reportmessage' } }
                );
            const ticketSelectRow = new ActionRowBuilder().addComponents(ticketMenu);

            const infoMessage = await upsertPanelMessage(channel, client, {
                messageId: panelDoc?.ticketInfoMessageId || null,
                embeds: [ticketInfoEmbed],
                components: []
            });
            const panelMessage = await upsertPanelMessage(channel, client, {
                messageId: panelDoc?.ticketPanelMessageId || null,
                embeds: [ticketPanelEmbed],
                components: [ticketSelectRow]
            });

            if (infoMessage?.id || panelMessage?.id) {
                await Panel.updateOne(
                    { guildId, channelId: channel.id },
                    {
                        $set: {
                            ticketInfoMessageId: infoMessage?.id || panelDoc?.ticketInfoMessageId || null,
                            ticketPanelMessageId: panelMessage?.id || panelDoc?.ticketPanelMessageId || null
                        }
                    }
                ).catch(() => {});
                global.logger.info('[Bot Test] Ticket panel inviato/aggiornato in ' + guild.name + ' (# ' + channel.name + ').');
                sent++;
            }
        } catch (err) {
            global.logger.error('[Bot Test] runSponsorTicketPanels guild ' + guildId + ':', err?.message || err);
        }
    }
    return sent;
}

module.exports = { runSponsorPanel, runSponsorVerifyPanels, runSponsorTicketPanels };
