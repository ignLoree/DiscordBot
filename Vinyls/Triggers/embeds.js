async function runEmbedCandidaturePanelAuto(client) {
  const IDs = require("../Utils/Config/ids");
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, } = require("discord.js");
  const path = require("path");
  const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
  const CANDIDATURE_MEDIA_NAME = "candidature.gif";
  const CANDIDATURE_MEDIA_PATH = path.join(__dirname, "..", "Photos", CANDIDATURE_MEDIA_NAME,);
  const DIVIDER_URL = "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";
  const candidatureChannel = client.channels.cache.get(IDs.channels.candidatureStaff) || (await client.channels.fetch(IDs.channels.candidatureStaff).catch(() => null));
  if (!candidatureChannel?.isTextBased?.()) {
    global.logger.warn(
      "[CLIENT READY] Candidature panel channel missing/unusable:",
      IDs.channels.candidatureStaff,
    );
    return;
  }

  const candidatureEmbed = new EmbedBuilder().setColor("#6f4e37").setDescription(`<:7871discordstaff:1443651872258003005> Su **__Vinili & Caffè__** ci si può candidare a **__\`2\`__** _ruoli_: **__\`Helper\`__** e **__\`Partner Manager\`__**.
> <:5751attentionfromvega:1443651874032062505> Per **candidarti** dovrai __cliccare__ il bottone in base al **ruolo** che vuoi __ricoprire__

Per candidarsi, è necessario **soddisfare** i seguenti __requisiti__:
<:1_:1444099163116535930> Avere almeno **__14 anni (compiuti)__**
<:2_:1444099161673826368> Rispettare i **[ToS](https://discord.com/terms)** e le **[Linee Guida](https://discord.com/guidelines)** di **Discord**
<:3_:1444099160294031471> Essere **maturi** e **attivi**
<:4_:1444099158859321435> Non essere mai stato **sanzionato** nel server.`).setImage(DIVIDER_URL)

  const candidatureAttachment = new AttachmentBuilder(CANDIDATURE_MEDIA_PATH, { name: CANDIDATURE_MEDIA_NAME, });

  const rowCandidature = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("︲HELPER").setEmoji("<:helper:1443651909448630312>").setStyle(ButtonStyle.Secondary).setCustomId("apply_helper"), new ButtonBuilder().setLabel("︲PARTNER MANAGER").setEmoji("<:partnermanager:1443651916838998099>").setStyle(ButtonStyle.Secondary).setCustomId("apply_partnermanager"), new ButtonBuilder().setLabel("︲STAFF PAGATO").setEmoji("<:partneredserverowner:1443651871125409812>").setStyle(ButtonStyle.Secondary).setCustomId("candidature_premi_partner"),);

  await upsertPanelMessage(candidatureChannel, client, {
    embeds: [candidatureEmbed],
    components: [rowCandidature],
    files: [candidatureAttachment],
    attachmentName: CANDIDATURE_MEDIA_NAME,
  });
}

