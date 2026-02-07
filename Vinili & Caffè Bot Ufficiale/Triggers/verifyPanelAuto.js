const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const path = require('path');
const Panel = require('../Schemas/Community/panelSchema');

const VERIFY_CHANNEL_ID = '1442569059983163403';
const VERIFY_MEDIA_NAME = 'verifica.gif';
const VERIFY_MEDIA_PATH = path.join(__dirname, '..', 'Photos', VERIFY_MEDIA_NAME);
const DIVIDER_URL = 'https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db';

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    const channel = client.channels.cache.get(VERIFY_CHANNEL_ID)
      || await client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const guildId = channel.guild?.id;
    if (!guildId) return;

    const attachment = new AttachmentBuilder(VERIFY_MEDIA_PATH, { name: VERIFY_MEDIA_NAME });
    const serverName = channel.guild?.name || 'this server';
    
    const verifyInfoEmbed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('<:pepe_wave:1329488693739782274> **__BENVENUTO SU `' + serverName + '`__**')
      .setDescription(
        '<:vegacheckmark:1443666279058772028> Per **verificarti** premi il pulsante **__`Verify`__**, poi inserisci il **codice** che riceverai in **risposta effimera**.\n' +
        '<:vsl_ticket:1329520261053022208> Per **qualsiasi** problema, non **esitate** ad aprire un **__<#1442569095068254219> `SUPPORTO`__**'
      )
      .setImage(DIVIDER_URL);

    const color = client?.config2?.embedVerify || '#6f4e37';

    const verifyPanelEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle('<:verification:1461725843125571758> **`Verification Required!`**')
      .setDescription(
        '<:space:1461733157840621608> <:alarm:1461725841451909183> **Per accedere a `' + serverName + '` devi prima verificarti.**\n' +
        '<:space:1461733157840621608><:space:1461733157840621608> <:rightSort:1461726104422453298> Clicca il pulsante **Verify** qui sotto per iniziare.'
      )

    const verifyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify_start')
        .setLabel('Verify')
        .setStyle(ButtonStyle.Success)
    );

    let panelDoc = null;
    try {
      panelDoc = await Panel.findOneAndUpdate(
        { guildId, channelId: VERIFY_CHANNEL_ID },
        { $setOnInsert: { guildId, channelId: VERIFY_CHANNEL_ID } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch { }

    let infoMessage = null;
    let panelMessage = null;

    if (panelDoc?.verifyInfoMessageId) {
      infoMessage = await channel.messages.fetch(panelDoc.verifyInfoMessageId).catch(() => null);
    }
    if (panelDoc?.verifyPanelMessageId) {
      panelMessage = await channel.messages.fetch(panelDoc.verifyPanelMessageId).catch(() => null);
    }

    if (infoMessage) {
      await infoMessage.edit({ files: [attachment], embeds: [verifyInfoEmbed], components: [] }).catch(() => { });
    } else {
      infoMessage = await channel.send({ files: [attachment], embeds: [verifyInfoEmbed] }).catch(() => null);
    }

    if (panelMessage) {
      await panelMessage.edit({ embeds: [verifyPanelEmbed], components: [verifyRow] }).catch(() => { });
    } else {
      panelMessage = await channel.send({ embeds: [verifyPanelEmbed], components: [verifyRow] }).catch(() => null);
    }

    if (infoMessage?.id || panelMessage?.id) {
      await Panel.updateOne(
        { guildId, channelId: VERIFY_CHANNEL_ID },
        {
          $set: {
            verifyInfoMessageId: infoMessage?.id || panelDoc?.verifyInfoMessageId || null,
            verifyPanelMessageId: panelMessage?.id || panelDoc?.verifyPanelMessageId || null
          }
        }
      ).catch(() => { });
    }
  }
};
