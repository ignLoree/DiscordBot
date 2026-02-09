const IDs = require('../Utils/Config/ids');

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')
const path = require('path');

module.exports = {
    name: 'clientReady',
    once: true,

    async execute(client) {

        const private = client.channels.cache.get(IDs.channels.infoPanelPrivate);
        const sponsor = client.channels.cache.get(IDs.channels.infoPanelSponsor);
        const social = client.channels.cache.get(IDs.channels.infoPanelSocial);
        const candidature = client.channels.cache.get(IDs.channels.infoPanelCandidature);

        const embeds = [
            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<a:ThankYou:1329504268369002507> Queste **donazioni** __non__ sono __obbligatorie__ ma **aiutano** a __sostenere economicamente__ il **server**, **più** sono le __donazioni__ **più** saranno i **giveaway** e i **drop** di __nitro__, e **migliore** sarà l'__esperienza__.

            > <a:serversubscriptionsanimated:1443669659986559169> **__METODI DI DONAZIONE__**

            <:dot:1443660294596329582> [**Cliccando qua**](https://www.paypal.com/paypalme/lorenzocorvagliaa) potrete **donare** tramite **PayPal**<:paypal:1329524292446191676>
            <:dot:1443660294596329582> Potete **donare** tramite **Nitro Boost** aprendo un <#1442569095068254219> \`HIGH STAFF\` <a:Boost_Cycle:1329504283007385642>
            <:dot:1443660294596329582> Potete **donare** tramite **Bot Premium** aprendo un <#1442569095068254219> \`HIGH STAFF\` <:premiumbot:1443670260216627341>`)
                .setFooter({ text: `<:attentionfromvega:1443651874032062505> Attenzione: Le donazioni non sono rimborsabili` }),

            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:customprofile:1443925456972808304> **Vinili & Caffè** dispone di **Ruoli Custom** e **Vocali Private** totalmente __customizzabili__. Questi sono ottenibili tramite <#1442569111119990887>.

                    > Per leggere **come funzionano** e le **regole** puoi cliccare sui bottoni sottostanti.`),

            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:pinnednew:1443670849990430750> **Vinili & Caffè** offre un servizio di __sponsor__ con dei **requisiti** da rispettare. Per fare una __sponsor__ bisognerà aprire un <#1442569095068254219> \`HIGH STAFF\`.

        > Ogni server che vorrà effettuare una **sponsor** dovrà rispettare questi 3 requisiti:
        > <:dot:1443660294596329582> Rispettare i [**ToS di Discord**](https://discord.com/terms)
        > <:dot:1443660294596329582> Rispettare le [**Linee Guida di Discord**](https://discord.com/guidelines)
        > <:dot:1443660294596329582> Rispettare il [**Regolamento di Vinili & Caffè**](https://discord.com/channels/1329080093599076474/1442569111119990887)`),

            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:7871discordstaff:1443651872258003005> Su **__Vinili & Caffè__** ci si può candidare a **__\`2\`__** _ruoli_: **__\`Helper\`__** e **__\`Partner Manager\`__**. 
        > <:5751attentionfromvega:1443651874032062505> Per **candidarti** dovrai __cliccare__ il bottone in base al **ruolo** che vuoi __ricoprire__ 

        Per candidarsi, è necessario **soddisfare** i seguenti __requisiti__:
        <:1_:1444099163116535930> Avere almeno **__14 anni (compiuti)__**
        <:2_:1444099161673826368> Rispettare i **[ToS](https://discord.com/terms)** e le **[Linee Guida](https://discord.com/guidelines)** di **Discord**
        <:3_:1444099160294031471> Essere **maturi** e **attivi**
        <:4_:1444099158859321435> Non essere stato **sanzionato** nel server.`),
        ];
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('︲HELPER')
                    .setEmoji(`<:helper:1443651909448630312>`)
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://dyno.gg/form/b40bd751'),
                new ButtonBuilder()
                    .setLabel('︲PARTNER MANAGER')
                    .setEmoji(`<:partnermanager:1443651916838998099>`)
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://dyno.gg/form/f9013078'),
            );
        const row5 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('metodi')
                    .setLabel('︲METODI')
                    .setEmoji(`<:Money:1330544713463500970>`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('ping')
                    .setLabel('︲PING')
                    .setEmoji(`<:Discord_Mention:1329524304790028328>`)
                    .setStyle(ButtonStyle.Secondary),
            );
        const row6 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('vocaliprivate')
                    .setLabel('︲VOCALI PRIVATE')
                    .setEmoji(`<:discordvoiceprivatewhite:1443925460185780257>`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('ruolocustom')
                    .setLabel('︲RUOLO CUSTOM')
                    .setEmoji(`<:Discord_Mention:1329524304790028328>`)
                    .setStyle(ButtonStyle.Secondary),
            );
    }
}

