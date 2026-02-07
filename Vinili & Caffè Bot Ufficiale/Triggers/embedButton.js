const { EmbedBuilder, Events } = require('discord.js');
const { decrementQuoteCount } = require('../Utils/Quote/quoteCounter');
const { ROLE_MULTIPLIERS } = require('../Services/Community/expService');
const AvatarPrivacy = require('../Schemas/Community/avatarPrivacySchema');
const BannerPrivacy = require('../Schemas/Community/bannerPrivacySchema');

module.exports = {
    name: Events.InteractionCreate,

    async execute(interaction) {

        if (!interaction.guild) return;
        if (!interaction.message) return;
        if (interaction.isStringSelectMenu()) {
            const menuId = interaction.customId;
            const values = Array.isArray(interaction.values) ? interaction.values : [];
            const categories = {
                personality_pronouns: [
                    '1442568997848743997',
                    '1442568999043989565',
                    '1442569000063074498',
                    '1442569001367769210',
                    '1442569002932109434'
                ],
                personality_age: [
                    '1442568993197265021',
                    '1442568994581381170',
                    '1442568995348807691',
                    '1442568996774871194'
                ],
                personality_region: [
                    '1442569021861007443',
                    '1442569023303974922',
                    '1442569024486506498',
                    '1442569025790939167'
                ],
                personality_dm: [
                    '1442569004215697438',
                    '1442569005071077417',
                    '1442569006543274126'
                ],
                personality_relationship: [
                    '1442569028173299732',
                    '1442569029263818906'
                ],
                personality_mentions: [
                    '1442569009567629375',
                    '1442569012063109151',
                    '1442569010943365342',
                    '1442569014474965033',
                    '1442569013074071644',
                    '1443955529352478830',
                    '1447597930944008376'
                ],
                personality_colors_1: [
                    '1442568958656905318',
                    '1442568956832645212',
                    '1442568961077153994',
                    '1442568960016121998',
                    '1442568963836874886',
                    '1442568965040636019',
                    '1442568967045648412',
                    '1442568962167541760',
                    '1442568968371048449',
                    '1442568969528541225',
                    '1442568970497687717',
                    '1442568971357388912',
                    '1442568972745838667',
                    '1442568975966797926'
                ],
                personality_colors_2: [
                    '1442568976944201828',
                    '1442568974486208634',
                    '1442568977896439960',
                    '1442568979473371258',
                    '1442568980626673685',
                    '1442568981792948304',
                    '1442568982769959002',
                    '1442568983898357954',
                    '1442568985278156971',
                    '1442568986720993350',
                    '1442568987887276133',
                    '1442568988961013821',
                    '1442568989866725468',
                    '1442568991150309578'
                ],
                personality_colors_plus: [
                    '1469759694930182284',
                    '1469759700944814231',
                    '1469759704380084384',
                    '1469759708742160537',
                    '1469759714094088327',
                    '1469759719194230906',
                    '1469759723418026233',
                    '1469759731945177182',
                    '1469760931113336864',
                    '1469761030417809675',
                    '1469761114140315831'
                ]
            };

            const roleIds = categories[menuId];
            if (!roleIds) return;
            const member = interaction.member;
            if (!member) return;

            try {
                if (!values.length || values.includes('remove')) {
                    await member.roles.remove(roleIds).catch(() => { });
                    return interaction.reply({
                        content: 'Ruoli rimossi correttamente.',
                        flags: 1 << 6
                    });
                }
                if (menuId === 'personality_colors_plus') {
                    const allowed = member.roles.cache.has('1329497467481493607')
                        || member.roles.cache.has('1442568932136587297');
                    if (!allowed) {
                        return interaction.reply({
                            content: '<:vegax:1443934876440068179> Non puoi selezionare i Colori PLUS. Servono i ruoli richiesti.',
                            flags: 1 << 6
                        });
                    }
                }
                await member.roles.remove(roleIds).catch(() => { });
                await member.roles.add(values).catch(() => { });
                return interaction.reply({
                    content: 'Ruolo aggiornato correttamente.',
                    flags: 1 << 6
                });
            } catch {
                return interaction.reply({
                    content: '<:vegax:1443934876440068179> Impossibile aggiornare il ruolo.',
                    flags: 1 << 6
                });
            }
        }
        if (!interaction.isButton()) return;

        if (interaction.customId && interaction.customId.startsWith('avatar_unblock:')) {
            const targetId = interaction.customId.split(':')[1];
            if (interaction.user.id !== targetId) {
                return interaction.reply({ content: '<:vegax:1443934876440068179> Non puoi sbloccare l\'avatar di un altro utente.', flags: 1 << 6 });
            }
            try {
                await AvatarPrivacy.findOneAndUpdate(
                    { guildId: interaction.guild.id, userId: targetId },
                    { $set: { blocked: false }, $setOnInsert: { guildId: interaction.guild.id, userId: targetId } },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } catch { }
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setTitle('Comando sbloccato')
                .setDescription('Hai sbloccato con successo la visualizzazione del tuo avatar.');
            return interaction.reply({ embeds: [embed] });
        }
        if (interaction.customId && interaction.customId.startsWith('banner_unblock:')) {
            const targetId = interaction.customId.split(':')[1];
            if (interaction.user.id !== targetId) {
                return interaction.reply({ content: '<:vegax:1443934876440068179> Non puoi sbloccare il banner di un altro utente.', flags: 1 << 6 });
            }
            try {
                await BannerPrivacy.findOneAndUpdate(
                    { guildId: interaction.guild.id, userId: targetId },
                    { $set: { blocked: false }, $setOnInsert: { guildId: interaction.guild.id, userId: targetId } },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } catch { }
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setTitle('Comando sbloccato')
                .setDescription('Hai sbloccato con successo la visualizzazione del tuo banner.');
            return interaction.reply({ embeds: [embed] });
        }
        if (interaction.customId && interaction.customId.startsWith('quote_remove:')) {
            const parts = interaction.customId.split(':');
            const targetId = parts[1];
            const originChannelId = parts[2] || null;
            const originMessageId = parts[3] || null;
            if (interaction.user.id !== targetId) {
                const denied = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('❌ Accesso negato')
                    .setDescription("Solo l'autore della citazione può rimuoverla.");
                return interaction.reply({ embeds: [denied], flags: 1 << 6 });
            }
            const now = new Date();
            const dateStr = now.toLocaleDateString('it-IT');
            const timeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            const removedEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setTitle('🗑️ Citazione rimossa')
                .setDescription('Questa citazione è stata rimossa dall\'autore.')
                .addFields(
                    { name: 'Rimossa da', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Data rimozione', value: `${dateStr} ${timeStr}`, inline: true }
                )
                .setFooter({ text: `Puoi bloccare le future quote tramite il comando ?blockquotes • Oggi alle ${timeStr}` });
            if (originChannelId && originMessageId && originMessageId !== '0') {
                const originChannel = interaction.guild?.channels?.cache?.get(originChannelId)
                    || await interaction.guild?.channels?.fetch(originChannelId).catch(() => null);
                if (originChannel?.isTextBased?.()) {
                    const originMessage = await originChannel.messages.fetch(originMessageId).catch(() => null);
                    if (originMessage) await originMessage.delete().catch(() => {});
                }
            }
            try {
                await decrementQuoteCount(interaction.guild?.id);
            } catch {}
            return interaction.update({ embeds: [removedEmbed], components: [], files: [] }).catch(async () => {
                await interaction.reply({ embeds: [removedEmbed], flags: 1 << 6 }).catch(() => { });
            });
        }
        if (interaction.customId == 'vocaliprivate') {
            const embeds = [
                new EmbedBuilder()
                    .setColor('#6f4e37')
                    .setDescription(`<:discordvoiceprivatewhite:1443925460185780257> **__VOCALI PRIVATE__**

        > I **canali vocali privati** sono ottenibili tramite perks e hanno bisogno di un **__ruolo custom__**.
        
        <:pinnednew:1443670849990430750> __**REGOLE:**__
        <:VC_DoubleReply:1468713981152727120>  Devono essere **attive** almeno **__3 ore a settimana__**;
        <:VC_DoubleReply:1468713981152727120>  __Non__ è fatto obbligo di rispettare il [**Regolamento di Vinili & Caffè**](https://discord.com/channels/1329080093599076474/1442569111119990887), __tranne__ per i **contenuti** \`NSFW & GORE\`;
        <:VC_Reply:1468262952934314131> In caso di **inattività**, il canale verrà **eliminato** e sarà __possibile__ richiederlo soltanto **dopo 2 settimane** tramite <#1442569095068254219> \`HIGH STAFF\`. Alla **terza cancellazione** nel giro di **2 mesi** esso **__NON__** potrà essere più **richiesto**.`),]
            await interaction.reply({ embeds: [embeds[0]], flags: 1 << 6 });
        }
        if (interaction.customId == 'ruolocustom') {
            const embeds = [
                new EmbedBuilder()
                    .setColor('#6f4e37')
                    .setDescription(`<:defaultrolepermissions:1443925459170623509> **__RUOLO CUSTOM__**

        > I **canali vocali privati** sono ottenibili tramite perks. A differenza delle **vocali private** essi possono essere ottenuti anche __senza__ l'ausilio di un **canale vocale privato**
        
        <:pinnednew:1443670849990430750> __**REGOLE:**__
        <:VC_DoubleReply:1468713981152727120>  Chi **possiede** il __ruolo__ dovrà fare almeno **__100 messaggi__** _a settimana_;
        <:VC_Reply:1468262952934314131> In caso di **inattività**, il canale verrà **eliminato** e sarà __possibile__ richiederlo soltanto **dopo 2 settimane** tramite <#1442569095068254219> \`HIGH STAFF\`. Alla **terza cancellazione** nel giro di **2 mesi**  esso **__NON__** potrà essere più **richiesto**.`),]
            await interaction.reply({ embeds: [embeds[0]], flags: 1 << 6 });
        }
        if (interaction.customId == 'metodi') {
            const embeds = [
                new EmbedBuilder()
                    .setColor('#6f4e37')
                    .setDescription(`<:Money:1330544713463500970> Per effettuare una sponsor con __Vinili & Caffè__ ci sono due modalità: **pagando** oppure esponendo una **collaborazione** in un <#1442569095068254219> \`HIGH STAFF\`.

                    <:dot:1443660294596329582> **€1,50** <a:VC_Arrow:1448672967721615452> sponsor per **2** settimane
                    <:dot:1443660294596329582> **€3** <a:VC_Arrow:1448672967721615452> sponsor per **1 **mese
                    <:dot:1443660294596329582> **€5** <a:VC_Arrow:1448672967721615452> sponsor **lifetime**`),
            ]
            await interaction.reply({ embeds: [embeds[0]], flags: 1 << 6 });
        }
        if (interaction.customId == 'ping') {
            const embeds = [
                new EmbedBuilder()
                    .setColor('#6f4e37')
                    .setDescription(`<:Discord_Mention:1329524304790028328> I **ping** variano in base al __numero__ di **membri** del server.

                    <:dot:1443660294596329582> Meno di **500** <a:VC_Arrow:1448672967721615452> \`no ping\`
                    <:dot:1443660294596329582> Tra i **500** e i **1000** <a:VC_Arrow:1448672967721615452> \`ping @here\`
                    <:dot:1443660294596329582> **1000+** <a:VC_Arrow:1448672967721615452> \`ping @here & @everyone\``),
            ]
            await interaction.reply({ embeds: [embeds[0]], flags: 1 << 6 });
        }
        if (interaction.customId == 'info_rules') {
            const commonEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:5751attentionfromvega:1443651874032062505> __Lo staff si riserva il diritto di cambiare sanzioni e regole in base alla situazione.__`);
            const generalEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`
        <:rules:1443307208543703131> **\`REGOLA GENERALE 1.1\`** 
        <:VC_Reply:1468262952934314131> **Rispettare** i [__ToS__](https://discord.com/terms) e le [__Linee Guida__](https://discord.com/terms) di Discord.

        <:rules:1443307208543703131> **\`REGOLA GENERALE 1.2\`** 
        <:VC_Reply:1468262952934314131> **Non discriminare nessuno**, non accettiamo nessuna forma di razzismo, fascismo, omofobia,  __vietato__ **scrivere** o **dire** la \`f-word\` e la \`n-word\`.
        
        <:rules:1443307208543703131> **\`REGOLA GENERALE 1.3\`** 
        <:VC_Reply:1468262952934314131> **Rispettare** gli __utenti__ e lo __staff__ del server.
        
        <:rules:1443307208543703131> **\`REGOLA GENERALE 1.4\`** 
        <:VC_Reply:1468262952934314131> È __vietato__ **auto-promuoversi**.
        
        <:rules:1443307208543703131> **\`REGOLA GENERALE 1.5\`** 
        <:VC_Reply:1468262952934314131> È __vietato__ **uscire** e **rientrare** continuamente dal server.`);
            const textEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:rules:1443307208543703131> **\`REGOLA TESTUALE 2.1\`** 
                <:VC_Reply:1468262952934314131> È __vietato__ inviare **file** **gore**, **NSFW** o **dati sensibili** di un utente.

        <:rules:1443307208543703131> **\`REGOLA TESTUALE 2.2\`** 
        <:VC_Reply:1468262952934314131> È __vietato__ avere **comportamenti toxic** o **troll** che conducono al flame.

        <:rules:1443307208543703131> **\`REGOLA TESTUALE 2.3\`** 
        <:VC_Reply:1468262952934314131> È __vietato__ inviare **link** contenenti virus, grabber, sponsor o social.

        <:rules:1443307208543703131> **\`REGOLA TESTUALE 2.4\`** 
        <:VC_Reply:1468262952934314131> È __vietato__ inviare **flood** o **Wall Of Text** che intasano la chat.

        <:rules:1443307208543703131> **\`REGOLA TESTUALE 2.5\`** 
        <:VC_Reply:1468262952934314131> È __vietato__ abusare di **parolacce**, **bestemmie** e ogni tipo di **insulto** a **divinità**.`);
            const voiceEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:rules:1443307208543703131> **\`REGOLA VOCALE 3.1\`** 
                <:VC_Reply:1468262952934314131> È __vietato__ mostrare contenuti **gore**, **NSFW** o **dati sensibili** di un utente.

        <:rules:1443307208543703131> **\`REGOLA VOCALE 3.2\`** 
        <:VC_Reply:1468262952934314131> È __vietato__ avere **comportamenti toxic** o **troll** che conducono al flame.

        <:rules:1443307208543703131> **\`REGOLA VOCALE 3.3\`** 
        <:VC_Reply:1468262952934314131> È __vietato__ **disconnettere il bot** o cambiare musica mentre un utente sta ascoltando una canzone tramite il bot.

        <:rules:1443307208543703131> **\`REGOLA VOCALE 3.4\`** 
        <:VC_Reply:1468262952934314131> È __vietato__ utilizzare **SoundBoard** o qualunque tipo di **VoiceChanger**.

        <:rules:1443307208543703131> **\`REGOLA VOCALE 3.5\`** 
        <:VC_Reply:1468262952934314131> È __vietato__ **urlare** o fare **errape** col microfono.

        <:rules:1443307208543703131> **\`REGOLA VOCALE 3.6\`** 
        <:VC_Reply:1468262952934314131> È __vietato__ abusare di **parolacce** e **bestemmie** e ogni tipo di **insulto** a **divinità**.
        
        <:rules:1443307208543703131> **\`REGOLA VOCALE 3.7\`** 
        <:VC_Reply:1468262952934314131> È __vietato__ **uscire** e **rientrare** continuamente dalle vocali.`);
            await interaction.reply({ embeds: [generalEmbed, textEmbed, voiceEmbed, commonEmbed], flags: 1 << 6 });
        }
        if (interaction.customId == 'info_donations') {
            const under5Embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setTitle('<a:ThankYou:1329504268369002507> **__DONAZIONI SOTTO I 5€__**')
                .setDescription(`<:VC_DoubleReply:1468713981152727120> Ruolo <@&1442568916114346096>
                    <:VC_DoubleReply:1468713981152727120> Inviare **link** e **immagini** in **__ogni__ chat**
                    <:VC_DoubleReply:1468713981152727120> \`x3\` di multi in vocale e testuale
                    <:VC_DoubleReply:1468713981152727120> Una **reazione** a tua scelta dopo che qualcuno __scrive__ il tuo **nome**
                    <:VC_DoubleReply:1468713981152727120> Possibilità di suggerire un **poll** tramite <#1442569095068254219> \`PERKS\`
                    <:VC_Reply:1468262952934314131> **Votare** per lo <@&1442568895251611924>`)
                .setFooter({ text: `⚠️ Attenzione: Per ricevere i perks dovrai donare almeno 1€` });
            const over5Embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setTitle('<a:ThankYou:1329504268369002507> **__DONAZIONI SOPRA I 5€__**')
                .setDescription(`<:VC_DoubleReply:1468713981152727120> Ruolo <@&1442568916114346096>
                    <:VC_DoubleReply:1468713981152727120> **Vantaggi** del <@&1442568916114346096> sotto i 5€
                    <:VC_DoubleReply:1468713981152727120> **Ruolo Custom**
                    <:VC_DoubleReply:1468713981152727120> **Stanza Privata**
                    <:VC_Reply:1468262952934314131> Possibilità di __usare__ le **soundboard** **__(con moderazione)__**`)
                .setFooter({ text: `⚠️ Attenzione: Per ricevere i perks dovrai donare almeno 6€` });
            const topEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<a:Boost_Cycle:1329504283007385642> **__Classifica globale donatori Vinili & Caffè:__** <:Money:1330544713463500970>

        <:VC_1:1444099819680563200>° Posizione <a:VC_Arrow:1448672967721615452> ㆍ <a:OP_crown_yellow:1330194103564238930>
        <:VC_2:1444099781864722535>° Posizione <a:VC_Arrow:1448672967721615452> ㆍ <a:OP_crown_darkblue:1330194101886255187>
        <:VC_3:1444099746116534282>° Posizione <a:VC_Arrow:1448672967721615452> ㆍ <a:OP_crown_white:1330194100162396330>`)
            const commonEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:5751attentionfromvega:1443651874032062505> Lo **staff** di **__Vinili & Caffè__** non vi __consegnerà__ automaticamente i **perks**. Dovrete aprire un __ticket__ __**\`PERKS\`**__ per **riscattarli**. Ovviamente questo non vale per **perks** riguardanti i **permessi**, come i **nick** o i **media**.`);
            await interaction.reply({ embeds: [under5Embed, over5Embed, topEmbed, commonEmbed], flags: 1 << 6 });
        }
        if (interaction.customId == 'info_boost_levels') {
            const boostEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<a:Boost_Cycle:1329504283007385642> **Boostando** il server di **__Vinili & Caffè__** accederete a delle ricompense esclusive:

            <:VC_DoubleReply:1468713981152727120> Ruolo <@&1329497467481493607> 
            <:VC_DoubleReply:1468713981152727120> \`x2\` di multi in vocale e testuale
            <:VC_DoubleReply:1468713981152727120> Possibilità di **cambiare** il __nickname__
            <:VC_DoubleReply:1468713981152727120> Inviare **link** e **immagini** in **__ogni__ chat**
            <:VC_DoubleReply:1468713981152727120> Una **reazione** a tua scelta dopo che qualcuno __scrive__ il tuo **nome**
            <:VC_DoubleReply:1468713981152727120> **Ruolo Custom** & **Stanza Privata**
            <:VC_DoubleReply:1468713981152727120> Possibilità di __usare__ le **soundboard** **__(con moderazione)__**
            <:VC_Reply:1468262952934314131> **Votare** per lo <@&1442568895251611924>`);
            const levelEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:VC_BlackPin:1448687216871084266> Per **salire** di livello e **ottenere** i ruoli bisogna **messaggiare** in <#1442569130573303898> e stare in **vocale** nei canali dei server. <@1329118940110127204> vi avviserà quando salirete di **livello**.

            <:dot:1443660294596329582> <@&1442568936423034940>
                <:VC_DoubleReply:1468713981152727120> Cambiare il **__nickname__**
                <:VC_Reply:1468262952934314131> Inviare **link** e **immagini** in **__ogni__ chat**
                <:VC_Reply:1468262952934314131> Nuovo comando **sbloccato**: \`?quote\`
                
            <:dot:1443660294596329582> <@&1442568934510297226>
                <:VC_DoubleReply:1468713981152727120> Possibilità di **aggiungere** una __reazione__ ai messaggi
                <:VC_Reply:1468262952934314131> Mandare **adesivi** esterni in qualsiasi chat

            <:dot:1443660294596329582> <@&1442568933591748688>
                <:VC_DoubleReply:1468713981152727120> Una **reazione** a tua scelta dopo che qualcuno __scrive__ il tuo **nome**
                <:VC_Reply:1468262952934314131> Possibilità di **chiedere** un __poll__ tramite __\`TICKET PERKS\`__

            <:dot:1443660294596329582> <@&1442568932136587297>
                <:VC_Reply:1468262952934314131> Possibilità di __usare__ le **soundboard** **__(con moderazione)__**

            <:dot:1443660294596329582> <@&1442568931326824488>
                <:VC_Reply:1468262952934314131> **Ruolo Custom** & **Canale Privato**

            <:dot:1443660294596329582> <@&1442568929930379285>
                <:VC_Reply:1468262952934314131> **Votare** per lo <@&1442568895251611924>`);
            const commonEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:5751attentionfromvega:1443651874032062505> Lo **staff** di **__Vinili & Caffè__** non vi __consegnerà__ automaticamente i **perks**. Dovrete aprire un __ticket__ __**\`PERKS\`**__ per **riscattarli**. Ovviamente questo non vale per **perks** riguardanti i **permessi**, come i **nick** o i **media**. **__\`(Il ruolo e la stanza verranno rimossi in caso di rimozione dei boosts o in caso di mancato rinnovo)\`__**`);
            await interaction.reply({ embeds: [boostEmbed, levelEmbed, commonEmbed], flags: 1 << 6 });
        }
        if (interaction.customId == 'info_badges_roles') {
            const supporterEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:VC_BlackPin:1448687216871084266> **Inserendo** il link __vanity__ **\`(https://discord.gg/viniliecaffe)\`** nello __status__ o nell'__about me__ riceverai il ruolo <@&1442568948271943721>

                <:VC_DoubleReply:1468713981152727120> **Ruolo** esclusivo <@&1442568948271943721>
                <:VC_DoubleReply:1468713981152727120> Inviare **link** e **immagini** in **__ogni__ chat**
                <:VC_Reply:1468262952934314131> Cambiare il **__nickname__**`);
            const vipEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:VC_BlackPin:1448687216871084266> Il ruolo <@&1442568950805430312> è ottinibile solo essendo **amici** dei __Founder__ oppure **vincendo** __eventi__ o __giveaway__.
                
                <:VC_DoubleReply:1468713981152727120> **Ruolo** esclusivo <@&1442568950805430312> 
                <:VC_DoubleReply:1468713981152727120> \`x3\` di multi in vocale e testuale
                <:VC_DoubleReply:1468713981152727120> **Vantaggi** di __tutti__ i ruoli <@&1442568928667631738>
                <:VC_Reply:1468262952934314131> **Votare** per lo <@&1442568895251611924>`);
            const commonEmbed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:5751attentionfromvega:1443651874032062505> Lo **staff** di **__Vinili & Caffè__** non vi __consegnerà__ automaticamente i **perks**. Dovrete aprire un __ticket__ __**\`PERKS\`**__ per **riscattarli**. Ovviamente questo non vale per **perks** riguardanti i **permessi**, come i **nick** o i **media**. **__\`Nel caso l'utente uscisse dal server i ruoli saranno rimossi\`__**`);
            await interaction.reply({ embeds: [supporterEmbed, vipEmbed, commonEmbed], flags: 1 << 6 });
        }
        if (interaction.customId == 'r_multiplier_info') {
            const entries = ROLE_MULTIPLIERS instanceof Map
                ? Array.from(ROLE_MULTIPLIERS.entries())
                : Array.isArray(ROLE_MULTIPLIERS)
                    ? ROLE_MULTIPLIERS
                    : Object.entries(ROLE_MULTIPLIERS || {});

            const lines = entries.length
                ? entries.map(([roleId, multi]) => `<@&${roleId}> <a:VC_Arrow:1448672967721615452> x${multi}`)
                : ['Nessun moltiplicatore attivo.'];

            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setTitle('<:VC_EXP:1468714279673925883> Informazioni sui moltiplicatori')
                .setDescription([
                    'I moltiplicatori sono ruoli che ti consentono di avere un boost di exp sui messaggi in chat e minuti di vocale.',
                    'I ruoli sono sbloccabili in diversi modi, scopri come nel canale: <#1442569111119990887>',
                    '',
                    '**Moltiplicatori attivi:**',
                    ...lines,
                    '',
                    '**Nota sulla classifica settimanale:**',
                    'Gli exp che determinano la classifica settimanale non vengono influenzati dai moltiplicatori per garantire una partita tra gli utenti.',
                    '',
                    'Puoi vedere la classifica settimanale con il comando \`+classifica\`'
                ].join('\n'))
                .setFooter({ text: `Richiesto da: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

            await interaction.reply({ embeds: [embed], flags: 1 << 6 });
        }
        if (interaction.customId == 'avatar_views') {
            const guildId = interaction.guild.id;
            const top = await AvatarPrivacy.find({ guildId })
                .sort({ views: -1 })
                .limit(10)
                .lean()
                .catch(() => []);
            const lines = [];
            const rankEmojis = [
                '<:VC_1:1444099819680563200>',
                '<:VC_2:1444099781864722535>',
                '<:VC_3:1444099746116534282>',
                '<:VC_4:1444099708292169740>',
                '<:VC_5:1444099670870593776>',
                '<:VC_6:1444099623714033838>',
                '<:VC_7:1444099572916945120>',
                '<:VC_8:1444099520500600998>',
                '<:VC_9:1444099441790554182>',
                '<:VC_10:1469357839066730627>'
            ];
            let idx = 1;
            for (const entry of top) {
                const userId = entry.userId;
                let label = `<@${userId}>`;
                try {
                    const member = interaction.guild.members.cache.get(userId)
                        || await interaction.guild.members.fetch(userId).catch(() => null);
                    if (member) {
                        label = `<@${member.user.id}>`;
                    } else {
                        const user = await interaction.client.users.fetch(userId).catch(() => null);
                        if (user) label = `<@${user.id}>`;
                    }
                } catch { }
                const rank = rankEmojis[idx - 1] || `${idx}.`;
                lines.push(`${rank} ${label} <a:VC_Arrow:1448672967721615452> **${entry.views}** visualizzazioni`);
                idx += 1;
            }
            const description = lines.length
                ? lines.join('\n')
                : 'Nessuna visualizzazione registrata.';
            const now = new Date();
            const time = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            const footerText = `Classifica richiesta da ${interaction.user.username} • Oggi alle ${time}`;
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setTitle('<a:VC_CrownYellow:1330194103564238930> Classifica Visualizzazioni Avatar')
                .setDescription(description)
                .setFooter({ text: footerText, iconURL: interaction.user.displayAvatarURL() });
            return interaction.reply({ embeds: [embed], flags: 1 << 6 });
        }
        if (interaction.customId == 'banner_views') {
            const guildId = interaction.guild.id;
            const top = await BannerPrivacy.find({ guildId })
                .sort({ views: -1 })
                .limit(10)
                .lean()
                .catch(() => []);
            const lines = [];
            const rankEmojis = [
                '<:VC_1:1444099819680563200>',
                '<:VC_2:1444099781864722535>',
                '<:VC_3:1444099746116534282>',
                '<:VC_4:1444099708292169740>',
                '<:VC_5:1444099670870593776>',
                '<:VC_6:1444099623714033838>',
                '<:VC_7:1444099572916945120>',
                '<:VC_8:1444099520500600998>',
                '<:VC_9:1444099441790554182>',
                '<:VC_10:1469357839066730627>'
            ];
            let idx = 1;
            for (const entry of top) {
                const userId = entry.userId;
                let label = `<@${userId}>`;
                try {
                    const member = interaction.guild.members.cache.get(userId)
                        || await interaction.guild.members.fetch(userId).catch(() => null);
                    if (member) {
                        label = `<@${member.user.id}>`;
                    } else {
                        const user = await interaction.client.users.fetch(userId).catch(() => null);
                        if (user) label = `<@${user.id}>`;
                    }
                } catch { }
                const rank = rankEmojis[idx - 1] || `${idx}.`;
                lines.push(`${rank} ${label} <a:VC_Arrow:1448672967721615452> **${entry.views}** visualizzazioni`);
                idx += 1;
            }
            const description = lines.length
                ? lines.join('\n')
                : 'Nessuna visualizzazione registrata.';
            const now = new Date();
            const time = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            const footerText = `Classifica richiesta da ${interaction.user.username} • Oggi alle ${time}`;
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setTitle('<a:VC_CrownYellow:1330194103564238930> Classifica Visualizzazioni Banner')
                .setDescription(description)
                .setFooter({ text: footerText, iconURL: interaction.user.displayAvatarURL() });
            return interaction.reply({ embeds: [embed], flags: 1 << 6 });
        }
    }
}