async function runInfoPanelAuto(client) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, } = require("discord.js");
  const path = require("path");
  const { PersonalityPanel } = require("../Schemas/Community/communitySchemas");
  const IDs = require("../Utils/Config/ids");
  const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
  const INFO_CHANNEL_ID = IDs.channels.info;
  const INFO_MEDIA_NAME = "info.gif";
  const INFO_MEDIA_PATH = path.join(__dirname, "..", "Photos", INFO_MEDIA_NAME);
  const DIVIDER_URL = "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";
  const channel = client.channels.cache.get(INFO_CHANNEL_ID) || (await client.channels.fetch(INFO_CHANNEL_ID).catch(() => null));
  if (!channel?.isTextBased?.()) return;
  const attachment = new AttachmentBuilder(INFO_MEDIA_PATH, { name: INFO_MEDIA_NAME, });
  const embed1 = new EmbedBuilder().setColor("#6f4e37").setTitle("Ti diamo il benvenuto nella nostra community!").setFooter({ text: "Usa i bottoni sottostanti per accedere ad altre categorie del server:", }).setDescription(["<a:VC_HeartsBlue:1468686100045369404> Benvenuto/a su **Vinili & Caffè**, l'unico server in Italia non tossico e __incentrato sulla socializzazione__.", "", "<a:VC_HeartBlue:1448673354751021190> **Personalizza il tuo profilo:**", "<:VC_Reply:1468262952934314131> Nel canale <#1469429150669602961> potrai selezionare i colori e i ruoli da aggiungere al tuo profilo per completarlo: come età, menzioni, passioni e molto altro!", "", `Dubbi o problemi? <#${IDs.channels.ticket}> sarà la vostra bussola, lo staff vi risponderà il prima possibile!`,].join("\n"),).addFields({ name: "<:dot:1443660294596329582> Links", value: ["<:VC_bump:1330185435401424896> [Lascia una recensione su DISBOARD](<https://disboard.org/it/server/1329080093599076474>)", "<:link:1470064815899803668> [Votaci su Discadia](<https://discadia.com/vote/viniliecaffe/>)",].join("\n"), inline: true, }, { name: "<:dot:1443660294596329582> Informazioni", value: ["<:exp:1470067108543987846> Owner: <@295500038401163264>", "<:moon:1470064812615667827> Fondazione: ||<t:1765382400:F>||", "<:nitroboost:1470064881674883326> Invite: <https://discord.gg/viniliecaffe>",].join("\n"), inline: true, },).setImage(DIVIDER_URL);
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("info_rules").setLabel("︲REGOLAMENTO").setEmoji("<a:VC_Rule:1469462649950703709>").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("info_donations").setLabel("︲DONAZIONI").setEmoji("<a:VC_Sparkles:1468546911936974889>").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("info_sponsor").setLabel("︲SPONSOR").setEmoji("<:pinnednew:1443670849990430750>").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("info_tags").setLabel("︲TAGS").setEmoji("<:VC_Firework:1470796227913322658>").setStyle(ButtonStyle.Success),
  );
  const embed2 = new EmbedBuilder().setColor("#6f4e37").setFooter({ text: "Usa i bottoni sottostanti per accedere ad altre categorie del server:", }).setTitle("<:VC_PurpleFlower:1469463879149944943> Sblocca dei vantaggi, permessi e ruoli:",).setDescription("Scopri tramite i bottoni sottostanti come sbloccare permessi, ad esempio: mandare link e immagini in chat, poter cambiare il nickname e molti altri.",).setImage(DIVIDER_URL);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("info_boost_levels").setLabel("︲VANTAGGI BOOST & LIVELLI").setEmoji("<a:VC_Rocket:1468544312475123753>").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("info_badges_roles").setLabel("︲BADGE & ALTRI RUOLI").setEmoji("<a:VC_Diamon:1469463765610135635>").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("info_verifica").setLabel("︲VERIFICA SELFIE").setEmoji(`<a:VC_Verified:1448687631109197978>`).setStyle(ButtonStyle.Secondary),
  );
  const guildId = channel.guild?.id;
  if (!guildId) return;
  let panel = null;
  try {
    panel = await PersonalityPanel.findOneAndUpdate(
      { guildId, channelId: INFO_CHANNEL_ID },
      { $setOnInsert: { guildId, channelId: INFO_CHANNEL_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch { }

  const msg1 = await upsertPanelMessage(channel, client, { messageId: panel?.infoMessageId1 || null, files: [attachment], embeds: [embed1], components: [row1], attachmentName: INFO_MEDIA_NAME, });
  const msg2 = await upsertPanelMessage(channel, client, { messageId: panel?.infoMessageId2 || null, embeds: [embed2], components: [row2], });

  if (msg1?.id || msg2?.id) {
    await PersonalityPanel.updateOne(
      { guildId, channelId: INFO_CHANNEL_ID },
      {
        $set: {
          infoMessageId1: msg1?.id || panel?.infoMessageId1 || null,
          infoMessageId2: msg2?.id || panel?.infoMessageId2 || null,
        },
      },
    ).catch(() => { });
  }
}

async function runStaffEmbedAuto(client) {
  const IDs = require("../Utils/Config/ids");
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
  const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");

  const moderationChannel = client.channels.cache.get(IDs.channels.moderazioneStaff) || (await client.channels.fetch(IDs.channels.moderazioneStaff).catch(() => null));
  const bestStaffChannel = client.channels.cache.get(IDs.channels.bestStaff) || (await client.channels.fetch(IDs.channels.bestStaff).catch(() => null));
  const guideChannel = client.channels.cache.get(IDs.channels.guidaStaff) || (await client.channels.fetch(IDs.channels.guidaStaff).catch(() => null));

  const DIVIDER_URL = "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";

  const embeds = [new EmbedBuilder().setColor("#6f4e37").setDescription(`<a:questionexclaimanimated:1443660299994533960>  **__COME FUNZIONA?__**

> Il premio _Staffer del Mese_ serve per premiare lo staffer **migliore** del \`mese\`. I premi li riceveranno sia un __**High Staff**__ che un __**Low Staff**__.

<a:vegarightarrow:1443673039156936837> Il premio viene deciso in base all'**attività** e al **contributo** che lo staffer ha dato al server.

<a:questionexclaimanimated:1443660299994533960>  **__QUALI SONO I VANTAGGI?__**
> Lo __Staffer del Mese__ ha anche dei **vantaggi** che sono _uguali_ per entrambi gli staffer:
<:dot:1443660294596329582> Ruolo __<@&1442568895251611924>__
<:dot:1443660294596329582> Ruolo __<@&1442568950805430312>__  per quel mese
<:dot:1443660294596329582> **__5__ giorni** di __pausa__ aggiuntivi`).setImage(DIVIDER_URL), new EmbedBuilder().setColor("#6f4e37").setDescription(`<:discordstaff:1443651872258003005> La **__guida staff__** di __Vinili & Caffè__ serve per portar **ordine** tra lo __staff__, infatti son presenti delle **__regole__** che __tutti__ dovranno **rispettare**, in __caso__ vengano \`trasgredite\`, potreste andare in contro a **__sanzioni__**, come **__\`valutazioni negative\`__** o in casi estremi il **__\`depex\`__**.

            > La __guida staff__ si divide in **__\`6\` sezioni__** che sono __accessibili__ **schiacciando** i \`bottoni\` sottostanti:
            <:dot:1443660294596329582> **Regolamento**
            <:dot:1443660294596329582> **Limiti Settimanali**
            <:dot:1443660294596329582> **Pause**
            <:dot:1443660294596329582> **Valutazioni**
            <:dot:1443660294596329582> **Sanzioni**
            <:dot:1443660294596329582> **Warn Staff**`).setImage(DIVIDER_URL), new EmbedBuilder().setColor("#6f4e37").setDescription(`<a:questionexclaimanimated:1443660299994533960> Per **applicare** le __sanzioni__, è necessario __attenersi__ alle **indicazioni** riportate di seguito e **consultare** le procedure disponibili __cliccando__ sui **bottoni** alla fine del messaggio.

        <:dot:1443660294596329582> **__\`1\`__** <a:vegarightarrow:1443673039156936837> Bisogna **__sempre__** allegare le **prove** (screen, video, link di messaggi).
        <:dot:1443660294596329582> **__\`2\`__** <a:vegarightarrow:1443673039156936837> Il __numero__ della **sanzione** si basa su quante volte l'**utente** è stato **sanzionato __specificatamente__ per quella regola**.
        <:dot:1443660294596329582> **__\`3\`__** <a:vegarightarrow:1443673039156936837> Quando **sanzionate**, usate sempre l'**__articolo__** del **regolamento** infranto.
        <:dot:1443660294596329582> **__\`4\`__** <a:vegarightarrow:1443673039156936837> Per visualizzare **quante** volte un __utente__ è stato **sanzionato** usate il comando +modlogs **__\`ID\`__**
        <:dot:1443660294596329582> **__\`5\`__** <a:vegarightarrow:1443673039156936837> Bisogna **__sempre__** sanzionare nel canale <#1442569245878648924> usando i comandi di <@1329118940110127204>
        <:dot:1443660294596329582> **__\`6\`__** <a:vegarightarrow:1443673039156936837> Ogni volta che si __oltrepassa__ il numero di **sanzioni ottenibili** si **ricomincia** il __ciclo__ di sanzioni per quella **specifica __regola__**.`).setImage(DIVIDER_URL),];

  const rowGuideMain = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("regolamento").setLabel("︲REGOLE").setEmoji("<:rules:1443307208543703131>").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("limiti").setLabel("︲LIMITI SETTIMANALI").setEmoji("<:reportmessage:1443670575376765130>").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("pause").setLabel("︲PAUSE").setEmoji("<:Clock:1330530065133338685>").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("valutazioni").setLabel("︲VALUTAZIONI").setEmoji("<a:loading:1443934440614264924>").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("sanzioni").setLabel("︲SANZIONI").setEmoji("<:discordstaff:1443651872258003005>").setStyle(ButtonStyle.Secondary),);
  const rowGuideWarn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("warnstaff").setLabel("︲WARN STAFF").setEmoji("<:banhammer:1443651875441217639>").setStyle(ButtonStyle.Secondary),);
  const rowModeration = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("generalimoderazione").setLabel("︲GENERALI").setEmoji("<:appdirectoryallwhite:1443308556995788840>").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("testualimoderazione").setLabel("︲TESTUALI").setEmoji("<:discordchannelwhite:1443308552536985810>").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("vocalimoderazione").setLabel("︲VOCALI").setEmoji("<:microphone:1443307206824169573>").setStyle(ButtonStyle.Secondary),);

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

async function runVerifyPanelAuto(client) {
  const IDs = require("../Utils/Config/ids");
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, } = require("discord.js");
  const path = require("path");
  const { PersonalityPanel: Panel, } = require("../Schemas/Community/communitySchemas");
  const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");

  const VERIFY_CHANNEL_ID = IDs.channels.verify;
  const VERIFY_MEDIA_NAME = "verifica.gif";
  const VERIFY_MEDIA_PATH = path.join(__dirname, "..", "Photos", VERIFY_MEDIA_NAME,);
  const DIVIDER_URL = "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";

  const channel = client.channels.cache.get(VERIFY_CHANNEL_ID) || (await client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null));
  if (!channel?.isTextBased?.()) return;

  const guildId = channel.guild?.id;
  if (!guildId) return;

  const attachment = new AttachmentBuilder(VERIFY_MEDIA_PATH, { name: VERIFY_MEDIA_NAME, });
  const serverName = channel.guild?.name || "this server";

  const verifyInfoEmbed = new EmbedBuilder().setColor("#6f4e37").setTitle("<a:VC_HeartsPink:1468685897389052008> **__Benvenutx su Vinili & Caffè__**",).setDescription("<:vegacheckmark:1443666279058772028> Per **verificarti** premi il pulsante **__`Verify`__**, poi inserisci il **codice** che riceverai in **risposta effimera**.\n" + "<:VC_Ticket:1448694637106692156> Per **qualsiasi** problema, non **esitate** ad aprire un **__<#1442569095068254219> `Prima Categoria`__**",).setImage(DIVIDER_URL);

  const color = client?.config?.embedVerify || "#6f4e37";

  const verifyPanelEmbed = new EmbedBuilder().setColor(color).setTitle("<:verification:1461725843125571758> **`Verification Required!`**",).setDescription("<:space:1461733157840621608> <:alarm:1461725841451909183> **Per accedere a `" + serverName + "` devi prima verificarti.**\n" + "<:space:1461733157840621608><:space:1461733157840621608> <:rightSort:1461726104422453298> Clicca il pulsante **Verify** qui sotto per iniziare.",).setImage(DIVIDER_URL);

  const verifyRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("verify_start").setEmoji(`<a:VC_Verified:1448687631109197978>`).setLabel("︲VERIFY").setStyle(ButtonStyle.Success),);

  let panelDoc = null;
  try {
    panelDoc = await Panel.findOneAndUpdate(
      { guildId, channelId: VERIFY_CHANNEL_ID },
      { $setOnInsert: { guildId, channelId: VERIFY_CHANNEL_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch { }

  const infoMessage = await upsertPanelMessage(channel, client, { messageId: panelDoc?.verifyInfoMessageId || null, files: [attachment], embeds: [verifyInfoEmbed], components: [], attachmentName: VERIFY_MEDIA_NAME, });

  const panelMessage = await upsertPanelMessage(channel, client, { messageId: panelDoc?.verifyPanelMessageId || null, embeds: [verifyPanelEmbed], components: [verifyRow], });

  if (infoMessage?.id || panelMessage?.id) {
    await Panel.updateOne(
      { guildId, channelId: VERIFY_CHANNEL_ID },
      {
        $set: {
          verifyInfoMessageId:
            infoMessage?.id || panelDoc?.verifyInfoMessageId || null,
          verifyPanelMessageId:
            panelMessage?.id || panelDoc?.verifyPanelMessageId || null,
        },
      },
    ).catch(() => { });
  }
}

async function runRuoliPanelAuto(client) {
  const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder, } = require("discord.js");
  const path = require("path");
  const fs = require("fs");
  const { PersonalityPanel } = require("../Schemas/Community/communitySchemas");
  const IDs = require("../Utils/Config/ids");
  const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
  const CHANNEL_ID = IDs.channels.ruoliColori;
  const IMAGE_NAME = "personalità.gif";
  const IMAGE_PATH = path.join(__dirname, "..", "Photos", IMAGE_NAME);
  const IMAGE_PATH_ASCII = path.join(__dirname, "..", "Photos", "personalita.gif");
  const MENTIONS_IMAGE_NAME = "menzioni.gif";
  const MENTIONS_IMAGE_PATH = path.join(__dirname, "..", "Photos", MENTIONS_IMAGE_NAME,);
  const COLORS_IMAGE_NAME = "colori.gif";
  const COLORS_IMAGE_PATH = path.join(__dirname, "..", "Photos", COLORS_IMAGE_NAME,);
  const PLUS_COLORS_IMAGE_NAME = "coloriPlus.gif";
  const PLUS_COLORS_IMAGE_PATH = path.join(__dirname, "..", "Photos", PLUS_COLORS_IMAGE_NAME,);
  const DIVIDER_URL = "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";
  const channel = client.channels.cache.get(CHANNEL_ID) || (await client.channels.fetch(CHANNEL_ID).catch(() => null));
  if (!channel) return;
  const personalityPhotoPath = fs.existsSync(IMAGE_PATH) ? IMAGE_PATH : (fs.existsSync(IMAGE_PATH_ASCII) ? IMAGE_PATH_ASCII : null);
  const attachment = personalityPhotoPath ? new AttachmentBuilder(personalityPhotoPath, { name: IMAGE_NAME }) : null;
  const embed = new EmbedBuilder().setColor("#6f4e37").setTitle("<:sparkledred:1470064814502973591> Personalità").setDescription(["Scegli in cosa ti identifichi, quanti anni hai e di dove sei. Utilizza i menù a tendina sottostanti.", "", "<a:VC_Exclamation:1448687427836444854> Massimo **1** ruolo per categoria.",].join("\n"),).setImage(DIVIDER_URL);
  const mentionsAttachment = fs.existsSync(MENTIONS_IMAGE_PATH) ? new AttachmentBuilder(MENTIONS_IMAGE_PATH, { name: MENTIONS_IMAGE_NAME, }) : null;
  const mentionsEmbed = new EmbedBuilder().setColor("#6f4e37").setTitle("<:sparkledred:1470064814502973591> Personalità").setDescription(["Scegli quali notifiche ricevere dal server in base a cosa ti interessa maggiormente.", "", "<a:VC_Exclamation:1448687427836444854> Le notifiche di **@everyone** le riceveranno tutti.",].join("\n"),).setImage(DIVIDER_URL);
  const colorsAttachment = fs.existsSync(COLORS_IMAGE_PATH) ? new AttachmentBuilder(COLORS_IMAGE_PATH, { name: COLORS_IMAGE_NAME, }) : null;
  const colorsEmbed = new EmbedBuilder().setColor("#6f4e37").setTitle("<:sparkledred:1470064814502973591> Personalità").setDescription(["Scegli il colore per personalizzare il nome del tuo profilo quando scrivi in chat.", "", "<a:VC_Exclamation:1448687427836444854> Verrà mostrato il **colore più in alto** nella lista dei ruoli nel tuo profilo.",].join("\n"),).setImage(DIVIDER_URL);
  const plusColorsAttachment = fs.existsSync(PLUS_COLORS_IMAGE_PATH) ? new AttachmentBuilder(PLUS_COLORS_IMAGE_PATH, { name: PLUS_COLORS_IMAGE_NAME, }) : null;
  const plusColorsEmbed = new EmbedBuilder().setColor("#6f4e37").setTitle("<:sparkledred:1470064814502973591> Personalità").setDescription(['Scegli il colore che più ti piace per il tuo profilo! Utilizza il menù a tendina sottostante. __Rimuovi i colori__ con la "<:vegax:1443934876440068179>" in alto.', "", `⚠️ Questi ruoli sono riservati a coloro con questi ruoli: <@&${IDs.roles.ServerBooster}> e/o <@&${IDs.roles.Level50}>`, "", "<:sparkle:1470064801811140866> **LISTA COLORI:**", `<:VC_1:1444099819680563200> <@&${IDs.roles.redPlus}>`, `<:VC_2:1444099781864722535> <@&${IDs.roles.orangePlus}>`, `<:VC_3:1444099746116534282> <@&${IDs.roles.yellowPlus}>`, `<:VC_4:1444099708292169740> <@&${IDs.roles.greenPlus}>`, `<:VC_5:1444099671894134947> <@&${IDs.roles.bluePlus}>`, `<:VC_6:1444099623714033838> <@&${IDs.roles.purplePlus}>`, `<:VC_7:1444099572916945120> <@&${IDs.roles.pinkPlus}>`, `<:VC_8:1444099520500600998> <@&${IDs.roles.blackPlus}>`, `<:VC_9:1444099441790554182> <@&${IDs.roles.grayPlus}>`, `<:VC_10:1469357839066730627> <@&${IDs.roles.whitePlus}>`, `<:VC_11:1469772033410859173> <@&${IDs.roles.YinYangPlus}>`,].join("\n"),).setImage(DIVIDER_URL);
  const pronouns = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("personality_pronouns").setPlaceholder("⭐ Seleziona i tuoi pronomi").setMinValues(1).setMaxValues(1).addOptions({ label: "Rimuovi i ruoli di sesso", description: "Rimuovi ruoli dal tuo profilo", value: "remove", emoji: "<:vegax:1443934876440068179>", }, { label: "he/him", value: "1442568997848743997", emoji: "<:hehim:1470534612198494258>", description: "Clicca qui per ottenere il ruolo", }, { label: "she/her", value: "1442568999043989565", emoji: "<:sheher:1470534614023143485>", description: "Clicca qui per ottenere il ruolo", }, { label: "they/them", value: "1442569000063074498", emoji: "<:theythem:1470534615818178782>", description: "Clicca qui per ottenere il ruolo", }, { label: "ask me", value: "1442569001367769210", emoji: "<:askme:1470534617458151424>", description: "Clicca qui per ottenere il ruolo", },),);
  const age = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("personality_age").setPlaceholder("🎂 Seleziona la tua età").setMinValues(1).setMaxValues(1).addOptions({ label: "Rimuovi i ruoli di età", value: "remove", description: "Rimuovi ruoli dal tuo profilo", emoji: "<:vegax:1443934876440068179>", }, { label: "13-14", value: "1442568993197265021", emoji: "<:ageadultids:1470541163219128444>", description: "Clicca qui per ottenere il ruolo", }, { label: "15-16", value: "1442568994581381170", emoji: "<:ageadultids:1470541163219128444>", description: "Clicca qui per ottenere il ruolo", }, { label: "17-18", value: "1442568995348807691", emoji: "<:ageids:1470541159351976066>", description: "Clicca qui per ottenere il ruolo", }, { label: "19+", value: "1442568996774871194", emoji: "<:ageids:1470541159351976066>", description: "Clicca qui per ottenere il ruolo", },),);
  const region = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("personality_region").setPlaceholder("🌍 Seleziona la tua località").setMinValues(1).setMaxValues(1).addOptions({ label: "Rimuovi i ruoli di provenienza", value: "remove", description: "Rimuovi ruoli dal tuo profilo", emoji: "<:vegax:1443934876440068179>", }, { label: "Nord", value: "1442569021861007443", emoji: "<a:peepoitaly:1470537719225520341>", description: "Clicca qui per ottenere il ruolo", }, { label: "Centro", value: "1442569023303974922", emoji: "<a:peepoitaly:1470537719225520341>", description: "Clicca qui per ottenere il ruolo", }, { label: "Sud", value: "1442569024486506498", emoji: "<a:peepoitaly:1470537719225520341>", description: "Clicca qui per ottenere il ruolo", }, { label: "Estero", value: "1442569025790939167", emoji: "<:wplace:1470537717426294886>", description: "Clicca qui per ottenere il ruolo", },),);
  const dmStatus = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("personality_dm").setPlaceholder("💬 Seleziona il tuo stato DM").setMinValues(1).setMaxValues(1).addOptions({ label: "Rimuovi i ruoli DM", value: "remove", description: "Rimuovi ruoli dal tuo profilo", emoji: "<:vegax:1443934876440068179>", }, { label: "DMs Opened", value: "1442569004215697438", emoji: "<:opendm:1470536793504878664>", description: "Clicca qui per ottenere il ruolo", }, { label: "DMs Closed", value: "1442569005071077417", emoji: "<:nodm:1470536791764373608>", description: "Clicca qui per ottenere il ruolo", }, { label: "Ask to DM", value: "1442569006543274126", emoji: "<:ask2dm:1470536789637726345>", description: "Clicca qui per ottenere il ruolo", },),);
  const relationship = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("personality_relationship").setPlaceholder("💘 Seleziona il tuo stato sentimentale").setMinValues(1).setMaxValues(1).addOptions({ label: "Rimuovi i ruoli sentimentali", value: "remove", description: "Rimuovi ruoli dal tuo profilo", emoji: "<:vegax:1443934876440068179>", }, { label: "Fidanzato/a", value: "1442569028173299732", emoji: "<:stitchinlove:1470538823103414373>", description: "Clicca qui per ottenere il ruolo", }, { label: "Single", value: "1442569029263818906", emoji: "<:stitchlove:1470538821656641761>", description: "Clicca qui per ottenere il ruolo", },),);
  const mentionsMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("personality_mentions").setPlaceholder("🔔 Seleziona le notifiche da ricevere").setMinValues(1).setMaxValues(7).addOptions({ label: "Rimuovi", value: "remove", emoji: "<:vegax:1443934876440068179>", description: "Rimuovi ruoli dal tuo profilo", }, { label: "Revive Chat", value: IDs.roles.ReviveChat, emoji: "<a:pepedeadchat:1470541176284381226>", description: "Clicca qui per ottenere il ruolo", }, { label: "Events", value: IDs.roles.Events, emoji: "<a:announce:1470541173507751957>", description: "Clicca qui per ottenere il ruolo", }, { label: "News", value: IDs.roles.News, emoji: "<:newspaper:1470541170353377290>", description: "Clicca qui per ottenere il ruolo", }, { label: "Polls", value: IDs.roles.Polls, emoji: "<:polls:1470541168860201072>", description: "Clicca qui per ottenere il ruolo", }, { label: "Bump", value: IDs.roles.Bump, emoji: "<:bumpstab:1470541167429947607>", description: "Clicca qui per ottenere il ruolo", }, { label: "Minigames", value: IDs.roles.Minigames, emoji: "<:health:1470541164363911313>", description: "Clicca qui per ottenere il ruolo", }, { label: "Forum", value: IDs.roles.Forum, emoji: "<:forum:1470541157724328059>", description: "Clicca qui per ottenere il ruolo", },),);
  const colorsMenu1 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("personality_colors_1").setPlaceholder("🎨 Scegli un colore per il tuo profilo").setMinValues(1).setMaxValues(1).addOptions({ label: "Rimuovi", value: "remove", emoji: "<:vegax:1443934876440068179>", description: "Rimuovi ruoli dal tuo profilo", }, { label: "Cherry", value: "1442568958656905318", emoji: "<:67241redmidnightheart:1470543833325633638>", description: "Clicca qui per ottenere il ruolo", }, { label: "Blood", value: "1442568956832645212", emoji: "<:67241redmidnightheart:1470543833325633638>", description: "Clicca qui per ottenere il ruolo", }, { label: "Scarlet", value: "1442568961077153994", emoji: "<:67241redmidnightheart:1470543833325633638>", description: "Clicca qui per ottenere il ruolo", }, { label: "Coral", value: "1442568960016121998", emoji: "<:67241redmidnightheart:1470543833325633638>", description: "Clicca qui per ottenere il ruolo", }, { label: "Carrot", value: "1442568963836874886", emoji: "<:76708orangemidnightheart:1470543838392352940>", description: "Clicca qui per ottenere il ruolo", }, { label: "Pumpkin", value: "1442568965040636019", emoji: "<:76708orangemidnightheart:1470543838392352940>", description: "Clicca qui per ottenere il ruolo", }, { label: "Orange", value: "1442568967045648412", emoji: "<:76708orangemidnightheart:1470543838392352940>", description: "Clicca qui per ottenere il ruolo", }, { label: "Peach", value: "1442568962167541760", emoji: "<:76708orangemidnightheart:1470543838392352940>", description: "Clicca qui per ottenere il ruolo", }, { label: "Mais", value: "1442568968371048449", emoji: "<:59095yellowmidnightheart:1470543825704321107>", description: "Clicca qui per ottenere il ruolo", }, { label: "Gold", value: "1442568969528541225", emoji: "<:59095yellowmidnightheart:1470543825704321107>", description: "Clicca qui per ottenere il ruolo", }, { label: "Amber", value: "1442568970497687717", emoji: "<:59095yellowmidnightheart:1470543825704321107>", description: "Clicca qui per ottenere il ruolo", }, { label: "Lime", value: "1442568971357388912", emoji: "<:56389greenmidnightheart:1470543822491619562>", description: "Clicca qui per ottenere il ruolo", }, { label: "Pear", value: "1442568972745838667", emoji: "<:56389greenmidnightheart:1470543822491619562>", description: "Clicca qui per ottenere il ruolo", }, { label: "Moss", value: "1442568975966797926", emoji: "<:56389greenmidnightheart:1470543822491619562>", description: "Clicca qui per ottenere il ruolo", },),);
  const colorsMenu2 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("personality_colors_2").setPlaceholder("🎨 Scegli un colore per il tuo profilo").setMinValues(1).setMaxValues(1).addOptions({ label: "Green", value: "1442568976944201828", emoji: "<:56389greenmidnightheart:1470543822491619562>", description: "Clicca qui per ottenere il ruolo", }, { label: "Olive", value: "1442568974486208634", emoji: "<:56389greenmidnightheart:1470543822491619562>", description: "Clicca qui per ottenere il ruolo", }, { label: "Aqua", value: "1442568977896439960", emoji: "<:16576lightbluemidnightheart:1470543819958386862>", description: "Clicca qui per ottenere il ruolo", }, { label: "Blue", value: "1442568979473371258", emoji: "<:69616midnightheart:1470543834856554722>", description: "Clicca qui per ottenere il ruolo", }, { label: "Electric Blue", value: "1442568980626673685", emoji: "<:69616midnightheart:1470543834856554722>", description: "Clicca qui per ottenere il ruolo", }, { label: "Midnight Blue", value: "1442568981792948304", emoji: "<:69616midnightheart:1470543834856554722>", description: "Clicca qui per ottenere il ruolo", }, { label: "Eggplant", value: "1442568982769959002", emoji: "<:79202purplemidnightheart:1470543839973605397>", description: "Clicca qui per ottenere il ruolo", }, { label: "Purple", value: "1442568983898357954", emoji: "<:79202purplemidnightheart:1470543839973605397>", description: "Clicca qui per ottenere il ruolo", }, { label: "Lilac", value: "1442568985278156971", emoji: "<:79202purplemidnightheart:1470543839973605397>", description: "Clicca qui per ottenere il ruolo", }, { label: "Sangria", value: "1442568986720993350", emoji: "<:79202purplemidnightheart:1470543839973605397>", description: "Clicca qui per ottenere il ruolo", }, { label: "Black Cat", value: "1442568987887276133", emoji: "<:63324blackmidnightheart:1470543828569034757>", description: "Clicca qui per ottenere il ruolo", }, { label: "Grey Smoke", value: "1442568988961013821", emoji: "<:63324blackmidnightheart:1470543828569034757>", description: "Clicca qui per ottenere il ruolo", }, { label: "Grey", value: "1442568989866725468", emoji: "<:63324blackmidnightheart:1470543828569034757>", description: "Clicca qui per ottenere il ruolo", }, { label: "White", value: "1442568991150309578", emoji: "<:70505whitemidnightheart:1470543836836135067>", description: "Clicca qui per ottenere il ruolo", },),);
  const plusColorsMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("personality_colors_plus").setPlaceholder("🎨 Seleziona un colore per il tuo profilo").setMinValues(1).setMaxValues(1).addOptions({ label: "Rimuovi", value: "remove", emoji: "<:vegax:1443934876440068179>", description: "Rimuovi ruoli dal tuo profilo", }, { label: "Red Gradient", value: IDs.roles.redPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo", }, { label: "Orange Gradient", value: IDs.roles.orangePlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo", }, { label: "Yellow Gradient", value: IDs.roles.yellowPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo", }, { label: "Green Gradient", value: IDs.roles.greenPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo", }, { label: "Blue Gradient", value: IDs.roles.bluePlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo", }, { label: "Purple Gradient", value: IDs.roles.purplePlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo", }, { label: "Pink Gradient", value: IDs.roles.pinkPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo", }, { label: "Black Gradient", value: IDs.roles.blackPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo", }, { label: "Gray Gradient", value: IDs.roles.grayPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo", }, { label: "White Gradient", value: IDs.roles.whitePlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo", }, { label: "Yin & Yang Special", value: IDs.roles.YinYangPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo", },),);
  const guildId = channel.guild?.id;
  if (!guildId) return;

  let panel = null;
  try {
    panel = await PersonalityPanel.findOneAndUpdate(
      { guildId, channelId: CHANNEL_ID },
      { $setOnInsert: { guildId, channelId: CHANNEL_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch { }

  const updatePanel = async (personalityMessageId, mentionsMessageId, colorsMessageId, plusColorsMessageId,) => { try { await PersonalityPanel.updateOne({ guildId, channelId: CHANNEL_ID }, { $set: { personalityMessageId, mentionsMessageId, colorsMessageId, plusColorsMessageId, }, },); } catch { } };
  const personalityMessage = await upsertPanelMessage(channel, client, { messageId: panel?.personalityMessageId || null, embeds: [embed], components: [pronouns, age, region, dmStatus, relationship], files: attachment ? [attachment] : [], attachmentName: attachment ? IMAGE_NAME : undefined, });
  const mentionsMessage = await upsertPanelMessage(channel, client, { messageId: panel?.mentionsMessageId || null, embeds: [mentionsEmbed], components: [mentionsMenu], files: mentionsAttachment ? [mentionsAttachment] : [], attachmentName: mentionsAttachment ? MENTIONS_IMAGE_NAME : undefined, });
  const colorsMessage = await upsertPanelMessage(channel, client, { messageId: panel?.colorsMessageId || null, embeds: [colorsEmbed], components: [colorsMenu1, colorsMenu2], files: colorsAttachment ? [colorsAttachment] : [], attachmentName: colorsAttachment ? COLORS_IMAGE_NAME : undefined, });
  const plusColorsMessage = await upsertPanelMessage(channel, client, { messageId: panel?.plusColorsMessageId || null, embeds: [plusColorsEmbed], components: [plusColorsMenu], files: plusColorsAttachment ? [plusColorsAttachment] : [], attachmentName: plusColorsAttachment ? PLUS_COLORS_IMAGE_NAME : undefined, });

  if (
    personalityMessage ||
    mentionsMessage ||
    colorsMessage ||
    plusColorsMessage
  ) {
    await updatePanel(
      personalityMessage?.id || panel?.personalityMessageId || null,
      mentionsMessage?.id || panel?.mentionsMessageId || null,
      colorsMessage?.id || panel?.colorsMessageId || null,
      plusColorsMessage?.id || panel?.plusColorsMessageId || null,
    );
  }
}

async function runTicketPanelAuto(client) {
  const IDs = require("../Utils/Config/ids");
  const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder, } = require("discord.js");
  const path = require("path");
  const { PersonalityPanel: Panel, } = require("../Schemas/Community/communitySchemas");
  const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
  const TICKET_CHANNEL_ID = IDs.channels.ticket;
  const TICKET_MEDIA_NAME = "ticket.gif";
  const TICKET_MEDIA_PATH = path.join(__dirname, "..", "Photos", TICKET_MEDIA_NAME,);
  const DIVIDER_URL = "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";
  const channel = client.channels.cache.get(TICKET_CHANNEL_ID) || (await client.channels.fetch(TICKET_CHANNEL_ID).catch(() => null));
  if (!channel?.isTextBased?.()) return;
  const guildId = channel.guild?.id;
  if (!guildId) return;
  const attachment = new AttachmentBuilder(TICKET_MEDIA_PATH, { name: TICKET_MEDIA_NAME, });
  const ticketInfoEmbed = new EmbedBuilder().setColor("#6f4e37").setDescription(`<:reportmessage:1443670575376765130> Benvenuto nella **sezione** dedicata all'__assistenza__! Apri un **ticket** in base alle tue _esigenze_ e ricorda di **rispettare** il regolamento.

<:dot:1443660294596329582> Massimo **__\`1\`__** ticket alla volta;
<:dot:1443660294596329582> Scegli **sempre** la giusta sezione;
<:dot:1443660294596329582> Non **abusare** dei __ticket__;
<:dot:1443660294596329582> Non aprire ticket __inutili__;`,).setImage(DIVIDER_URL);

  const ticketPanelEmbed = new EmbedBuilder().setColor("#6f4e37").setAuthor({ name: "Contatta lo Staff & chiedi supporto:", iconURL: channel.guild?.iconURL() || undefined, }).setDescription(`I ticket equivalgono a un sistema di supporto che permette di parlare direttamente con lo staff con il fine di chiedere chiarimenti, fare domande agli staffers riguardo al server, segnalare un accaduto all'interno di quest'ultimo o per altre richieste.

<:VC_1:1444099819680563200> **Prima categoria**
<a:VC_Arrow:1448672967721615452> Usalo per fare segnalazioni, riportare dei problemi o bug, per avere delle informazioni o per qualunque altra cosa che non rientra nelle categorie sottostanti.
<:VC_2:1444099781864722535> **Seconda categoria**
<a:VC_Arrow:1448672967721615452> Usalo per fare partnership con noi.
<:VC_3:1444099746116534282> **Terza categoria**
<a:VC_Arrow:1448672967721615452> Usalo per fare una donazione, per fare la "selfie verify", per richiedere una sponsor a pagamento o per parlare con un amministratore del server.

<:attentionfromvega:1443651874032062505> Aprire un ticket **__inutile__** oppure **__non rispondere__** nell'arco di **\`24\` ore** comporterà un **warn**.`,).setFooter({ text: `Non garantiamo risposta negli orari notturni, dalle 00:00 alle 10:00`, }).setImage(DIVIDER_URL);

  const ticketMenu = new StringSelectMenuBuilder().setCustomId("ticket_open_menu").setPlaceholder("🎫 Seleziona una categoria...").addOptions({ label: "Prima categoria", description: "Supporto generale • Segnalazioni • Problemi", value: "ticket_supporto", emoji: { id: "1443651872258003005", name: "discordstaff" }, }, { label: "Seconda categoria", description: "Partnership", value: "ticket_partnership", emoji: { id: "1443651871125409812", name: "partneredserverowner" }, }, { label: "Terza categoria", description: "Verifica Selfie • Donazioni • Sponsor • High Staff", value: "ticket_highstaff", emoji: { id: "1443670575376765130", name: "reportmessage" }, },);
  const ticketSelectRow = new ActionRowBuilder().addComponents(ticketMenu);

  let panelDoc = null;
  try {
    panelDoc = await Panel.findOneAndUpdate(
      { guildId, channelId: TICKET_CHANNEL_ID },
      { $setOnInsert: { guildId, channelId: TICKET_CHANNEL_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch { }

  const infoMessage = await upsertPanelMessage(channel, client, { messageId: panelDoc?.ticketInfoMessageId || null, files: [attachment], embeds: [ticketInfoEmbed], components: [], attachmentName: TICKET_MEDIA_NAME, });
  const panelMessage = await upsertPanelMessage(channel, client, { messageId: panelDoc?.ticketPanelMessageId || null, embeds: [ticketPanelEmbed], components: [ticketSelectRow], });

  if (infoMessage?.id || panelMessage?.id) {
    await Panel.updateOne(
      { guildId, channelId: TICKET_CHANNEL_ID },
      {
        $set: {
          ticketInfoMessageId:
            infoMessage?.id || panelDoc?.ticketInfoMessageId || null,
          ticketPanelMessageId:
            panelMessage?.id || panelDoc?.ticketPanelMessageId || null,
        },
      },
    ).catch(() => { });
  }
}

const path = require("path");
const fs = require("fs");
const SPONSOR_PANEL_COLOR = "#6f4e37";
const TAG_IMAGE_NAME = "guildtag.gif";
const TICKET_IMAGE_NAME = "ticket.gif";
const TAG_IMAGE_PATH = path.join(__dirname, "..", "Photos", TAG_IMAGE_NAME);
const TICKET_IMAGE_PATH = path.join(__dirname, "..", "Photos", TICKET_IMAGE_NAME);
const IDs = require("../Utils/Config/ids");

function sponsorDividerLine() {
  return "<a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531>";
}

function buildSponsorTagEmbed(config, boosterRoleMention) {
  const { EmbedBuilder } = require("discord.js");
  return new EmbedBuilder()
    .setColor(SPONSOR_PANEL_COLOR)
    .setDescription(
      [
        `## <:LC_wNew:1471891729471770819> ── .✦ <a:VC_RightWing:1448672889845973214> ₊⋆˚｡ ${config.tagName}'s Guild-TAG`,
        sponsorDividerLine(),
        "",
        "",
        "**<a:VC_Arrow:1448672967721615452> Come mantenere la Guild-TAG <:PinkQuestionMark:1471892611026391306>**",
        "────────୨ৎ────────",
        "<a:VC_Exclamation:1448687427836444854> Ti basta essere parte di https://discord.gg/viniliecaffe oppure",
        `boostare questo server (<a:flyingnitroboost:1443652205705170986> ${boosterRoleMention})`,
        "",
        "",
        "**<a:VC_Arrow:1448672967721615452> How to keep the Guild-TAG <:PinkQuestionMark:1471892611026391306>**",
        "────────୨ৎ────────",
        "<a:VC_Exclamation:1448687427836444854> You just need to be in https://discord.gg/viniliecaffe or boost",
        `this server (<a:flyingnitroboost:1443652205705170986> ${boosterRoleMention})`,
        "",
        "",
        "<:VC_PepeComfy:1331591439599272004> Keep up! Nuovi aggiornamenti in arrivo...",
      ].join("\n"),
    )
    .setFooter({
      text: `.gg/viniliecaffe • ${new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    });
}

function buildSponsorTicketEmbed(config, guildedRoleMention) {
  const { EmbedBuilder } = require("discord.js");
  return new EmbedBuilder()
    .setColor(SPONSOR_PANEL_COLOR)
    .setTitle(`༄${config.emoji}︲${config.tagName}'s Ticket`)
    .setDescription(
      `Clicca sul menù per aprire un ticket e claimare il tuo ruolo ${guildedRoleMention} su questo server e su quello principale.`,
    );
}

function buildSponsorTicketMenuRow() {
  const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
  const menu = new StringSelectMenuBuilder().setCustomId("ticket_open_menu").setPlaceholder("🎫 Seleziona una categoria...").addOptions({ label: "Prima categoria", description: "Riscatto Ruolo", value: "ticket_supporto", emoji: { id: "1443651872258003005", name: "discordstaff" }, });
  return new ActionRowBuilder().addComponents(menu);
}

async function sponsorFetchGuild(client, guildId) {
  return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

async function sponsorEnsureChannelsFetched(guild) {
  if (!guild?.channels?.fetch) return;
  await guild.channels.fetch().catch(() => { });
}

async function sponsorFetchTextChannel(guild, channelId) {
  if (!channelId) return null;
  let ch = guild.channels.cache.get(channelId);
  if (!ch) ch = await guild.channels.fetch(channelId).catch(() => null);
  return ch?.isTextBased?.() ? ch : null;
}

async function sponsorResolveRoleMention(guild, roleId, fallback = "`Role`") {
  if (!guild || !roleId) return fallback;
  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  return role ? `<@&${role.id}>` : fallback;
}

async function sponsorFindFallbackTicketChannel(guild) {
  const channel = guild.channels.cache.find((ch) => { if (!ch?.isTextBased?.()) return false; const name = String(ch.name || "").toLowerCase(); return name.includes("ticket") || name.includes("assistenza") || name.includes("support"); });
  return channel || null;
}

async function sponsorGetOrCreatePanelDoc(guildId, channelId) {
  const { PersonalityPanel } = require("../Schemas/Community/communitySchemas");
  return PersonalityPanel.findOneAndUpdate(
    { guildId, channelId },
    { $setOnInsert: { guildId, channelId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

function sponsorMaybeAttachment(filePath, fileName, logLabel) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const { AttachmentBuilder } = require("discord.js");
    return new AttachmentBuilder(filePath, { name: fileName });
  } catch {
    global.logger.warn(`[${logLabel}] Image not found, sending without image`);
    return null;
  }
}

async function processOneGuildTagPanel(client, guildId, config) {
  const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
  const { PersonalityPanel } = require("../Schemas/Community/communitySchemas");

  const guild = await sponsorFetchGuild(client, guildId);
  if (!guild) {
    global.logger.warn("[SPONSOR GUILD TAG] Guild not found:", guildId);
    return;
  }
  const channel = await sponsorFetchTextChannel(guild, config.channelId);
  if (!channel) {
    global.logger.warn("[SPONSOR GUILD TAG] Channel not found:", guildId, config.channelId);
    return;
  }
  let boosterRoleMention = "`Server Booster`";
  if (config.boosterRoleId) {
    const role = await guild.roles.fetch(config.boosterRoleId).catch(() => null);
    if (role) boosterRoleMention = `<@&${role.id}>`;
  }
  const embed = buildSponsorTagEmbed(config, boosterRoleMention);
  const attachment = sponsorMaybeAttachment(TAG_IMAGE_PATH, TAG_IMAGE_NAME, "SPONSOR GUILD TAG");
  if (attachment) embed.setImage(`attachment://${TAG_IMAGE_NAME}`);

  const panelDoc = await sponsorGetOrCreatePanelDoc(guildId, config.channelId).catch((err) => { global.logger.error("[SPONSOR GUILD TAG] Panel doc:", err); return null; });
  if (!panelDoc) return;

  const messagePayload = { messageId: panelDoc.infoMessageId1 || null, embeds: [embed], components: [], ...(attachment ? { files: [attachment], attachmentName: TAG_IMAGE_NAME } : {}), };
  const sentMessage = await upsertPanelMessage(channel, client, messagePayload);
  if (sentMessage?.id) {
    await PersonalityPanel.updateOne(
      { guildId, channelId: config.channelId },
      { $set: { infoMessageId1: sentMessage.id } },
    ).catch(() => { });
  } else if (messagePayload.messageId) {
    await PersonalityPanel.updateOne(
      { guildId, channelId: config.channelId },
      { $set: { infoMessageId1: null } },
    ).catch(() => { });
  }
}

async function runSponsorGuildTagPanels(client) {
  const guildTagConfig = IDs.sponsorGuildTagConfig || {};
  const entries = Object.entries(guildTagConfig);
  for (let i = 0; i < entries.length; i += SPONSOR_BATCH_SIZE) {
    const batch = entries.slice(i, i + SPONSOR_BATCH_SIZE);
    await Promise.all(
      batch.map(([guildId, config]) =>
        processOneGuildTagPanel(client, guildId, config).catch((err) => global.logger.error("[SPONSOR GUILD TAG] Error guild " + guildId, err)),
      ),
    );
  }
}

async function runSponsorPanel(client) {
  try {
    await runSponsorGuildTagPanels(client);
    return 1;
  } catch (err) {
    global.logger.error("[SPONSOR] runSponsorPanel (Guild-TAG):", err?.message || err);
    return 0;
  }
}

async function processOneVerifyPanel(client, guildId, verifyChannelIds) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
  const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
  const { PersonalityPanel } = require("../Schemas/Community/communitySchemas");

  const guild = await sponsorFetchGuild(client, guildId);
  if (!guild) {
    global.logger.warn("[SPONSOR] Verify panel: guild non trovata:", guildId);
    return 0;
  }
  await sponsorEnsureChannelsFetched(guild);
  let channel = await sponsorFetchTextChannel(guild, verifyChannelIds[guildId]);
  if (!channel) channel = guild.channels.cache.find((ch) => ch.name?.toLowerCase().includes("start")) || null;
  if (!channel?.isTextBased?.()) {
    global.logger.warn("[SPONSOR] Verify panel: canale non trovato in guild " + guild.name + " (" + guildId + ").");
    return 0;
  }

  const color = client.config?.embedVerify || SPONSOR_PANEL_COLOR;
  const verifyEmbed = new EmbedBuilder().setColor(color).setTitle("<:verification:1461725843125571758> **`Verification Required!`**").setDescription("<:space:1461733157840621608> <:alarm:1461725841451909183> **Per accedere a `" + (guild.name || "this server") + "` devi prima verificarti.**\n" + "<:space:1461733157840621608><:space:1461733157840621608> <:rightSort:1461726104422453298> Clicca il pulsante **Verify** qui sotto per iniziare.",);
  const verifyRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("verify_start").setEmoji(`<a:VC_Verified:1448687631109197978>`).setLabel("︲VERIFY").setStyle(ButtonStyle.Success),);

  const panelDoc = await sponsorGetOrCreatePanelDoc(guildId, channel.id).catch(() => null);
  if (!panelDoc) return 0;

  const verifyPayload = { messageId: panelDoc.verifyPanelMessageId || null, embeds: [verifyEmbed], components: [verifyRow], };
  const panelMessage = await upsertPanelMessage(channel, client, verifyPayload);
  if (panelMessage?.id) {
    await PersonalityPanel.updateOne(
      { guildId, channelId: channel.id },
      { $set: { verifyPanelMessageId: panelMessage.id } },
    ).catch(() => { });
  } else if (verifyPayload.messageId) {
    await PersonalityPanel.updateOne(
      { guildId, channelId: channel.id },
      { $set: { verifyPanelMessageId: null } },
    ).catch(() => { });
  }
  return panelMessage?.id ? 1 : 0;
}

async function runSponsorVerifyPanels(client) {
  let sponsorGuildIds = Array.isArray(client.config?.sponsorGuildIds) ? [...client.config.sponsorGuildIds] : [];
  const verifyChannelIds = client.config?.sponsorVerifyChannelIds || {};
  if (sponsorGuildIds.length === 0) sponsorGuildIds = Object.keys(verifyChannelIds);
  if (sponsorGuildIds.length === 0) {
    global.logger.warn("[SPONSOR] runSponsorVerifyPanels: nessuna guild in config.");
    return 0;
  }

  let sent = 0;
  for (let i = 0; i < sponsorGuildIds.length; i += SPONSOR_BATCH_SIZE) {
    const batch = sponsorGuildIds.slice(i, i + SPONSOR_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((guildId) =>
        processOneVerifyPanel(client, guildId, verifyChannelIds).catch((err) => {
          global.logger.error("[SPONSOR] runSponsorVerifyPanels guild " + guildId + ":", err?.message || err);
          return 0;
        }),
      ),
    );
    sent += results.reduce((a, n) => a + n, 0);
  }
  return sent;
}

async function processOneSponsorTicketPanel(client, guildId, config) {
  const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
  const { PersonalityPanel } = require("../Schemas/Community/communitySchemas");

  const guild = await sponsorFetchGuild(client, guildId);
  if (!guild) return;
  await sponsorEnsureChannelsFetched(guild);
  const guildedRoleMention = await sponsorResolveRoleMention(guild, config.guildedRoleId, "`Guilded`");

  let channel = await sponsorFetchTextChannel(guild, config.ticketChannelId);
  if (!channel) channel = await sponsorFindFallbackTicketChannel(guild);
  if (!channel?.isTextBased?.()) return;

  const attachment = sponsorMaybeAttachment(TICKET_IMAGE_PATH, TICKET_IMAGE_NAME, "SPONSOR TICKET");
  const embed = buildSponsorTicketEmbed(config, guildedRoleMention);
  const ticketRow = buildSponsorTicketMenuRow();

  const panelDoc = await sponsorGetOrCreatePanelDoc(guildId, channel.id).catch(() => null);
  const ticketPayload = { messageId: panelDoc?.sponsorTicketPanelMessageId || null, embeds: [embed], components: [ticketRow], ...(attachment ? { files: [attachment], attachmentName: TICKET_IMAGE_NAME } : {}), };
  const sentMessage = await upsertPanelMessage(channel, client, ticketPayload);
  if (sentMessage?.id) {
    await PersonalityPanel.updateOne(
      { guildId, channelId: channel.id },
      { $set: { sponsorTicketPanelMessageId: sentMessage.id } },
    ).catch(() => { });
  } else if (ticketPayload.messageId) {
    await PersonalityPanel.updateOne(
      { guildId, channelId: channel.id },
      { $set: { sponsorTicketPanelMessageId: null } },
    ).catch(() => { });
  }
}

async function runSponsorTicketPanels(client) {
  const ticketConfig = IDs.sponsorTicketConfig || {};
  const entries = Object.entries(ticketConfig);
  for (let i = 0; i < entries.length; i += SPONSOR_BATCH_SIZE) {
    const batch = entries.slice(i, i + SPONSOR_BATCH_SIZE);
    await Promise.all(
      batch.map(([guildId, config]) =>
        processOneSponsorTicketPanel(client, guildId, config).catch((err) => global.logger.error("[SPONSOR TICKET] Error guild " + guildId, err)),
      ),
    );
  }
}


async function runStaffListAuto(client) {
  const IDs = require("../Utils/Config/ids");
  const { refreshStaffList } = require("../Utils/Community/staffListUtils");

  await refreshStaffList(client, IDs.guilds.main).catch(
    (err) => {
      global.logger.error("[STAFF LIST] initial render failed:", err);
    },
  );
}

async function runPanelTask(section, label, runner, client) {
  const startedAt = Date.now();
  try {
    await runner(client);
    const elapsed = Date.now() - startedAt;
    if (elapsed >= 1000) {
      global.logger?.info?.(
        `[PANELS:${section}] ${label} completed in ${elapsed}ms.`,
      );
    }
  } catch (err) {
    global.logger.error(`[CLIENT READY:${section}] ${label} failed:`, err);
  }
}

async function runMenuAndSelectSections(client) {
  const startedAt = Date.now();
  await runPanelTask(
    "runMenuAndSelectSections",
    "runRuoliPanelAuto",
    runRuoliPanelAuto,
    client,
  );
  await runPanelTask(
    "runMenuAndSelectSections",
    "runTicketPanelAuto",
    runTicketPanelAuto,
    client,
  );
  global.logger?.info?.(
    `[PANELS] runMenuAndSelectSections finished in ${Date.now() - startedAt}ms.`,
  );
}

async function runEmbedWithButtonsSections(client) {
  const startedAt = Date.now();
  await runPanelTask(
    "runEmbedWithButtonsSections",
    "runEmbedCandidaturePanelAuto",
    runEmbedCandidaturePanelAuto,
    client,
  );
  await runPanelTask(
    "runEmbedWithButtonsSections",
    "runInfoPanelAuto",
    runInfoPanelAuto,
    client,
  );
  await runPanelTask(
    "runEmbedWithButtonsSections",
    "runStaffEmbedAuto",
    runStaffEmbedAuto,
    client,
  );
  await runPanelTask(
    "runEmbedWithButtonsSections",
    "runVerifyPanelAuto",
    runVerifyPanelAuto,
    client,
  );
  await runPanelTask(
    "runEmbedWithButtonsSections",
    "runSponsorPanel",
    runSponsorPanel,
    client,
  );
  await runPanelTask(
    "runEmbedWithButtonsSections",
    "runSponsorVerifyPanels",
    runSponsorVerifyPanels,
    client,
  );
  await runPanelTask(
    "runEmbedWithButtonsSections",
    "runSponsorTicketPanels",
    runSponsorTicketPanels,
    client,
  );
  global.logger?.info?.(
    `[PANELS] runEmbedWithButtonsSections finished in ${Date.now() - startedAt}ms.`,
  );
}

async function runEmbedOnlySections(client) {
  const startedAt = Date.now();
  await runPanelTask(
    "runEmbedOnlySections",
    "runStaffListAuto",
    runStaffListAuto,
    client,
  );
  global.logger?.info?.(
    `[PANELS] runEmbedOnlySections finished in ${Date.now() - startedAt}ms.`,
  );
}

const WARMUP_SPONSOR_DELAY_MS = 500;
const WARMUP_SPONSOR_BETWEEN_MS = 100;
const SPONSOR_BATCH_SIZE = 6;

async function warmupSponsorGuilds(client) {
  const startedAt = Date.now();
  const sponsorIds = Array.isArray(client.config?.sponsorGuildIds) ? client.config.sponsorGuildIds : Object.keys(client.config?.sponsorVerifyChannelIds || {});
  if (sponsorIds.length === 0) return;

  await new Promise((r) => {
    const timer = setTimeout(r, WARMUP_SPONSOR_DELAY_MS);
    timer.unref?.();
  });
  for (let i = 0; i < sponsorIds.length; i += SPONSOR_BATCH_SIZE) {
    const batch = sponsorIds.slice(i, i + SPONSOR_BATCH_SIZE);
    await Promise.all(
      batch.map((guildId) => client.guilds.fetch(guildId).catch((err) => { global.logger.warn("[SPONSOR] Warmup guild " + guildId + ":", err?.message || err); return null; })),
    );
    if (i + SPONSOR_BATCH_SIZE < sponsorIds.length) {
      await new Promise((r) => { const t = setTimeout(r, WARMUP_SPONSOR_BETWEEN_MS); t.unref?.(); });
    }
  }
  global.logger?.info?.(
    `[PANELS] warmupSponsorGuilds finished in ${Date.now() - startedAt}ms for ${sponsorIds.length} guild(s).`,
  );
}

async function runAllClientReadyPanels(client) {
  const startedAt = Date.now();
  await warmupSponsorGuilds(client);
  await runMenuAndSelectSections(client);
  await runEmbedWithButtonsSections(client);
  await runEmbedOnlySections(client);
  global.logger?.info?.(
    `[PANELS] runAllClientReadyPanels finished in ${Date.now() - startedAt}ms.`,
  );
}

module.exports = {
  name: "startupPanelsInternal",
  once: false,
  async execute(client) {
    await runAllClientReadyPanels(client);
  },
};