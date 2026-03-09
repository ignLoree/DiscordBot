const path = require("path");
const fs = require("fs");
const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { PersonalityPanel } = require("../Schemas/Community/communitySchemas");
const IDs = require("../Utils/Config/ids");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");

const CHANNEL_ID = IDs.channels.ruoliColori;
const IMAGE_NAME = "personalità.gif";
const IMAGE_PATH = path.join(__dirname, "..", "Photos", IMAGE_NAME);
const IMAGE_PATH_ASCII = path.join(__dirname, "..", "Photos", "personalita.gif");
const MENTIONS_IMAGE_NAME = "menzioni.gif";
const MENTIONS_IMAGE_PATH = path.join(__dirname, "..", "Photos", MENTIONS_IMAGE_NAME);
const COLORS_IMAGE_NAME = "colori.gif";
const COLORS_IMAGE_PATH = path.join(__dirname, "..", "Photos", COLORS_IMAGE_NAME);
const PLUS_COLORS_IMAGE_NAME = "coloriPlus.gif";
const PLUS_COLORS_IMAGE_PATH = path.join(__dirname, "..", "Photos", PLUS_COLORS_IMAGE_NAME);
const DIVIDER_URL = "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";

async function run(client) {
  const channel = client.channels.cache.get(CHANNEL_ID) || (await client.channels.fetch(CHANNEL_ID).catch(() => null));
  if (!channel) return;
  const personalityPhotoPath = fs.existsSync(IMAGE_PATH) ? IMAGE_PATH : (fs.existsSync(IMAGE_PATH_ASCII) ? IMAGE_PATH_ASCII : null);
  const attachment = personalityPhotoPath ? new AttachmentBuilder(personalityPhotoPath, { name: IMAGE_NAME }) : null;
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:sparkledred:1470064814502973591> Personalità")
    .setDescription(["Scegli in cosa ti identifichi, quanti anni hai e di dove sei. Utilizza i menù a tendina sottostanti.", "", "<a:VC_Exclamation:1448687427836444854> Massimo **1** ruolo per categoria."].join("\n"))
    .setImage(DIVIDER_URL);
  const mentionsAttachment = fs.existsSync(MENTIONS_IMAGE_PATH) ? new AttachmentBuilder(MENTIONS_IMAGE_PATH, { name: MENTIONS_IMAGE_NAME }) : null;
  const mentionsEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:sparkledred:1470064814502973591> Personalità")
    .setDescription(["Scegli quali notifiche ricevere dal server in base a cosa ti interessa maggiormente.", "", "<a:VC_Exclamation:1448687427836444854> Le notifiche di **@everyone** le riceveranno tutti."].join("\n"))
    .setImage(DIVIDER_URL);
  const colorsAttachment = fs.existsSync(COLORS_IMAGE_PATH) ? new AttachmentBuilder(COLORS_IMAGE_PATH, { name: COLORS_IMAGE_NAME }) : null;
  const colorsEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:sparkledred:1470064814502973591> Personalità")
    .setDescription(["Scegli il colore per personalizzare il nome del tuo profilo quando scrivi in chat.", "", "<a:VC_Exclamation:1448687427836444854> Verrà mostrato il **colore più in alto** nella lista dei ruoli nel tuo profilo."].join("\n"))
    .setImage(DIVIDER_URL);
  const plusColorsAttachment = fs.existsSync(PLUS_COLORS_IMAGE_PATH) ? new AttachmentBuilder(PLUS_COLORS_IMAGE_PATH, { name: PLUS_COLORS_IMAGE_NAME }) : null;
  const plusColorsEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:sparkledred:1470064814502973591> Personalità")
    .setDescription(
      [
        'Scegli il colore che più ti piace per il tuo profilo! Utilizza il menù a tendina sottostante. __Rimuovi i colori__ con la "<:vegax:1443934876440068179>" in alto.',
        "",
        `⚠️ Questi ruoli sono riservati a coloro con questi ruoli: <@&${IDs.roles.ServerBooster}> e/o <@&${IDs.roles.Level50}>`,
        "",
        "<:sparkle:1470064801811140866> **LISTA COLORI:**",
        `<:VC_1:1444099819680563200> <@&${IDs.roles.redPlus}>`,
        `<:VC_2:1444099781864722535> <@&${IDs.roles.orangePlus}>`,
        `<:VC_3:1444099746116534282> <@&${IDs.roles.yellowPlus}>`,
        `<:VC_4:1444099708292169740> <@&${IDs.roles.greenPlus}>`,
        `<:VC_5:1444099671894134947> <@&${IDs.roles.bluePlus}>`,
        `<:VC_6:1444099623714033838> <@&${IDs.roles.purplePlus}>`,
        `<:VC_7:1444099572916945120> <@&${IDs.roles.pinkPlus}>`,
        `<:VC_8:1444099520500600998> <@&${IDs.roles.blackPlus}>`,
        `<:VC_9:1444099441790554182> <@&${IDs.roles.grayPlus}>`,
        `<:VC_10:1469357839066730627> <@&${IDs.roles.whitePlus}>`,
        `<:VC_11:1469772033410859173> <@&${IDs.roles.YinYangPlus}>`,
      ].join("\n"),
    )
    .setImage(DIVIDER_URL);
  const pronouns = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_pronouns")
      .setPlaceholder("⭐ Seleziona i tuoi pronomi")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi i ruoli di sesso", description: "Rimuovi ruoli dal tuo profilo", value: "remove", emoji: "<:vegax:1443934876440068179>" },
        { label: "he/him", value: "1442568997848743997", emoji: "<:hehim:1470534612198494258>", description: "Clicca qui per ottenere il ruolo" },
        { label: "she/her", value: "1442568999043989565", emoji: "<:sheher:1470534614023143485>", description: "Clicca qui per ottenere il ruolo" },
        { label: "they/them", value: "1442569000063074498", emoji: "<:theythem:1470534615818178782>", description: "Clicca qui per ottenere il ruolo" },
        { label: "ask me", value: "1442569001367769210", emoji: "<:askme:1470534617458151424>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
  const age = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_age")
      .setPlaceholder("🎂 Seleziona la tua età")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi i ruoli di età", value: "remove", description: "Rimuovi ruoli dal tuo profilo", emoji: "<:vegax:1443934876440068179>" },
        { label: "13-14", value: "1442568993197265021", emoji: "<:ageadultids:1470541163219128444>", description: "Clicca qui per ottenere il ruolo" },
        { label: "15-16", value: "1442568994581381170", emoji: "<:ageadultids:1470541163219128444>", description: "Clicca qui per ottenere il ruolo" },
        { label: "17-18", value: "1442568995348807691", emoji: "<:ageids:1470541159351976066>", description: "Clicca qui per ottenere il ruolo" },
        { label: "19+", value: "1442568996774871194", emoji: "<:ageids:1470541159351976066>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
  const region = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_region")
      .setPlaceholder("🌍 Seleziona la tua località")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi i ruoli di provenienza", value: "remove", description: "Rimuovi ruoli dal tuo profilo", emoji: "<:vegax:1443934876440068179>" },
        { label: "Nord", value: "1442569021861007443", emoji: "<a:peepoitaly:1470537719225520341>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Centro", value: "1442569023303974922", emoji: "<a:peepoitaly:1470537719225520341>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Sud", value: "1442569024486506498", emoji: "<a:peepoitaly:1470537719225520341>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Estero", value: "1442569025790939167", emoji: "<:wplace:1470537717426294886>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
  const dmStatus = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_dm")
      .setPlaceholder("💬 Seleziona il tuo stato DM")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi i ruoli DM", value: "remove", description: "Rimuovi ruoli dal tuo profilo", emoji: "<:vegax:1443934876440068179>" },
        { label: "DMs Opened", value: "1442569004215697438", emoji: "<:opendm:1470536793504878664>", description: "Clicca qui per ottenere il ruolo" },
        { label: "DMs Closed", value: "1442569005071077417", emoji: "<:nodm:1470536791764373608>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Ask to DM", value: "1442569006543274126", emoji: "<:ask2dm:1470536789637726345>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
  const relationship = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_relationship")
      .setPlaceholder("💘 Seleziona il tuo stato sentimentale")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi i ruoli sentimentali", value: "remove", description: "Rimuovi ruoli dal tuo profilo", emoji: "<:vegax:1443934876440068179>" },
        { label: "Fidanzato/a", value: "1442569028173299732", emoji: "<:stitchinlove:1470538823103414373>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Single", value: "1442569029263818906", emoji: "<:stitchlove:1470538821656641761>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
  const mentionsMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_mentions")
      .setPlaceholder("🔔 Seleziona le notifiche da ricevere")
      .setMinValues(1)
      .setMaxValues(7)
      .addOptions(
        { label: "Rimuovi", value: "remove", emoji: "<:vegax:1443934876440068179>", description: "Rimuovi ruoli dal tuo profilo" },
        { label: "Revive Chat", value: IDs.roles.ReviveChat, emoji: "<a:pepedeadchat:1470541176284381226>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Events", value: IDs.roles.Events, emoji: "<a:announce:1470541173507751957>", description: "Clicca qui per ottenere il ruolo" },
        { label: "News", value: IDs.roles.News, emoji: "<:newspaper:1470541170353377290>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Polls", value: IDs.roles.Polls, emoji: "<:polls:1470541168860201072>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Bump", value: IDs.roles.Bump, emoji: "<:bumpstab:1470541167429947607>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Minigames", value: IDs.roles.Minigames, emoji: "<:health:1470541164363911313>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Forum", value: IDs.roles.Forum, emoji: "<:forum:1470541157724328059>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
  const colorsMenu1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_colors_1")
      .setPlaceholder("🎨 Scegli un colore per il tuo profilo")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi", value: "remove", emoji: "<:vegax:1443934876440068179>", description: "Rimuovi ruoli dal tuo profilo" },
        { label: "Cherry", value: "1442568958656905318", emoji: "<:67241redmidnightheart:1470543833325633638>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Blood", value: "1442568956832645212", emoji: "<:67241redmidnightheart:1470543833325633638>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Scarlet", value: "1442568961077153994", emoji: "<:67241redmidnightheart:1470543833325633638>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Coral", value: "1442568960016121998", emoji: "<:67241redmidnightheart:1470543833325633638>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Carrot", value: "1442568963836874886", emoji: "<:76708orangemidnightheart:1470543838392352940>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Pumpkin", value: "1442568965040636019", emoji: "<:76708orangemidnightheart:1470543838392352940>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Orange", value: "1442568967045648412", emoji: "<:76708orangemidnightheart:1470543838392352940>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Peach", value: "1442568962167541760", emoji: "<:76708orangemidnightheart:1470543838392352940>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Mais", value: "1442568968371048449", emoji: "<:59095yellowmidnightheart:1470543825704321107>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Gold", value: "1442568969528541225", emoji: "<:59095yellowmidnightheart:1470543825704321107>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Amber", value: "1442568970497687717", emoji: "<:59095yellowmidnightheart:1470543825704321107>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Lime", value: "1442568971357388912", emoji: "<:56389greenmidnightheart:1470543822491619562>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Pear", value: "1442568972745838667", emoji: "<:56389greenmidnightheart:1470543822491619562>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Moss", value: "1442568975966797926", emoji: "<:56389greenmidnightheart:1470543822491619562>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
  const colorsMenu2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_colors_2")
      .setPlaceholder("🎨 Scegli un colore per il tuo profilo")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Green", value: "1442568976944201828", emoji: "<:56389greenmidnightheart:1470543822491619562>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Olive", value: "1442568974486208634", emoji: "<:56389greenmidnightheart:1470543822491619562>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Aqua", value: "1442568977896439960", emoji: "<:16576lightbluemidnightheart:1470543819958386862>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Blue", value: "1442568979473371258", emoji: "<:69616midnightheart:1470543834856554722>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Electric Blue", value: "1442568980626673685", emoji: "<:69616midnightheart:1470543834856554722>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Midnight Blue", value: "1442568981792948304", emoji: "<:69616midnightheart:1470543834856554722>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Eggplant", value: "1442568982769959002", emoji: "<:79202purplemidnightheart:1470543839973605397>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Purple", value: "1442568983898357954", emoji: "<:79202purplemidnightheart:1470543839973605397>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Lilac", value: "1442568985278156971", emoji: "<:79202purplemidnightheart:1470543839973605397>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Sangria", value: "1442568986720993350", emoji: "<:79202purplemidnightheart:1470543839973605397>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Black Cat", value: "1442568987887276133", emoji: "<:63324blackmidnightheart:1470543828569034757>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Grey Smoke", value: "1442568988961013821", emoji: "<:63324blackmidnightheart:1470543828569034757>", description: "Clicca qui per ottenere il ruolo" },
        { label: "Grey", value: "1442568989866725468", emoji: "<:63324blackmidnightheart:1470543828569034757>", description: "Clicca qui per ottenere il ruolo" },
        { label: "White", value: "1442568991150309578", emoji: "<:70505whitemidnightheart:1470543836836135067>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
  const plusColorsMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_colors_plus")
      .setPlaceholder("🎨 Seleziona un colore per il tuo profilo")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi", value: "remove", emoji: "<:vegax:1443934876440068179>", description: "Rimuovi ruoli dal tuo profilo" },
        { label: "Red Gradient", value: IDs.roles.redPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "Orange Gradient", value: IDs.roles.orangePlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "Yellow Gradient", value: IDs.roles.yellowPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "Green Gradient", value: IDs.roles.greenPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "Blue Gradient", value: IDs.roles.bluePlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "Purple Gradient", value: IDs.roles.purplePlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "Pink Gradient", value: IDs.roles.pinkPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "Black Gradient", value: IDs.roles.blackPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "Gray Gradient", value: IDs.roles.grayPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "White Gradient", value: IDs.roles.whitePlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "Yin & Yang Special", value: IDs.roles.YinYangPlus, emoji: { id: "1448691936797134880", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
      ),
  );

  const guildId = channel.guild?.id;
  if (!guildId) return;

  let panel = null;
  try {
    panel = await PersonalityPanel.findOneAndUpdate(
      { guildId, channelId: CHANNEL_ID },
      { $setOnInsert: { guildId, channelId: CHANNEL_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[embeds] ", err?.message || err);
  }

  const updatePanel = async (personalityMessageId, mentionsMessageId, colorsMessageId, plusColorsMessageId) => {
    try {
      await PersonalityPanel.updateOne({ guildId, channelId: CHANNEL_ID }, { $set: { personalityMessageId, mentionsMessageId, colorsMessageId, plusColorsMessageId } });
    } catch (err) {
      global.logger?.warn?.("[embeds] updatePanel:", err?.message || err);
    }
  };
  const personalityMessage = await upsertPanelMessage(channel, client, { messageId: panel?.personalityMessageId || null, embeds: [embed], components: [pronouns, age, region, dmStatus, relationship], files: attachment ? [attachment] : [], attachmentName: attachment ? IMAGE_NAME : undefined });
  const mentionsMessage = await upsertPanelMessage(channel, client, { messageId: panel?.mentionsMessageId || null, embeds: [mentionsEmbed], components: [mentionsMenu], files: mentionsAttachment ? [mentionsAttachment] : [], attachmentName: mentionsAttachment ? MENTIONS_IMAGE_NAME : undefined });
  const colorsMessage = await upsertPanelMessage(channel, client, { messageId: panel?.colorsMessageId || null, embeds: [colorsEmbed], components: [colorsMenu1, colorsMenu2], files: colorsAttachment ? [colorsAttachment] : [], attachmentName: colorsAttachment ? COLORS_IMAGE_NAME : undefined });
  const plusColorsMessage = await upsertPanelMessage(channel, client, { messageId: panel?.plusColorsMessageId || null, embeds: [plusColorsEmbed], components: [plusColorsMenu], files: plusColorsAttachment ? [plusColorsAttachment] : [], attachmentName: plusColorsAttachment ? PLUS_COLORS_IMAGE_NAME : undefined });

  if (personalityMessage || mentionsMessage || colorsMessage || plusColorsMessage) {
    await updatePanel(
      personalityMessage?.id || panel?.personalityMessageId || null,
      mentionsMessage?.id || panel?.mentionsMessageId || null,
      colorsMessage?.id || panel?.colorsMessageId || null,
      plusColorsMessage?.id || panel?.plusColorsMessageId || null,
    );
  }
}

module.exports = { name: "ruoli", order: 10, section: "menu", run };