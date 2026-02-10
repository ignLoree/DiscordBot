const IDs = require('../Utils/Config/ids');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const toComparableJson = (items = []) => JSON.stringify(items.map((item) => (typeof item?.toJSON === 'function' ? item.toJSON() : item)));

function shouldEditMessage(message, { embeds = [], components = [] }) {
  const currentEmbeds = toComparableJson(message?.embeds || []);
  const nextEmbeds = toComparableJson(embeds);
  if (currentEmbeds !== nextEmbeds) return true;

  const currentComponents = toComparableJson(message?.components || []);
  const nextComponents = toComparableJson(components);
  return currentComponents !== nextComponents;
}

async function upsertPanelMessage(channel, client, payload) {
  const messages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  const existing = messages?.find((msg) => msg.author?.id === client.user?.id && msg.embeds?.length);
  if (!existing) {
    await channel.send(payload).catch(() => {});
    return;
  }
  if (shouldEditMessage(existing, payload)) {
    await existing.edit(payload).catch(() => {});
  }
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    const moderationChannel = client.channels.cache.get(IDs.channels.staffModeration)
      || await client.channels.fetch(IDs.channels.staffModeration).catch(() => null);
    const bestStaffChannel = client.channels.cache.get(IDs.channels.staffBest)
      || await client.channels.fetch(IDs.channels.staffBest).catch(() => null);
    const guideChannel = client.channels.cache.get(IDs.channels.staffGuide)
      || await client.channels.fetch(IDs.channels.staffGuide).catch(() => null);
    const paidChannel = client.channels.cache.get(IDs.channels.staffPaid)
      || await client.channels.fetch(IDs.channels.staffPaid).catch(() => null);

    const embeds = [
      new EmbedBuilder()
        .setColor('#6f4e37')
        .setDescription(`<a:questionexclaimanimated:1443660299994533960>  **__COME FUNZIONA?__**

> Il premio _Staffer del Mese_ serve per premiare lo staffer **migliore** del \`mese\`. I premi li riceverà sia un __**High Staff**__ che un __**Low Staff**__. 

<a:vegarightarrow:1443673039156936837> Il premio viene deciso in base all'**attività** e al **contributo** che lo staffer ha dato al server.
<a:questionexclaimanimated:1443660299994533960>  **__QUALI SONO I VANTAGGI?__**

> Lo __Staffer del Mese__ ha anche dei **vantaggi** che sono _uguali_ per entrambi gli staffer:
  <:dot:1443660294596329582> Ruolo __<@&1442568895251611924>__
  <:dot:1443660294596329582> Ruolo __<@&1442568950805430312>__  per quel mese
  <:dot:1443660294596329582> **__5__ giorni** di __pausa__ aggiuntivi`),
      new EmbedBuilder()
        .setColor('#6f4e37')
        .setDescription(`<:discordstaff:1443651872258003005> La **__guida staff__** di __Vinili & Caffè__ serve per portar **ordine** tra lo __staff__, infatti son presenti delle **__regole__** che __tutti__ dovranno **rispettare**, in __caso__ vengano \`trasgredite\`, potreste andare in contro a **__sanzioni__**, come **__\`valutazioni negative\`__** o in casi estremi il **__\`depex\`__**.
            
            > La __guida staff__ si divide in **__\`6\` sezioni__** che sono __accessibili__ **schiacciando** i \`bottoni\` sottostanti:
            <:dot:1443660294596329582> **Regolamento**
            <:dot:1443660294596329582> **Limiti Settimanali**
            <:dot:1443660294596329582> **Pause**
            <:dot:1443660294596329582> **Valutazioni**
            <:dot:1443660294596329582> **Sanzioni**
            <:dot:1443660294596329582> **Warn Staff**`),
      new EmbedBuilder()
        .setColor('#6f4e37')
        .setDescription(`<a:questionexclaimanimated:1443660299994533960> Per **applicare** le __sanzioni__, è necessario __attenersi__ alle **indicazioni** riportate di seguito e **consultare** le procedure disponibili __cliccando__ sui **bottoni** alla fine del messaggio.
        
        <:dot:1443660294596329582> **__\`1\`__** <a:vegarightarrow:1443673039156936837> Bisogna **__sempre__** allegare le **prove** (screen, video, link di messaggi).
        <:dot:1443660294596329582> **__\`2\`__** <a:vegarightarrow:1443673039156936837> Il __numero__ della **sanzione** si basa su quante volte l'**utente** è stato **sanzionato __specificatamente__ per quella regola**.
        <:dot:1443660294596329582> **__\`3\`__** <a:vegarightarrow:1443673039156936837> Quando **sanzionate**, usate sempre l'**__articolo__** del **regolamento** infranto.
        <:dot:1443660294596329582> **__\`4\`__** <a:vegarightarrow:1443673039156936837> Per visualizzare **quante** volte un __utente__ è stato **sanzionato** usate il comando ?modlogs **__\`ID\`__**
        <:dot:1443660294596329582> **__\`5\`__** <a:vegarightarrow:1443673039156936837> Bisogna **__sempre__** sanzionare nel canale <#1442569245878648924> usando i comandi di <@155149108183695360>
        <:dot:1443660294596329582> **__\`5\`__** <a:vegarightarrow:1443673039156936837> Ogni volta che si __oltrepassa__ il numero di **sanzioni ottenibili** si **ricomincia** il __ciclo__ di sanzioni per quella **specifica __regola__**.`),
      new EmbedBuilder()
        .setColor('#6f4e37')
        .setDescription(`<:partneredserverowner:1443651871125409812> **__Vinili & Caffè__** offre un servizio di __pagamento__ in base al numero di **partner** effettuate.
                > Per riscattare eventuali premi bisognerà aprire un <#1442569095068254219> **__\`Terza Categoria\`__**
                
                <:dot:1443660294596329582> **__\`150\`__** partner <a:vegarightarrow:1443673039156936837> **__2__ euro** <:paypal:1329524292446191676>
                <:dot:1443660294596329582> **__\`175\`__** partner <a:vegarightarrow:1443673039156936837> **__3__ euro** <:paypal:1329524292446191676> / **Nitro __Basic__** <:sparkles_nitro_basic:1330196488336310383>
                <:dot:1443660294596329582> **__\`250\`__** partner <a:vegarightarrow:1443673039156936837> **Nitro __Boost__** <:hellokittyboost:1329446485166788628>
                
                <a:flyingnitroboost:1443652205705170986> Naturalmente, in caso di riscatto del **Nitro __Boost__**, almeno un **boost** dovrà andare a **__Vinili & Caffè__**.`)
    ];

    const rowGuideMain = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('regolamento')
          .setLabel('︲REGOLE')
          .setEmoji('<:rules:1443307208543703131>')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('limiti')
          .setLabel('︲LIMITI SETTIMANALI')
          .setEmoji('<:reportmessage:1443670575376765130>')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('pause')
          .setLabel('︲PAUSE')
          .setEmoji('<:Clock:1330530065133338685>')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('valutazioni')
          .setLabel('︲VALUTAZIONI')
          .setEmoji('<a:loading:1443934440614264924>')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('sanzioni')
          .setLabel('︲SANZIONI')
          .setEmoji('<:discordstaff:1443651872258003005>')
          .setStyle(ButtonStyle.Secondary),
      );
    const rowGuideWarn = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('warnstaff')
          .setLabel('︲WARN STAFF')
          .setEmoji('<:banhammer:1443651875441217639>')
          .setStyle(ButtonStyle.Secondary),
      );
    const rowModeration = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('generalimoderazione')
          .setLabel('︲GENERALI')
          .setEmoji('<:appdirectoryallwhite:1443308556995788840>')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('testualimoderazione')
          .setLabel('︲TESTUALI')
          .setEmoji('<:discordchannelwhite:1443308552536985810>')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('vocalimoderazione')
          .setLabel('︲VOCALI')
          .setEmoji('<:microphone:1443307206824169573>')
          .setStyle(ButtonStyle.Secondary),
      );

    if (bestStaffChannel?.isTextBased?.()) {
      await upsertPanelMessage(bestStaffChannel, client, { embeds: [embeds[0]], components: [] });
    }
    if (guideChannel?.isTextBased?.()) {
      await upsertPanelMessage(guideChannel, client, { embeds: [embeds[1]], components: [rowGuideMain, rowGuideWarn] });
    }
    if (moderationChannel?.isTextBased?.()) {
      await upsertPanelMessage(moderationChannel, client, { embeds: [embeds[2]], components: [rowModeration] });
    }
    if (paidChannel?.isTextBased?.()) {
      await upsertPanelMessage(paidChannel, client, { embeds: [embeds[3]], components: [] });
    }
  }
};
