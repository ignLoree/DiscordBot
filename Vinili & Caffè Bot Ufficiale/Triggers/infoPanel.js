const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const path = require('path');
const PersonalityPanel = require('../Schemas/Community/panelSchema');

const INFO_CHANNEL_ID = '1442569111119990887';
const INFO_MEDIA_NAME = 'info.gif';
const INFO_MEDIA_PATH = path.join(__dirname, '..', 'Photos', INFO_MEDIA_NAME);

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    const channel = client.channels.cache.get(INFO_CHANNEL_ID)
      || await client.channels.fetch(INFO_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const attachment = new AttachmentBuilder(INFO_MEDIA_PATH, { name: INFO_MEDIA_NAME });

    const embed1 = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('Ti diamo il benvenuto nella nostra community!')
      .setFooter({ text: 'Usa i bottoni sottostanti per accedere ad altre categorie del server:' })
      .setDescription([
        '<a:VC_HeartsBlue:1468686100045369404> Benvenuto/a su **Vinili & Caffè**, l\'unico server in Italia non tossico e __incentrato sulla socializzazione__.',
        '',
        '<a:VC_HeartBlue:1448673354751021190> **Personalizza il tuo profilo:**',
        '<:VC_Reply:1468262952934314131> Nel canale <#1469429150669602961> potrai selezionare i colori e i ruoli da aggiungere al tuo profilo per completarlo: come età, menzioni, passioni e molto altro!',
        '',
        'Dubbi o problemi? <#1442569095068254219> sarà la vostra bussola, lo staff vi risponderà il prima possibile!'
      ].join('\n'))
      .addFields(
        {
          name: '<:dot:1443660294596329582> Links',
          value: [
            '<:VC_bump:1330185435401424896> [Lascia una recensione su DISBOARD](<https://disboard.org/it/server/1329080093599076474>)',
            '<:link:1470064815899803668> [Votaci su Discadia](<https://discadia.com/vote/viniliecaffe/>)',
          ].join('\n'),
          inline: true
        },
        {
          name: '<:dot:1443660294596329582> Informazioni',
          value: [
            '<:exp:1470067108543987846> Owner: <@295500038401163264>',
            '<:moon:1470064812615667827> Fondazione: ||<t:1765382400:F>||',
            '<:nitroboost:1470064881674883326> Invite: <https://discord.gg/viniliecaffe>',
          ].join('\n'),
          inline: true
        }
      );
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('info_rules')
        .setLabel('Regolamento')
        .setEmoji('<a:VC_Rule:1469462649950703709>')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('info_donations')
        .setLabel('Donazioni')
        .setEmoji('<a:VC_Sparkles:1468546911936974889>')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('info_verifica')
        .setLabel('Verifica Selfie')
        .setEmoji(`<a:VC_Verified:1448687631109197978>`)
        .setStyle(ButtonStyle.Secondary)
    );

    const embed2 = new EmbedBuilder()
      .setColor('#6f4e37')
      .setFooter({ text: 'Usa i bottoni sottostanti per accedere ad altre categorie del server:' })
      .setTitle('<:VC_PurpleFlower:1469463879149944943> Sblocca dei vantaggi, permessi e ruoli:')
      .setDescription([
        'Scopri tramite i bottoni sottostanti come sbloccare permessi, ad esempio: mandare link e immagini in chat, poter cambiare il nickname e molti altri.',
      ].join('\n'));

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('info_boost_levels')
        .setLabel('Vantaggi Boost & Livelli')
        .setEmoji('<a:VC_Rocket:1468544312475123753>')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('info_badges_roles')
        .setLabel('Badge & Altri ruoli')
        .setEmoji('<a:VC_Diamon:1469463765610135635>')
        .setStyle(ButtonStyle.Success)
    );

    const guildId = channel.guild?.id;
    if (!guildId) return;

    let panel = null;
    try {
      panel = await PersonalityPanel.findOneAndUpdate(
        { guildId, channelId: INFO_CHANNEL_ID },
        { $setOnInsert: { guildId, channelId: INFO_CHANNEL_ID } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch { }

    let infoMessage1 = null;
    let infoMessage2 = null;
    if (panel?.infoMessageId1) {
      infoMessage1 = await channel.messages.fetch(panel.infoMessageId1).catch(() => null);
    }
    if (panel?.infoMessageId2) {
      infoMessage2 = await channel.messages.fetch(panel.infoMessageId2).catch(() => null);
    }

    if (infoMessage1) {
      await infoMessage1.edit({
        files: [attachment],
        embeds: [embed1],
        components: [row1]
      }).catch(() => { });
    } else {
      infoMessage1 = await channel.send({
        files: [attachment],
        embeds: [embed1],
        components: [row1]
      }).catch(() => null);
    }

    if (infoMessage2) {
      await infoMessage2.edit({
        embeds: [embed2],
        components: [row2]
      }).catch(() => { });
    } else {
      infoMessage2 = await channel.send({
        embeds: [embed2],
        components: [row2]
      }).catch(() => null);
    }

    if (infoMessage1 || infoMessage2) {
      await PersonalityPanel.updateOne(
        { guildId, channelId: INFO_CHANNEL_ID },
        { $set: { infoMessageId1: infoMessage1?.id || panel?.infoMessageId1 || null, infoMessageId2: infoMessage2?.id || panel?.infoMessageId2 || null } }
      ).catch(() => { });
    }
  }
};
