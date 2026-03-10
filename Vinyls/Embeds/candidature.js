const path = require("path");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
const CANDIDATURE_MEDIA_NAME = "candidature.gif";
const CANDIDATURE_MEDIA_PATH = path.join(__dirname, "..", "Photos", CANDIDATURE_MEDIA_NAME);
const DIVIDER_URL = "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";

async function run(client) {
  const candidatureChannel = client.channels.cache.get(IDs.channels.candidatureStaff) || (await getClientChannelCached(client, IDs.channels.candidatureStaff));
  if (!candidatureChannel?.isTextBased?.()) {
    global.logger.warn("[CLIENT READY] Candidature panel channel missing/unusable:", IDs.channels.candidatureStaff);
    return;
  }
  const candidatureEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<:7871discordstaff:1443651872258003005> Su **__Vinili & Caffè__** ci si può candidare a **__\`2\`__** _ruoli_: **__\`Helper\`__** e **__\`Partner Manager\`__**.
> <:5751attentionfromvega:1443651874032062505> Per **candidarti** dovrai __cliccare__ il bottone in base al **ruolo** che vuoi __ricoprire__

Per candidarsi, è necessario **soddisfare** i seguenti __requisiti__:
<:1_:1444099163116535930> Avere almeno **__14 anni (compiuti)__**
<:2_:1444099161673826368> Rispettare i **[ToS](https://discord.com/terms)** e le **[Linee Guida](https://discord.com/guidelines)** di **Discord**
<:3_:1444099160294031471> Essere **maturi** e **attivi**
<:4_:1444099158859321435> Non essere mai stato **sanzionato** nel server.`,
    )
    .setImage(DIVIDER_URL);
  const candidatureAttachment = new AttachmentBuilder(CANDIDATURE_MEDIA_PATH, { name: CANDIDATURE_MEDIA_NAME });
  const rowCandidature = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("︲HELPER").setEmoji("<:helper:1443651909448630312>").setStyle(ButtonStyle.Secondary).setCustomId("apply_helper"),
    new ButtonBuilder().setLabel("︲PARTNER MANAGER").setEmoji("<:partnermanager:1443651916838998099>").setStyle(ButtonStyle.Secondary).setCustomId("apply_partnermanager"),
    new ButtonBuilder().setLabel("︲STAFF PAGATO").setEmoji("<:partneredserverowner:1443651871125409812>").setStyle(ButtonStyle.Secondary).setCustomId("candidature_premi_partner"),
  );
  await upsertPanelMessage(candidatureChannel, client, {
    embeds: [candidatureEmbed],
    components: [rowCandidature],
    files: [candidatureAttachment],
    attachmentName: CANDIDATURE_MEDIA_NAME,
  });
}

module.exports = { name: "candidature", order: 10, section: "embedWithButtons", run };