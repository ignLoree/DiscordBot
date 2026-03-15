const path = require("path");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { PersonalityPanel } = require("../Schemas/Community/communitySchemas");
const IDs = require("../Utils/Config/ids");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");

const INFO_CHANNEL_ID = IDs.channels.info;
const INFO_MEDIA_NAME = "info.gif";
const INFO_MEDIA_PATH = path.join(__dirname, "..", "Photos", INFO_MEDIA_NAME);
const DIVIDER_URL = "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";

async function run(client) {
  const channel = client.channels.cache.get(INFO_CHANNEL_ID) || (await client.channels.fetch(INFO_CHANNEL_ID).catch(() => null));
  if (!channel?.isTextBased?.()) return;
  const attachment = new AttachmentBuilder(INFO_MEDIA_PATH, { name: INFO_MEDIA_NAME });
  const embed1 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Ti diamo il benvenuto nella nostra community!")
    .setFooter({ text: "Usa i bottoni sottostanti per accedere ad altre categorie del server:" })
    .setDescription(
      [
        "<a:VC_HeartsBlue:1468686100045369404> Benvenuto/a su **Vinili & Caffè**, l'unico server in Italia non tossico e __incentrato sulla socializzazione__.",
        "",
        "<a:VC_HeartBlue:1448673354751021190> **Personalizza il tuo profilo:**",
        "<:VC_Reply:1482532158080942191> Nel canale <#1469429150669602961> potrai selezionare i colori e i ruoli da aggiungere al tuo profilo per completarlo: come età, menzioni, passioni e molto altro!",
        "",
        `Dubbi o problemi? <#${IDs.channels.ticket}> sarà la vostra bussola, lo staff vi risponderà il prima possibile!`,
      ].join("\n"),
    )
    .addFields(
      {
        name: "<:dot:1443660294596329582> Links",
        value: [
          "<:VC_bump:1482531857521311885> [Lascia una recensione su DISBOARD](<https://disboard.org/it/server/1329080093599076474>)",
          "<:link:1470064815899803668> [Votaci su Discadia](<https://discadia.com/vote/viniliecaffe/>)",
        ].join("\n"),
        inline: true,
      },
      {
        name: "<:dot:1443660294596329582> Informazioni",
        value: [
          "<:exp:1470067108543987846> Owner: <@295500038401163264>",
          "<:moon:1470064812615667827> Fondazione: ||<t:1765382400:F>||",
          "<:nitroboost:1470064881674883326> Invite: <https://discord.gg/viniliecaffe>",
        ].join("\n"),
        inline: true,
      },
    )
    .setImage(DIVIDER_URL);
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("info_rules")
      .setLabel("︲REGOLAMENTO")
      .setEmoji("<a:VC_Rule:1469462649950703709>")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("info_donations")
      .setLabel("︲DONAZIONI")
      .setEmoji("<a:VC_Sparkles:1468546911936974889>")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("info_sponsor")
      .setLabel("︲SPONSOR")
      .setEmoji("<:pinnednew:1443670849990430750>")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("info_tags")
      .setLabel("︲TAGS")
      .setEmoji("<:VC_Firework:1470796227913322658>")
      .setStyle(ButtonStyle.Success),
  );
  const embed2 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setFooter({ text: "Usa i bottoni sottostanti per accedere ad altre categorie del server:" })
    .setTitle("<:VC_PurpleFlower:1469463879149944943> Sblocca dei vantaggi, permessi e ruoli:")
    .setDescription(
      "Scopri tramite i bottoni sottostanti come sbloccare permessi, ad esempio: mandare link e immagini in chat, poter cambiare il nickname e molti altri.",
    )
    .setImage(DIVIDER_URL);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("info_boost_levels").setLabel("︲VANTAGGI BOOST & LIVELLI").setEmoji("<a:VC_Rocket:1468544312475123753>").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("info_badges_roles").setLabel("︲BADGE & ALTRI RUOLI").setEmoji("<a:VC_Diamon:1469463765610135635>").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("info_verifica").setLabel("︲VERIFICA SELFIE").setEmoji(`<a:VC_Verified:1482532479637127188>`).setStyle(ButtonStyle.Secondary),
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
  } catch (err) {
    global.logger?.warn?.("[embeds] ", err?.message || err);
  }

  const msg1 = await upsertPanelMessage(channel, client, { messageId: panel?.infoMessageId1 || null, files: [attachment], embeds: [embed1], components: [row1], attachmentName: INFO_MEDIA_NAME });
  const msg2 = await upsertPanelMessage(channel, client, { messageId: panel?.infoMessageId2 || null, embeds: [embed2], components: [row2] });

  if (msg1?.id || msg2?.id) {
    await PersonalityPanel.updateOne(
      { guildId, channelId: INFO_CHANNEL_ID },
      {
        $set: {
          infoMessageId1: msg1?.id || panel?.infoMessageId1 || null,
          infoMessageId2: msg2?.id || panel?.infoMessageId2 || null,
        },
      },
    ).catch(() => {});
  }
}

module.exports = { name: "info", order: 20, section: "embedWithButtons", run };