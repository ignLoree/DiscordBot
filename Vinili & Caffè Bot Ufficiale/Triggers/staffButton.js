const { EmbedBuilder, Events } = require('discord.js');
module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.guild) return;
        if (!interaction.message) return;
        if (!interaction.isButton()) return;
        if (interaction.customId == 'sanzioni') {
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:reportmessage:1443670575376765130> Ogni staffer per sanzionare dovrà __seguire__ <#1329080096681758797>, chi non lo farà **riceverà** una __valutazione negativa__.
            
            > <a:VC_Arrow:1448672967721615452> **__LIMITI SETTIMANALI SULLE SANZIONI__**
            <:dot:1443660294596329582> Ogni <@&1442568901887000618> dovrà __eseguire__ almeno: **\`3 sanzioni\`**
            <:dot:1443660294596329582> Ogni <@&1442568897902678038> dovrà __eseguire__ almeno: **\`4 sanzioni\`**
            <:dot:1443660294596329582> Ogni <@&1442568896237277295> dovrà __eseguire__ almeno: **\`4 sanzioni\`**

            > Chi __rispetterà__ questi limiti riceverà **una valutazione positiva**.`)
            await interaction.reply({ embeds: [embed], flags: 1 << 6 });
        }
        if (interaction.customId == 'warnstaff') {
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:banhammer:1443651875441217639>  I **warn staff** vengono __assegnati__ dopo **3 valutazioni negative**. Raggiunti i \`2\` **warn staff** si verrà depexati al ruolo precedente. **__(Per i Mod sarà depex completo)__**
                    
                    > L'<@&1442568894349840435> può decidere di grazie qualcuno al secondo warn, ma in caso di **terzo warn** lo staffer verrà depexato **__completamente__**
                    
                    <:attentionfromvega:1443651874032062505> I **warn staff** non possono essere __rimossi__. Il **reset** dei __warn staff__ avviene ogni **__6 mesi__**.`)
            await interaction.reply({ embeds: [embed], flags: 1 << 6 });
        }
        if (interaction.customId == 'valutazioni') {
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<a:1370everythingisstable:1444006799643508778> **__VALUTAZIONI POSITIVE__**
                    <a:questionexclaimanimated:1443660299994533960> Le **valutazioni positive** aumentano la Possibilità  di essere **pexati** e si possono **ottenere** generando un'__attività__ **superiore** a quella richiesta nei _limiti settimanali_ o facendo qualcosa per dare un **vantaggio** al __server__.
                    
                    > Le **valutazioni positive** si possono **__scambiare__** per dei giorni in più di **pausa**.
                    
                    <a:laydowntorest:1444006796661358673> **__VALUTAZIONI NEGATIVE__**
                    > Le **valutazioni negative** diminuscono la Possibilità di essere **pexati** e si ottengono **non completando** i _limiti settimanali_ o facendo qualcosa di _nocivo_ per il **server**.
                    
                    > Le **valutazioni negative** possono essere **__rimosse__** completando compiti extra assegnati dall'<@&1442568894349840435> o rinunciando a _almeno_ \`3 o più valutazioni positive\` in base al motivo per cui è stata assegnata la valutazione. `)
            await interaction.reply({ embeds: [embed], flags: 1 << 6 });
        }
        if (interaction.customId == 'pause') {
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:Clock:1330530065133338685> Vinili & Caffè presenta un **sistema** di **\`pause\`** _sofisticato_, infatti è tutto __organizzato__ per **garantire** al meglio l'__attività__ del server.
            
                > Per __richiedere__ una pausa basta fare il comando **</pausa request:1215398004182491149>** in <#1442569262689554444>.
            
                <a:VC_Arrow:1448672967721615452> **__LIMITI__**
                <a:loading:1443934440614264924> In un anno si possono chiedere __massimo__ **\`60 giorni\`** di pausa che si possono usufruire in __tutti__ i **12 mesi** dell'anno. Gli <@&1442568895251611924> avranno **__\`5\`__** giorni in più.
            
                > Nei giorni **festivi** avrete anche dei giorni in più **ulteriori** al __normale mese__:
            <:dot:1443660294596329582> **24**, **25**, **26**, **31** __Dicembre__
            <:dot:1443660294596329582> **1** Gennaio
            <:dot:1443660294596329582> **Pasqua** e **Pasquetta**
            
            > Naturalmente per **garantire** al meglio l'attività del server ci sono dei __limiti__ di staffer che possono essere in pausa nello __stesso periodo__
            <:dot:1443660294596329582> <@&1442568904311570555> <a:VC_Arrow:1448672967721615452> __Nessun limite__
            <:dot:1443660294596329582> <@&1442568901887000618> <a:VC_Arrow:1448672967721615452> __3__ **staffer**
            <:dot:1443660294596329582> <@&1442568897902678038> <a:VC_Arrow:1448672967721615452> __1__ **staffer**
            <:dot:1443660294596329582> <@&1442568896237277295> <a:VC_Arrow:1448672967721615452> __1__ **staffer**
            <:dot:1443660294596329582> <@&1442568893435478097> <a:VC_Arrow:1448672967721615452> __2__ **staffer**
            <:dot:1443660294596329582> <@&1442568891875201066> <a:VC_Arrow:1448672967721615452> __1__ **staffer**
            <:dot:1443660294596329582> <@&1442568889052430609> <a:VC_Arrow:1448672967721615452> __1__ **staffer**
            
            <:attentionfromvega:1443651874032062505> Potrai chiedere __una pausa__ **ogni mese**. Se quest'ultima cade in \`2\` **__mesi diversi__**, verrà contato il mese in cui viene **chiesta** la __pausa__, a patto che non superi i primi __\`5\` giorni__ dell'altro mese. Per chiedere un'altra pausa dovrai aspettare almeno **__\`1 settimana\`__**
            
            <:infoglowingdot:1443660296823767110> Gli __\`Helper\`__ potranno richiedere una __pausa__ nella loro prima settimana **solo** in per **__problemi personali__ o __familiari gravi__**. Se l'<@&1442568894349840435> viene a conoscenza di un **__falso__ motivo** per usare una pausa, **in qualsiasi circostanza**, si verrà **__depexati__** all'**__istante__**.
            
            > <:banhammer:1443651875441217639> Se l'<@&1442568894349840435> verrà a conoscenza di uno **staffer** __in pausa__ ma **attivo** in un **altro server** nel periodo di tempo della pausa, **toglierà** la pausa e **sanzionerà** lo staffer.`)
            await interaction.reply({ embeds: [embed], flags: 1 << 6 });
        }
        if (interaction.customId == 'limiti') {
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:infoglowingdot:1443660296823767110> I **\`limiti settimanali\`** sono dei **messaggi** e delle **ore di vocali** che entro una __settimana__ si devono __raggiungere__.
                
                > <:attentionfromvega:1443651874032062505> **Superare** i limiti di __poco__ potrebbe comportare a un **depex**, mentre **superarli** di __tanto__ **__non garantisce__** un **pex**
            
                <a:VC_Arrow:1448672967721615452> <@&1442568904311570555> 
            <:VC_DoubleReply:1468713981152727120> **__400__** messaggi
            <:VC_Reply:1468262952934314131> **__3.5h__** in vocale

            <a:VC_Arrow:1448672967721615452> <@&1442568901887000618> 
            <:VC_DoubleReply:1468713981152727120> **__500__** messaggi
            <:VC_Reply:1468262952934314131> **__5h__** in vocale

            <a:VC_Arrow:1448672967721615452> <@&1442568897902678038> 
            <:VC_DoubleReply:1468713981152727120> **__500__** messaggi
            <:VC_Reply:1468262952934314131> **__4.5h__** in vocale

            <a:VC_Arrow:1448672967721615452> <@&1442568896237277295> 
            <:VC_DoubleReply:1468713981152727120> **__450__** messaggi
            <:VC_Reply:1468262952934314131> **__4h__** in vocale

            > <:attentionfromvega:1443651874032062505> verrà **valutato** anche il **modo** in cui questi __limiti__ vengono raggiunti, ovvero se lo **staffer** è stato costante o no. `)
            await interaction.reply({ embeds: [embed], flags: 1 << 6 });
        }
        if (interaction.customId == 'regolamento') {
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:dot:1443660294596329582> **Rispettare** le regole (<#1442569111119990887>) del server;

            <:dot:1443660294596329582> __Non__ **chiedere** pex _continuamente_;

            <:dot:1443660294596329582> __Non__ **istigare** o creare **flame** tra lo **\`staff\`** e gli **\`utenti\`**;

            <:dot:1443660294596329582> __Non__ **abusare** di potere, ad esempio **sanzionando** un __utente__ \`senza un vero motivo\`;

            <:dot:1443660294596329582> Se si è in una **vocale pubblica** da __mutati__ siete **obbligati** a scrivere in <#1442569130573303898>;

            <:dot:1443660294596329582> __Non__ **floodare**, **spammare** e **usare bot** per completare i **\`limiti settimanali testuali\`**

            <:dot:1443660294596329582> __Non__ passare la maggior parte del **tempo** nei **canali vocali privati**, poichè non vengono **conteggiati** al fine dei __limiti settimanali__
            
            <:dot:1443660294596329582> __Non__ **stare da soli** in una __vocale pubblica__ se in un'altra vi è già un altro **staffer** da solo. Inoltre, almeno uno dei due **deve** essere __smutato__`)
            await interaction.reply({ embeds: [embed], flags: 1 << 6 });
        }
        if (interaction.customId == 'generalimoderazione') {
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:rules:1443307208543703131> **__Regola \`1.1\`__**
                <:VC_Reply:1468262952934314131> Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`1.2\`__** 
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __2h__**

                <:rules:1443307208543703131> **__Regola \`1.3\`__** 
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __3h__** 
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __6h__**
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __18h__**

                <:rules:1443307208543703131> **__Regola \`1.4\`__**
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Mute __12h__**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`1.5\`__**
                <:VC_Reply:1468262952934314131> Sanzione: **Ban**`)
            await interaction.reply({ embeds: [embed], flags: 1 << 6 });
        }
        if (interaction.customId == 'testualimoderazione') {
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:rules:1443307208543703131> **__Regola \`2.1\`__** 
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Mute __18h__**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`2.2\`__** 
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Warn**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __12h__** 
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __18h__** 
                <:VC_Reply:1468262952934314131> 5° Sanzione: **Mute __24h__**
                <:VC_Reply:1468262952934314131> 6° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`2.3\`__** 
                <:VC_Reply:1468262952934314131> Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`2.4\`__** 
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale** 
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Warn**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __6h__**
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __18h__**

                <:rules:1443307208543703131> **__Regola \`2.5\`__** 
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __2h__**`)
            await interaction.reply({ embeds: [embed], flags: 1 << 6 });
        }
        if (interaction.customId == 'vocalimoderazione') {
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:rules:1443307208543703131> **__Regola \`3.1\`__** 
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __16h__**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`3.2\`__** 
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __12h__** 
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __18h__** 
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __24h__**
                <:VC_Reply:1468262952934314131> 5° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`3.3\`__** 
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __6h__**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __12h__**                                 
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __24h__**  
                <:VC_Reply:1468262952934314131> 5° Sanzione: **Mute __48h__** 

                <:rules:1443307208543703131> **__Regola \`3.4\`__** 
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __3h__**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __6h__**                                 
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __12h__**
                <:VC_Reply:1468262952934314131> 5° Sanzione: **Ban**

                <:rules:1443307208543703131> **__Regola \`3.5\`__** 
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __3h__**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __12h__**
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Ban**
                
                <:rules:1443307208543703131> **__Regola \`3.6\`__** 
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __2h__**
                
                <:rules:1443307208543703131> **__Regola \`3.7\`__** 
                <:VC_DoubleReply:1468713981152727120> 1° Sanzione: **Richiamo verbale**
                <:VC_Reply:1468262952934314131> 2° Sanzione: **Mute __4h__**
                <:VC_Reply:1468262952934314131> 3° Sanzione: **Mute __12h__**
                <:VC_Reply:1468262952934314131> 4° Sanzione: **Mute __18h__**
                <:VC_Reply:1468262952934314131> 5° Sanzione: **Ban**`)
            await interaction.reply({ embeds: [embed], flags: 1 << 6 });
        }
    }
}
