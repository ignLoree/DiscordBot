const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const path = require('path');
const Panel = require('../Schemas/Community/panelSchema');

const TICKET_CHANNEL_ID = '1442569095068254219';
const TICKET_MEDIA_NAME = 'ticket.gif';
const TICKET_MEDIA_PATH = path.join(__dirname, '..', 'Photos', TICKET_MEDIA_NAME);
const DIVIDER_URL = 'https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db';

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    const channel = client.channels.cache.get(TICKET_CHANNEL_ID)
      || await client.channels.fetch(TICKET_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const guildId = channel.guild?.id;
    if (!guildId) return;

    const attachment = new AttachmentBuilder(TICKET_MEDIA_PATH, { name: TICKET_MEDIA_NAME });

    const ticketInfoEmbed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setDescription(`<:reportmessage:1443670575376765130> Benvenuto nella **sezione** dedicata all'__assistenza__! Apri un **ticket** in base alle tue _esigenze_ e ricorda di **rispettare** il regolamento.

<:dot:1443660294596329582> Massimo **__\`1\`__** ticket alla volta;
<:dot:1443660294596329582> Scegli **sempre** la giusta sezione;
<:dot:1443660294596329582> Non **abusare** dei __ticket__;
<:dot:1443660294596329582> Non aprire ticket __inutili__;`)
      .setImage(DIVIDER_URL);

    const ticketPanelEmbed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setDescription(`<:vsl_ticket:1329520261053022208> **Tickets** di **Vinili & Caff�**!
<a:vegarightarrow:1443673039156936837> Abbiamo **__4__** tipi di __ticket__. I ticket sono **ordinati** per __importanza__, ovviamente quelli pi� __importanti__ sono quelli da usare **raramente**.
<:dot:1443660294596329582> **__\`PERKS\`__**
? Apri questo ticket per __richiedere__ i **perks** che ti spettano. Non aprire per richiedere __perks__ che necessitano di **permessi**, come mandare **__media__** in chat poich� sono dati **__automaticamente__**.
<:dot:1443660294596329582> **__\`SUPPORTO\`__**
? Apri questo ticket per richiedere **__supporto__** allo **__staff__** del server.
<:dot:1443660294596329582> **__\`PARTNERSHIP\`__**
? Apri questo ticket per richiedere una **partnership**. Se volessi effettuare una **collaborazione/sponsor**, apri un ticket **__\`HIGH STAFF\`__**
<:dot:1443660294596329582> **__\`HIGH STAFF\`__**
? Usa questa __sezione__ per **contattare** l'**__amministrazione__** del server.
<:attentionfromvega:1443651874032062505> Aprire un ticket **__inutile__** oppure **__non rispondere__** nell'arco di **\`24\` ore** comporterà un **warn**.`)

    const ticketButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_perks').setLabel('?PERKS').setEmoji('<a:Boost_Cycle:1329504283007385642>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_supporto').setLabel('?SUPPORTO').setEmoji('<:discordstaff:1443651872258003005>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_partnership').setLabel('?PARTNERSHIP').setEmoji('<:partneredserverowner:1443651871125409812>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_highstaff').setLabel('?HIGH STAFF').setEmoji('<:reportmessage:1443670575376765130>').setStyle(ButtonStyle.Secondary)
    );

    let panelDoc = null;
    try {
      panelDoc = await Panel.findOneAndUpdate(
        { guildId, channelId: TICKET_CHANNEL_ID },
        { $setOnInsert: { guildId, channelId: TICKET_CHANNEL_ID } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch {}

    let infoMessage = null;
    let panelMessage = null;

    if (panelDoc?.ticketInfoMessageId) {
      infoMessage = await channel.messages.fetch(panelDoc.ticketInfoMessageId).catch(() => null);
    }
    if (panelDoc?.ticketPanelMessageId) {
      panelMessage = await channel.messages.fetch(panelDoc.ticketPanelMessageId).catch(() => null);
    }

    if (infoMessage) {
      await infoMessage.edit({ files: [attachment], embeds: [ticketInfoEmbed], components: [] }).catch(() => {});
    } else {
      infoMessage = await channel.send({ files: [attachment], embeds: [ticketInfoEmbed] }).catch(() => null);
    }

    if (panelMessage) {
      await panelMessage.edit({ embeds: [ticketPanelEmbed], components: [ticketButtons] }).catch(() => {});
    } else {
      panelMessage = await channel.send({ embeds: [ticketPanelEmbed], components: [ticketButtons] }).catch(() => null);
    }

    if (infoMessage?.id || panelMessage?.id) {
      await Panel.updateOne(
        { guildId, channelId: TICKET_CHANNEL_ID },
        {
          $set: {
            ticketInfoMessageId: infoMessage?.id || panelDoc?.ticketInfoMessageId || null,
            ticketPanelMessageId: panelMessage?.id || panelDoc?.ticketPanelMessageId || null
          }
        }
      ).catch(() => {});
    }
  }
};
