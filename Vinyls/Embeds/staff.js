const IDs = require("../Utils/Config/ids");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");

const DIVIDER_URL = "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";

async function run(client) {
  const moderationChannel = client.channels.cache.get(IDs.channels.moderazioneStaff) || (await getClientChannelCached(client, IDs.channels.moderazioneStaff));
  const bestStaffChannel = client.channels.cache.get(IDs.channels.bestStaff) || (await getClientChannelCached(client, IDs.channels.bestStaff));
  const guideChannel = client.channels.cache.get(IDs.channels.guidaStaff) || (await getClientChannelCached(client, IDs.channels.guidaStaff));

  const embeds = [
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(
        `<a:questionexclaimanimated:1443660299994533960>  **__COME FUNZIONA?__**

> Il premio _Staffer del Mese_ serve per premiare lo staffer **migliore** del \`mese\`. I premi li riceveranno sia un __**High Staff**__ che un __**Low Staff**__.

<a:vegarightarrow:1443673039156936837> Il premio viene deciso in base all'**attività** e al **contributo** che lo staffer ha dato al server.

<a:questionexclaimanimated:1443660299994533960>  **__QUALI SONO I VANTAGGI?__**
> Lo __Staffer del Mese__ ha anche dei **vantaggi** che sono _uguali_ per entrambi gli staffer:
<:dot:1443660294596329582> Ruolo __<@&1442568895251611924>__
<:dot:1443660294596329582> Ruolo __<@&1442568950805430312>__  per quel mese
<:dot:1443660294596329582> **__5__ giorni** di __pausa__ aggiuntivi`,
      )
      .setImage(DIVIDER_URL),
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(
        `<:discordstaff:1443651872258003005> La **__guida staff__** di __Vinili & Caffè__ serve per portare **ordine** tra lo __staff__, infatti sono presenti delle **__regole__** che __tutti__ dovranno **rispettare**; in __caso__ vengano \`trasgredite\`, potreste andare **incontro** a **__sanzioni__**, come **__\`valutazioni negative\`__** o in casi estremi il **__\`depex\`__**.

> La __guida staff__ si divide in **__\`6\` sezioni__** che sono __accessibili__ **schiacciando** i \`bottoni\` sottostanti:
<:dot:1443660294596329582> **Regolamento**
<:dot:1443660294596329582> **Limiti Settimanali**
<:dot:1443660294596329582> **Pause**
<:dot:1443660294596329582> **Valutazioni**
<:dot:1443660294596329582> **Sanzioni**
<:dot:1443660294596329582> **Warn Staff**`,
      )
      .setImage(DIVIDER_URL),
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(
        `<a:questionexclaimanimated:1443660299994533960> Per **applicare** le __sanzioni__, è necessario __attenersi__ alle **indicazioni** riportate di seguito e **consultare** le procedure disponibili __cliccando__ sui **bottoni** alla fine del messaggio.

<:dot:1443660294596329582> **__\`1\`__** <a:vegarightarrow:1443673039156936837> Bisogna **__sempre__** allegare le **prove** (screen, video, link di messaggi).
<:dot:1443660294596329582> **__\`2\`__** <a:vegarightarrow:1443673039156936837> Il __numero__ della **sanzione** si basa su quante volte l'**utente** è stato **sanzionato __specificatamente__ per quella regola**.
<:dot:1443660294596329582> **__\`3\`__** <a:vegarightarrow:1443673039156936837> Quando **sanzionate**, usate sempre l'**__articolo__** del **regolamento** infranto.
<:dot:1443660294596329582> **__\`4\`__** <a:vegarightarrow:1443673039156936837> Per visualizzare **quante** volte un __utente__ è stato **sanzionato** usate il comando +modlogs **__\`ID\`__**
<:dot:1443660294596329582> **__\`5\`__** <a:vegarightarrow:1443673039156936837> Bisogna **__sempre__** sanzionare nel canale <#1442569245878648924> usando i comandi di <@1329118940110127204>
<:dot:1443660294596329582> **__\`6\`__** <a:vegarightarrow:1443673039156936837> Ogni volta che si __oltrepassa__ il numero di **sanzioni ottenibili** si **ricomincia** il __ciclo__ di sanzioni per quella **specifica __regola__**.`,
      )
      .setImage(DIVIDER_URL),
  ];

  const rowGuideMain = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("regolamento").setLabel("︲REGOLE").setEmoji("<:rules:1443307208543703131>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("limiti").setLabel("︲LIMITI SETTIMANALI").setEmoji("<:reportmessage:1443670575376765130>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("pause").setLabel("︲PAUSE").setEmoji("<:Clock:1330530065133338685>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("valutazioni").setLabel("︲VALUTAZIONI").setEmoji("<a:loading:1443934440614264924>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("sanzioni").setLabel("︲SANZIONI").setEmoji("<:discordstaff:1443651872258003005>").setStyle(ButtonStyle.Secondary),
  );
  const rowGuideWarn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("warnstaff").setLabel("︲WARN STAFF").setEmoji("<:banhammer:1443651875441217639>").setStyle(ButtonStyle.Secondary),
  );
  const rowModeration = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("generalimoderazione").setLabel("︲GENERALI").setEmoji("<:appdirectoryallwhite:1443308556995788840>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("testualimoderazione").setLabel("︲TESTUALI").setEmoji("<:discordchannelwhite:1443308552536985810>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("vocalimoderazione").setLabel("︲VOCALI").setEmoji("<:microphone:1443307206824169573>").setStyle(ButtonStyle.Secondary),
  );

  if (bestStaffChannel?.isTextBased?.()) {
    await upsertPanelMessage(bestStaffChannel, client, {
      embeds: [embeds[0]],
      components: [],
    });
  }
  if (guideChannel?.isTextBased?.()) {
    await upsertPanelMessage(guideChannel, client, {
      embeds: [embeds[1]],
      components: [rowGuideMain, rowGuideWarn],
    });
  }
  if (moderationChannel?.isTextBased?.()) {
    await upsertPanelMessage(moderationChannel, client, {
      embeds: [embeds[2]],
      components: [rowModeration],
    });
  }
}

module.exports = { name: "staff", order: 30, section: "embedWithButtons", run };