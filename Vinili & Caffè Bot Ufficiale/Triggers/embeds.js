const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')
const path = require('path');

module.exports = {
    name: 'clientReady',
    once: true,

    async execute(client) {

        const info = client.channels.cache.get('1468229791374249995');
        const canaleregole = client.channels.cache.get('1442569111119990887');
        const verifica = client.channels.cache.get('1442569059983163403');
        const ticket = client.channels.cache.get('1442569095068254219');
        const donazioni = client.channels.cache.get('1442569148839493775');
        const private = client.channels.cache.get('1442569190971015239');
        const sponsor = client.channels.cache.get('1442569211611185323');
        const social = client.channels.cache.get('1442569225930805320');
        const colori = client.channels.cache.get('1442569099795365898');
        const profile = client.channels.cache.get('1442569103582695536');
        const pings = client.channels.cache.get('1442569105222664354');
        const perks = client.channels.cache.get('1442569159237177385');
        const candidature = client.channels.cache.get('1442569232507473951');

        const embeds = [
            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:rules:1443307208543703131> **Entrando su Vinili & Caffè accetti il regolamento qui presente. Ti consigliamo di non violare le regole per vivere una esperienza migliore nel server!**`),
            new EmbedBuilder()
                .setColor('#6f4e37')
                .setTitle(`<:pepe_wave:1329488693739782274> **__BENVENUTO SU Vinili & Caffè'__**`)
                .setDescription(`? Per **verificarti** premi il pulsante **__\`Verify\`__**, poi inserisci il **codice** che riceverai in **risposta effimera**.
    <:vsl_ticket:1329520261053022208> Per **qualsiasi** problema,  non **esitate** ad aprire un **__<#1442569095068254219> \`SUPPORTO\`__**`),
            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:reportmessage:1443670575376765130> Benvenuto nella **sezione** dedicata all'__assistenza__! Apri un **ticket** in base alle tue _esigenze_ e ricorda di **rispettare** il regolamento.

        <:dot:1443660294596329582> Massimo **__\`1\`__** ticket alla volta;
        <:dot:1443660294596329582> Scegli **sempre** la giusta sezione;
        <:dot:1443660294596329582> Non **abusare** dei __ticket__;
        <:dot:1443660294596329582> Non aprire ticket __inutili__;`),

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
                .setDescription(`<:customprofile:1443925456972808304> **Vinili & Caffè** dispone di **Ruoli Custom** e **Vocali Private** totalmente __customizzabili__. Questi sono ottenibili tramite <#1442569159237177385> o tramite <#1442569148839493775>.

                    > Per leggere **come funzionano** e le **regole** puoi cliccare sui bottoni sottostanti.`),

            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:pinnednew:1443670849990430750> **Vinili & Caffè** offre un servizio di __sponsor__ con dei **requisiti** da rispettare. Per fare una __sponsor__ bisognerà aprire un <#1442569095068254219> \`HIGH STAFF\`.

        > Ogni server che vorrà effettuare una **sponsor** dovrà rispettare questi 3 requisiti:
        > <:dot:1443660294596329582> Rispettare i [**ToS di Discord**](https://discord.com/terms)
        > <:dot:1443660294596329582> Rispettare le [**Linee Guida di Discord**](https://discord.com/guidelines)
        > <:dot:1443660294596329582> Rispettare il [**Regolamento di Vinili & Caffè**](https://discord.com/channels/1329080093599076474/1442569111119990887)`),

            new EmbedBuilder()
                .setTitle(`───・**__Sfumature di Rosso__**・───`)
                .setDescription(`> 🍒 <a:vegarightarrow:1443673039156936837> <@&1442568958656905318>
        > 🩸 <a:vegarightarrow:1443673039156936837> <@&1442568956832645212>
        > 🏮 <a:vegarightarrow:1443673039156936837> <@&1442568961077153994>
        > 🪸 <a:vegarightarrow:1443673039156936837> <@&1442568960016121998>`)
                .setColor('#7f171f'),

            new EmbedBuilder()
                .setTitle(`───・**__Sfumature di Arancione__**・───`)
                .setDescription(`> 🥕 <a:vegarightarrow:1443673039156936837> <@&1442568963836874886>
        > 🎃 <a:vegarightarrow:1443673039156936837> <@&1442568965040636019>
        > 🍊 <a:vegarightarrow:1443673039156936837> <@&1442568967045648412>
        > 🍑 <a:vegarightarrow:1443673039156936837> <@&1442568962167541760>`)
                .setColor(`#d5654d`),

            new EmbedBuilder()
                .setTitle(`───・**__Sfumature di Giallo__**・───`)
                .setDescription(`> 🌽 <a:vegarightarrow:1443673039156936837> <@&1442568968371048449>        
        > 🎖️ <a:vegarightarrow:1443673039156936837> <@&1442568969528541225>
        > 🔑 <a:vegarightarrow:1443673039156936837> <@&1442568970497687717>
        > 🍋‍🟩 <a:vegarightarrow:1443673039156936837> <@&1442568971357388912>`)
                .setColor(`#ffd700`),

            new EmbedBuilder()
                .setTitle(`───・**__Sfumature di Verde__**・───`)
                .setDescription(`> 🍐 <a:vegarightarrow:1443673039156936837> <@&1442568972745838667>
        > 🍃 <a:vegarightarrow:1443673039156936837> <@&1442568975966797926>
        > 🥬 <a:vegarightarrow:1443673039156936837> <@&1442568976944201828>
        > 🫒 <a:vegarightarrow:1443673039156936837> <@&1442568974486208634>`)
                .setColor(`#bfe88b`),

            new EmbedBuilder()
                .setTitle(`───・**__Sfumature di Blu__**・───`)
                .setDescription(`> 💧 <a:vegarightarrow:1443673039156936837> <@&1442568977896439960>
        > 💎 <a:vegarightarrow:1443673039156936837> <@&1442568979473371258>
        > 🧶 <a:vegarightarrow:1443673039156936837> <@&1442568980626673685>
        > 🌃 <a:vegarightarrow:1443673039156936837> <@&1442568981792948304>`)
                .setColor('#4169e1'),

            new EmbedBuilder()
                .setTitle(`───・**__Sfumature di Viola__**・───`)
                .setDescription(`> 🍆 <a:vegarightarrow:1443673039156936837> <@&1442568982769959002>
        > 🏓 <a:vegarightarrow:1443673039156936837> <@&1442568983898357954>
        > 🌷 <a:vegarightarrow:1443673039156936837> <@&1442568985278156971>
        > 🍷 <a:vegarightarrow:1443673039156936837> <@&1442568986720993350>`)
                .setColor(`#b300ff`),

            new EmbedBuilder()
                .setTitle(`───・**__Sfumature di Nero__**・───`)
                .setDescription(`> 🐈‍⬛ <a:vegarightarrow:1443673039156936837> <@&1442568987887276133>
        > 🚬 <a:vegarightarrow:1443673039156936837> <@&1442568988961013821>
        > 🐭 <a:vegarightarrow:1443673039156936837> <@&1442568989866725468>
        > 🐼 <a:vegarightarrow:1443673039156936837> <@&1442568991150309578>`)
                .setColor('#808080'),

            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`───・**__QUALI SONO I TUOI PRONOMI?__**・─── 

        \`›                             ›\`

        🧔‍♂️ <a:vegarightarrow:1443673039156936837> <@&1442568997848743997>
        👩 <a:vegarightarrow:1443673039156936837> <@&1442568999043989565>
        🧑 <a:vegarightarrow:1443673039156936837> <@&1442569000063074498>
        ❔ <a:vegarightarrow:1443673039156936837> <@&1442569001367769210>
        ❓ <a:vegarightarrow:1443673039156936837> <@&1442569002932109434>`),

            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`───・**__DA DOVE PROVIENI?__**・───

        \`›                             ›\`

        🥀 <a:vegarightarrow:1443673039156936837> <@&1442569021861007443>
        🌿 <a:vegarightarrow:1443673039156936837> <@&1442569023303974922>
        🌵 <a:vegarightarrow:1443673039156936837> <@&1442569024486506498>
        🪺 <a:vegarightarrow:1443673039156936837> <@&1442569025790939167>`),
            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`───・**__DM STATUS__**・───

        \`›                             ›\`

        📫 <a:vegarightarrow:1443673039156936837> <@&1442569004215697438>
        📪 <a:vegarightarrow:1443673039156936837> <@&1442569005071077417>
        📭 <a:vegarightarrow:1443673039156936837> <@&1442569006543274126>`),
            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`───・**__QUANTI ANNI HAI?__**・───

        \`›                             ›\`

        🍂 <a:vegarightarrow:1443673039156936837> <@&1442568996774871194>
        🧹 <a:vegarightarrow:1443673039156936837> <@&1442568995348807691>
        🪒 <a:vegarightarrow:1443673039156936837> <@&1442568994581381170>
        🧸 <a:vegarightarrow:1443673039156936837> <@&1442568993197265021>`),
            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`───・**__STATO SENTIMENTALE__**・───

        \`›                             ›\`

        💋 <a:vegarightarrow:1443673039156936837> <@&1442569028173299732>
        💦 <a:vegarightarrow:1443673039156936837> <@&1442569029263818906>`),
            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`🗣️ <a:vegarightarrow:1443673039156936837> <@&1442569009567629375>
        🎊 <a:vegarightarrow:1443673039156936837> <@&1442569012063109151> 
        📰 <a:vegarightarrow:1443673039156936837> <@&1442569010943365342> 
        📊 <a:vegarightarrow:1443673039156936837> <@&1442569014474965033> 
        🔔 <a:vegarightarrow:1443673039156936837> <@&1442569013074071644>
        🕹️ <a:vegarightarrow:1443673039156936837> <@&1443955529352478830>
        💼 <a:vegarightarrow:1443673039156936837> <@&1447597930944008376>`),

            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<a:MimmyGift:1329446511372664886> Cliccando i **bottoni** qua sotto, potrete vedere i **__vantaggi__** e come **__ottenerli__**.

            > **LISTA RUOLI:**

            <:dot:1443660294596329582> <@&1329497467481493607>
            <:dot:1443660294596329582> <@&1442568948271943721>
            <:dot:1443660294596329582> **Dal livello <@&1442568937303707789> al livello <@&1442568929930379285>**
            <:dot:1443660294596329582> <@&1442568950805430312>`),

            new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:7871discordstaff:1443651872258003005> Su **__Vinili & Caffè__** ci si può candidare a **__\`2\`__** _ruoli_: **__\`Helper\`__** e **__\`Partner Manager\`__**. 
        > <:5751attentionfromvega:1443651874032062505> Per **candidarti** dovrai __cliccare__ il bottone in base al **ruolo** che vuoi __ricoprire__ 

        Per candidarsi, è necessario **soddisfare** i seguenti __requisiti__:
        <:1_:1444099163116535930> Avere almeno **__14 anni (compiùti)__**
        <:2_:1444099161673826368> Rispettare i **[ToS](https://discord.com/terms)** e le **[Linee Guida](https://discord.com/guidelines)** di **Discord**
        <:3_:1444099160294031471> Essere **maturi** e **attivi**
        <:4_:1444099158859321435> Non essere stato **sanzionato** nel server.`),
        ];
            new EmbedBuilder()
            .setColor('#6f4e37')
            .setDescription(``)
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('booster')
                    .setLabel('︲Booster')
                    .setEmoji(`<:booster:1443651885276991640>`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('supporter')
                    .setLabel('︲Supporter')
                    .setEmoji(`<:supporter:1443651878515638272>`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('level')
                    .setLabel('︲Level Perks')
                    .setEmoji(`<:mariolevelup:1443679595084910634>`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('vip')
                    .setLabel('︲VIP')
                    .setEmoji(`<:vip:1443651876988915804>`)
                    .setStyle(ButtonStyle.Secondary)
            );
        const verifyRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_start')
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Success)
            );
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('︲HELPER')
                    .setEmoji(`<:helper:1443651909448630312>`)
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://dyno.gg/form/b40bd751'),
                new ButtonBuilder()
                    .setLabel('PARTNER MANAGER')
                    .setEmoji(`<:partnermanager:1443651916838998099>`)
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://dyno.gg/form/f9013078'),
            );
        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('generali')
                    .setLabel('GENERALI')
                    .setEmoji(`<:appdirectoryallwhite:1443308556995788840>`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('testuali')
                    .setLabel('TESTUALI')
                    .setEmoji(`<:discordchannelwhite:1443308552536985810>`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('vocali')
                    .setLabel('︲VOCALI')
                    .setEmoji(`<:microphone:1443307206824169573>`)
                    .setStyle(ButtonStyle.Secondary),
            );
        const row4 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('sotto5')
                    .setLabel('︲<5€')
                    .setEmoji(`<a:MimmyGift:1329446511372664886>`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('sopra5')
                    .setLabel('︲>5€')
                    .setEmoji(`<a:MimmyGift:1329446511372664886>`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('top')
                    .setLabel('TOP DONAZIONI')
                    .setEmoji(`<a:MimmyGift:1329446511372664886>`)
                    .setStyle(ButtonStyle.Secondary),
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
