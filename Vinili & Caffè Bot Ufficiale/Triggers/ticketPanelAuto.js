const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
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
      .setAuthor({ name: 'Contatta lo Staff & chiedi supporto:', iconURL: channel.guild?.iconURL() || undefined })
      .setDescription(`I ticket equivalgono ad un sistema di supporto che permette di parlare direttamente con lo staff con il fine di chiedere chiarimenti, fare domande agli staffers riguardo al server, segnalare un accaduto all'interno di quest'ultimo o per altre richieste.

<:VC_1:1444099819680563200> Prima categoria
<a:VC_Arrow:1448672967721615452> usalo per fare segnalazioni, riportare dei problemi o bug, per avere delle informazioni o per qualunque altra cosa che non rientra nelle categorie sottostanti.
<:VC_2:1444099781864722535> Seconda categoria
<a:VC_Arrow:1448672967721615452> usalo per fare partnership con noi.
<:VC_3:1444099746116534282> Terza categoria
<a:VC_Arrow:1448672967721615452> usalo per fare una donazione, per fare la "selfie verify", per richiedere una sponsor a pagamento o per parlare con un amministratore del server.

<:attentionfromvega:1443651874032062505> Aprire un ticket **__inutile__** oppure **__non rispondere__** nell'arco di **\`24\` ore** comportera un **warn**.`)
        .setFooter({ text: `Non garantiamo risposta negli orari notturni, dalle 00:00 alle 10:00`});

    const ticketMenu = new StringSelectMenuBuilder()
      .setCustomId('ticket_open_menu')
      .setPlaceholder('Seleziona una categoria...')
      .addOptions(
        {
          label: 'Prima categoria',
          description: 'Supporto generale - Segnalazioni - Problemi',
          value: 'ticket_supporto',
          emoji: { id: '1443651872258003005', name: 'discordstaff' }
        },
        {
          label: 'Seconda categoria',
          description: 'Partnership',
          value: 'ticket_partnership',
          emoji: { id: '1443651871125409812', name: 'partneredserverowner' }
        },
        {
          label: 'Terza categoria',
          description: 'Verifica Selfie - Donazioni - Sponsor - HighStaff',
          value: 'ticket_highstaff',
          emoji: { id: '1443670575376765130', name: 'reportmessage' }
        }
      );
    const ticketSelectRow = new ActionRowBuilder().addComponents(ticketMenu);

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
      await panelMessage.edit({ embeds: [ticketPanelEmbed], components: [ticketSelectRow] }).catch(() => {});
    } else {
      panelMessage = await channel.send({ embeds: [ticketPanelEmbed], components: [ticketSelectRow] }).catch(() => null);
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
