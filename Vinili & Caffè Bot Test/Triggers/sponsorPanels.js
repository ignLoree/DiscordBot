const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const IDs = require('../Utils/Config/ids');

const SPONSOR_MEDIA_NAME = 'sponsor.gif';
const SPONSOR_MEDIA_PATH = path.join(__dirname, '..', 'Photos', SPONSOR_MEDIA_NAME);

async function runSponsorPanel(client) {
    const { upsertPanelMessage } = require('../Utils/Embeds/panelUpsert');
    const sponsorChannel = client.channels.cache.get(IDs.channels.infoSponsor)
        || await client.channels.fetch(IDs.channels.infoSponsor).catch(() => null);
    if (!sponsorChannel?.isTextBased?.()) {
        global.logger.warn('[Bot Test] Canale sponsor non trovato:', IDs.channels.infoSponsor);
        return;
    }

    const sponsorEmbed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setDescription(
            '<:pinnednew:1443670849990430750> **Vinili & Caffè** offre un servizio di __sponsor__ con dei **requisiti** da rispettare. Per fare una __sponsor__ bisognerà aprire un <#1442569095068254219> `Terza Categoria`.\n\n' +
            '> Ogni server che vorrà effettuare una **sponsor** dovrà rispettare questi 3 requisiti:\n' +
            '> <:dot:1443660294596329582> Rispettare i [**ToS di Discord**](https://discord.com/terms)\n' +
            '> <:dot:1443660294596329582> Rispettare le [**Linee Guida di Discord**](https://discord.com/guidelines)\n' +
            '> <:dot:1443660294596329582> Rispettare il [**Regolamento di Vinili & Caffè**](https://discord.com/channels/1329080093599076474/1442569111119990887)'
        );

    try {
        sponsorEmbed.setImage(`attachment://${SPONSOR_MEDIA_NAME}`);
    } catch (e) {}

    const rowSponsor = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('metodi')
            .setLabel('︲METODI')
            .setEmoji('<:Money:1330544713463500970>')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ping')
            .setLabel('︲PING')
            .setEmoji('<:Discord_Mention:1329524304790028328>')
            .setStyle(ButtonStyle.Secondary)
    );

    const files = [];
    try {
        if (require('fs').existsSync(SPONSOR_MEDIA_PATH)) {
            files.push(new AttachmentBuilder(SPONSOR_MEDIA_PATH, { name: SPONSOR_MEDIA_NAME }));
        }
    } catch (e) {}

    await upsertPanelMessage(sponsorChannel, client, {
        embeds: [sponsorEmbed],
        components: [rowSponsor],
        files: files.length ? files : undefined,
        attachmentName: files.length ? SPONSOR_MEDIA_NAME : undefined
    });
}

async function runSponsorVerifyPanels(client) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const { PersonalityPanel: Panel } = require('../Schemas/Community/communitySchemas');
    const { upsertPanelMessage } = require('../Utils/Embeds/panelUpsert');

    const fromConfig = Array.isArray(client.config?.sponsorGuildIds) ? client.config.sponsorGuildIds : [];
    const fromIds = Object.keys(IDs.sponsorVerifyChannelIds || {});
    const SPONSOR_GUILD_IDS = fromConfig.length > 0 ? fromConfig : fromIds;
    const VERIFY_CHANNEL_IDS = IDs.sponsorVerifyChannelIds || client.config?.sponsorVerifyChannelIds || {};

    if (SPONSOR_GUILD_IDS.length === 0) {
        global.logger.warn('[Bot Test] runSponsorVerifyPanels: nessuna guild in config (sponsorGuildIds o sponsorVerifyChannelIds). Controlla config.json.');
        return;
    }
    global.logger.info('[Bot Test] runSponsorVerifyPanels: ' + SPONSOR_GUILD_IDS.length + ' guild sponsor da elaborare.');

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
            } else {
                global.logger.warn('[Bot Test] Verify panel: upsertPanelMessage non ha restituito messaggio in ' + guild.name);
            }
        } catch (err) {
            global.logger.error('[Bot Test] runSponsorVerifyPanels guild ' + guildId + ':', err?.message || err);
        }
    }
}

async function runSponsorTicketPanels(client) {
    const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
    const { PersonalityPanel: Panel } = require('../Schemas/Community/communitySchemas');
    const { upsertPanelMessage } = require('../Utils/Embeds/panelUpsert');

    const fromConfig = Array.isArray(client.config?.sponsorGuildIds) ? client.config.sponsorGuildIds : [];
    const fromIds = Object.keys(IDs.sponsorVerifyChannelIds || {});
    const SPONSOR_GUILD_IDS = fromConfig.length > 0 ? fromConfig : fromIds;
    const VERIFY_CHANNEL_IDS = IDs.sponsorVerifyChannelIds || client.config?.sponsorVerifyChannelIds || {};
    const TICKET_CHANNEL_IDS = client.config?.sponsorTicketChannelIds || {};
    // Se non c'è canale ticket dedicato, usiamo il canale verify (stesso canale per verify + ticket)
    const getChannelId = (guildId) => TICKET_CHANNEL_IDS[guildId] || VERIFY_CHANNEL_IDS[guildId];

    if (SPONSOR_GUILD_IDS.length === 0) return;
    global.logger.info('[Bot Test] runSponsorTicketPanels: ' + SPONSOR_GUILD_IDS.length + ' guild.');

    for (const guildId of SPONSOR_GUILD_IDS) {
        try {
            const channelId = getChannelId(guildId);
            if (!channelId) {
                global.logger.warn('[Bot Test] Ticket panel: nessun canale per guild ' + guildId + ' (sponsorVerifyChannelIds o sponsorTicketChannelIds).');
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
            }
        } catch (err) {
            global.logger.error('[Bot Test] runSponsorTicketPanels guild ' + guildId + ':', err?.message || err);
        }
    }
}

module.exports = { runSponsorPanel, runSponsorVerifyPanels, runSponsorTicketPanels };
