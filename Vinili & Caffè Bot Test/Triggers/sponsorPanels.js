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

    const SPONSOR_GUILD_IDS = client.config.sponsorGuildIds || Object.keys(IDs.sponsorVerifyChannelIds || {});
    const VERIFY_CHANNEL_IDS = IDs.sponsorVerifyChannelIds || client.config.sponsorVerifyChannelIds || {};

    for (const guildId of SPONSOR_GUILD_IDS) {
        try {
            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) {
                global.logger.warn('[Bot Test] Guild non trovata:', guildId);
                continue;
            }
            await guild.channels.fetch().catch(() => {});

            let channel = VERIFY_CHANNEL_IDS[guildId]
                ? (guild.channels.cache.get(VERIFY_CHANNEL_IDS[guildId]) || await guild.channels.fetch(VERIFY_CHANNEL_IDS[guildId]).catch(() => null))
                : guild.channels.cache.find(ch => ch.name?.toLowerCase().includes('start'));

            if (!channel?.isTextBased?.()) {
                global.logger.warn('[Bot Test] Canale verify non trovato in guild:', guildId);
                continue;
            }

            const serverName = guild.name || 'this server';
            const verifyPanelEmbed = new EmbedBuilder()
                .setColor(client.config.embedVerify || '#6f4e37')
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
                global.logger.error('[Bot Test] Panel doc:', err);
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
            }
        } catch (err) {
            global.logger.error('[Bot Test] runSponsorVerifyPanels guild ' + guildId, err);
        }
    }
}

module.exports = { runSponsorPanel, runSponsorVerifyPanels };
