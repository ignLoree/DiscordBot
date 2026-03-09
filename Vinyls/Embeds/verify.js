const path = require("path");
const IDs = require("../Utils/Config/ids");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { PersonalityPanel: Panel } = require("../Schemas/Community/communitySchemas");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");

const VERIFY_CHANNEL_ID = IDs.channels.verify;
const VERIFY_MEDIA_NAME = "verifica.gif";
const VERIFY_MEDIA_PATH = path.join(__dirname, "..", "Photos", VERIFY_MEDIA_NAME);
const DIVIDER_URL = "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";

async function run(client) {
  const channel = client.channels.cache.get(VERIFY_CHANNEL_ID) || (await client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null));
  if (!channel?.isTextBased?.()) return;
  const guildId = channel.guild?.id;
  if (!guildId) return;

  const attachment = new AttachmentBuilder(VERIFY_MEDIA_PATH, { name: VERIFY_MEDIA_NAME });
  const serverName = channel.guild?.name || "this server";

  const verifyInfoEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_HeartsPink:1468685897389052008> **__Benvenutx su Vinili & Caffè__**")
    .setDescription(
      "<:vegacheckmark:1443666279058772028> Per **verificarti** premi il pulsante **__`Verify`__**, poi inserisci il **codice** che riceverai in **risposta effimera**.\n" +
        "<:VC_Ticket:1448694637106692156> Per **qualsiasi** problema, non **esitate** ad aprire un **__<#1442569095068254219> `Prima Categoria`__**",
    )
    .setImage(DIVIDER_URL);

  const color = client?.config?.embedVerify || "#6f4e37";
  const verifyPanelEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle("<:verification:1461725843125571758> **`Verification Required!`**")
    .setDescription(
      "<:space:1461733157840621608> <:alarm:1461725841451909183> **Per accedere a `" +
        serverName +
        "` devi prima verificarti.**\n" +
        "<:space:1461733157840621608><:space:1461733157840621608> <:rightSort:1461726104422453298> Clicca il pulsante **Verify** qui sotto per iniziare.",
    )
    .setImage(DIVIDER_URL);

  const verifyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("verify_start").setEmoji(`<a:VC_Verified:1448687631109197978>`).setLabel("︲VERIFY").setStyle(ButtonStyle.Success),
  );

  let panelDoc = null;
  try {
    panelDoc = await Panel.findOneAndUpdate(
      { guildId, channelId: VERIFY_CHANNEL_ID },
      { $setOnInsert: { guildId, channelId: VERIFY_CHANNEL_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[embeds] ", err?.message || err);
  }

  const infoMessage = await upsertPanelMessage(channel, client, { messageId: panelDoc?.verifyInfoMessageId || null, files: [attachment], embeds: [verifyInfoEmbed], components: [], attachmentName: VERIFY_MEDIA_NAME });
  const panelMessage = await upsertPanelMessage(channel, client, { messageId: panelDoc?.verifyPanelMessageId || null, embeds: [verifyPanelEmbed], components: [verifyRow] });

  if (infoMessage?.id || panelMessage?.id) {
    await Panel.updateOne(
      { guildId, channelId: VERIFY_CHANNEL_ID },
      {
        $set: {
          verifyInfoMessageId: infoMessage?.id || panelDoc?.verifyInfoMessageId || null,
          verifyPanelMessageId: panelMessage?.id || panelDoc?.verifyPanelMessageId || null,
        },
      },
    ).catch(() => {});
  }
}

module.exports = { name: "verify", order: 40, section: "embedWithButtons", run };