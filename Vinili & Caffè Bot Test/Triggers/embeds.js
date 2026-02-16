async function runSponsorGuildTagPanels(client) {
  const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
  const path = require('path');
  const { PersonalityPanel: Panel } = require('../Schemas/Community/communitySchemas');
  const { upsertPanelMessage } = require('../Utils/Embeds/panelUpsert');

  const GUILD_TAG_CONFIG = {
    '1471511676019933354': { channelId: '1471522979706835018', tagName: 'Luna', emoji: '🌙' },
    '1471511928739201047': { channelId: '1471522798315901019', tagName: 'Cash', emoji: '💸' },
    '1471512183547498579': { channelId: '1471522526931714170', tagName: 'Porn', emoji: '🔞' },
    '1471512555762483330': { channelId: '1471522161192730695', tagName: '69', emoji: '😈' },
    '1471512797140484230': { channelId: '1471521963125112942', tagName: 'Weed', emoji: '🍃' },
    '1471512808448458958': { channelId: '1471521322785050676', tagName: 'Figa', emoji: '🍑' }
  };

  const TAG_IMAGE_NAME = 'guildtag.gif';
  const TAG_IMAGE_PATH = path.join(__dirname, '..', 'Photos', TAG_IMAGE_NAME);

  for (const [guildId, config] of Object.entries(GUILD_TAG_CONFIG)) {
    try {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      const BOOSTER_ROLE_IDS = {
        '1471511676019933354': '1471512868494118975',
        '1471511928739201047': '1471512411306459348',
        '1471512183547498579': '1471513685976420443',
        '1471512555762483330': '1471514106598260892',
        '1471512797140484230': '1471514709420413111',
        '1471512808448458958': '1471515516291121213'
      };

      if (!guild) {
        global.logger.warn('[GUILD TAG] Guild not found:', guildId);
        continue;
      }

      let channel = guild.channels.cache.get(config.channelId);
      if (!channel) {
        channel = await guild.channels.fetch(config.channelId).catch(() => null);
      }

      if (!channel?.isTextBased?.()) {
        global.logger.warn('[GUILD TAG] Channel not found in guild:', guildId, config.channelId);
        continue;
      }

      let boosterRole = null;
      const boosterRoleId = BOOSTER_ROLE_IDS[guild.id];
      if (boosterRoleId) {
        boosterRole = await guild.roles.fetch(boosterRoleId).catch(() => null);
      }

      const boosterRoleMention = boosterRole
        ? `<@&${boosterRole.id}>`
        : '`༄ Server Booster`';

      const dividerLine = '<a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531>';

      const tagEmbed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setDescription([
          `## <:LC_wNew:1471891729471770819> ── .✦ <a:VC_RightWing:1448672889845973214> ₊⋆˚｡ ${config.tagName}'s Guild-TAG`,
          dividerLine,
          '',
          '',
          '**<a:VC_Arrow:1448672967721615452> Come mantenere la Guild-TAG <:PinkQuestionMark:1471892611026391306>**',
          '────୨ৎ────',
          `<a:VC_Exclamation:1448687427836444854> Vi basterà essere parte di https://discord.gg/viniliecaffe oppure`,
          `Boostare questo server (<a:flyingnitroboost:1443652205705170986>⭑.ᐟ ${boosterRoleMention} )`,
          '',
          '',
          '**<a:VC_Arrow:1448672967721615452> How to keep the Guild-TAG <:PinkQuestionMark:1471892611026391306>**',
          '────୨ৎ────',
          `<a:VC_Exclamation:1448687427836444854> You just need to be part of https://discord.gg/viniliecaffe or boost`,
          `This server (<a:flyingnitroboost:1443652205705170986>⭑.ᐟ ${boosterRoleMention} )`,
          '',
          '',
          '<:VC_PepeComfy:1331591439599272004>⭑.ᐟ Keep up! Nuovi aggiornamenti in arrivo...'
        ].join('\n'))
        .setFooter({ text: `.gg/viniliecaffe • ${new Date().toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` });

      let attachment = null;
      try {
        attachment = new AttachmentBuilder(TAG_IMAGE_PATH, { name: TAG_IMAGE_NAME });
        tagEmbed.setImage(`attachment://${TAG_IMAGE_NAME}`);
      } catch {
        global.logger.warn('[GUILD TAG] Image not found, sending without image');
      }

      let panelDoc = null;
      try {
        panelDoc = await Panel.findOneAndUpdate(
          { guildId, channelId: config.channelId },
          { $setOnInsert: { guildId, channelId: config.channelId } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        global.logger.error('[GUILD TAG] Failed to create/fetch panel doc:', err);
        continue;
      }

      const messagePayload = {
        messageId: panelDoc?.infoMessageId1 || null,
        embeds: [tagEmbed],
        components: [],
        ...(attachment ? { files: [attachment] } : {})
      };

      const tagMessage = await upsertPanelMessage(channel, client, messagePayload);

      if (tagMessage?.id) {
        await Panel.updateOne(
          { guildId, channelId: config.channelId },
          { $set: { infoMessageId1: tagMessage.id } }
        ).catch((err) => {
          global.logger.error('[GUILD TAG] Failed to update panel doc:', err);
        });
      }
    } catch (err) {
      global.logger.error('[GUILD TAG] Error processing guild:', guildId, err);
    }
  }
}

async function runSponsorPanel(client) {
    try {
        return await runSponsorGuildTagPanels(client);
    } catch (err) {
        global.logger.error('[Bot Test] runSponsorPanel (Guild-TAG):', err?.message || err);
        return 0;
    }
}

async function runSponsorVerifyPanels(client) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const { PersonalityPanel: Panel } = require('../Schemas/Community/communitySchemas');
    const { upsertPanelMessage } = require('../Utils/Embeds/panelUpsert');

    let SPONSOR_GUILD_IDS = Array.isArray(client.config?.sponsorGuildIds) ? [...client.config.sponsorGuildIds] : [];
    const VERIFY_CHANNEL_IDS = client.config?.sponsorVerifyChannelIds || {};
    if (SPONSOR_GUILD_IDS.length === 0) {
        SPONSOR_GUILD_IDS = Object.keys(VERIFY_CHANNEL_IDS);
    }

    if (SPONSOR_GUILD_IDS.length === 0) {
        global.logger.warn('[Bot Test] runSponsorVerifyPanels: nessuna guild in config (sponsorGuildIds o sponsorVerifyChannelIds). Controlla config.json.');
        return 0;
    }
    const botGuildIds = client.guilds.cache.map(g => g.id);
    const inSponsor = SPONSOR_GUILD_IDS.filter(id => botGuildIds.includes(id));
    const missing = SPONSOR_GUILD_IDS.filter(id => !botGuildIds.includes(id));

    let sent = 0;
    for (const guildId of SPONSOR_GUILD_IDS) {
        try {
            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) {
                global.logger.warn('[Bot Test] Verify panel: guild non trovata (bot non nel server?): ' + guildId);
                continue;
            }
            await guild.channels.fetch().catch(() => {});

            const channelId = VERIFY_CHANNEL_IDS[guildId];
            let channel = channelId
                ? (guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null))
                : guild.channels.cache.find(ch => ch.name?.toLowerCase().includes('start'));

            if (!channel?.isTextBased?.()) {
                global.logger.warn('[Bot Test] Verify panel: canale non trovato o non testuale in guild ' + guild.name + ' (' + guildId + '). sponsorVerifyChannelIds corretti in config.json?');
                continue;
            }

            const serverName = guild.name || 'this server';
            const verifyPanelEmbed = new EmbedBuilder()
                .setColor(client.config?.embedVerify || '#6f4e37')
                .setTitle('<:verification:1472989484059459758> **`Verification Required!`**')
                .setDescription(
                    '<:space:1472990350795866265> <:alarm:1472990352968253511> **Per accedere a `' + serverName + '` devi prima verificarti.**\n' +
                    '<:space:1472990350795866265><:space:1472990350795866265> <:rightSort:1472990348086087791> Clicca il pulsante **Verify** qui sotto per iniziare.'
                );
            const verifyRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('verify_start').setLabel('Verify').setStyle(ButtonStyle.Success)
            );

            let panelDoc = null;
            try {
                panelDoc = await Panel.findOneAndUpdate(
                    { guildId, channelId: channel.id },
                    { $setOnInsert: { guildId, channelId: channel.id } },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } catch (err) {
                global.logger.error('[Bot Test] Verify panel: errore MongoDB per guild ' + guildId + ':', err?.message || err);
                continue;
            }

            const panelMessage = await upsertPanelMessage(channel, client, {
                messageId: panelDoc?.verifyPanelMessageId || null,
                embeds: [verifyPanelEmbed],
                components: [verifyRow]
            });
            if (panelMessage?.id) {
                await Panel.updateOne(
                    { guildId, channelId: channel.id },
                    { $set: { verifyPanelMessageId: panelMessage.id } }
                ).catch(() => {});
                sent++;
            } else {
                global.logger.warn('[Bot Test] Verify panel: upsertPanelMessage non ha restituito messaggio in ' + guild.name);
            }
        } catch (err) {
            global.logger.error('[Bot Test] runSponsorVerifyPanels guild ' + guildId + ':', err?.message || err);
        }
    }
    return sent;
}

async function runSponsorTicketPanels(client) {
  const { EmbedBuilder, ActionRowBuilder, AttachmentBuilder, StringSelectMenuBuilder } = require('discord.js');
  const path = require('path');
  const { PersonalityPanel: Panel } = require('../Schemas/Community/communitySchemas');
  const { shouldEditMessage } = require('../Utils/Embeds/panelUpsert');

  const SPONSOR_GUILD_IDS = {
    '1471511676019933354': { tagName: 'Luna', emoji: '🌙' },
    '1471511928739201047': { tagName: 'Cash', emoji: '💸' },
    '1471512183547498579': { tagName: 'Porn', emoji: '🔞' },
    '1471512555762483330': { tagName: '69', emoji: '😈' },
    '1471512797140484230': { tagName: 'Weed', emoji: '🍃' },
    '1471512808448458958': { tagName: 'Figa', emoji: '🍑' }
  };

  const TICKET_CHANNEL_IDS = {
    '1471511676019933354': '1471974302109667410',
    '1471511928739201047': '1471974355964657765',
    '1471512183547498579': '1471974536357347570',
    '1471512555762483330': '1471974622777049098',
    '1471512797140484230': '1471974712958648412',
    '1471512808448458958': '1471974799453720740'
  };

  const GUILDED_ROLE_IDS = {
    '1471511676019933354': '1471627231637012572',
    '1471511928739201047': '1471628245404483762',
    '1471512183547498579': '1471628136172097638',
    '1471512555762483330': '1471628002050838790',
    '1471512797140484230': '1471627880575275008',
    '1471512808448458958': '1471627711901470781'
  };

  const TICKET_MEDIA_NAME = 'ticket.gif';
  const TICKET_MEDIA_PATH = path.join(__dirname, '..', 'Photos', TICKET_MEDIA_NAME);

  for (const [guildId, config] of Object.entries(SPONSOR_GUILD_IDS)) {
    try {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;

      await guild.channels.fetch().catch(() => { });

      let guildedRoleMention = '`༄ Guilded`';
      const guildedRoleId = GUILDED_ROLE_IDS[guildId];
      if (guildedRoleId) {
        const role = await guild.roles.fetch(guildedRoleId).catch(() => null);
        if (role) guildedRoleMention = `<@&${role.id}>`;
      }

      let channel = null;
      const mappedId = TICKET_CHANNEL_IDS[guildId];
      if (mappedId) {
        channel = guild.channels.cache.get(mappedId) || await guild.channels.fetch(mappedId).catch(() => null);
      }

      if (!channel) {
        channel = guild.channels.cache.find((ch) => {
          if (!ch?.isTextBased?.()) return false;
          const n = (ch.name || '').toLowerCase();
          return n.includes('ticket') || n.includes('assistenza') || n.includes('support');
        }) || null;
      }

      if (!channel?.isTextBased?.()) continue;

      let attachment = null;
      try {
        const fs = require('fs');
        if (fs.existsSync(TICKET_MEDIA_PATH)) {
          attachment = new AttachmentBuilder(TICKET_MEDIA_PATH, { name: TICKET_MEDIA_NAME });
        }
      } catch {
        global.logger?.warn?.('[SPONSOR TICKET] Image not found, sending without image');
      }

      const embed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setTitle(`༄${config.emoji}︲${config.tagName}'s Ticket`)
        .setDescription(
          `Clicca sul pulsante per aprire un ticket e claimare il tuo ruolo ${guildedRoleMention} su questo server e su quello principale.`
        );

      const ticketMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_open_menu')
        .setPlaceholder('🎫 Seleziona una categoria...')
        .addOptions(
          {
            label: 'Prima categoria',
            description: 'Riscatto Ruolo',
            value: 'ticket_supporto',
            emoji: { id: '1443651872258003005', name: 'discordstaff' }
          }
        );
      const ticketSelectRow = new ActionRowBuilder().addComponents(ticketMenu);

      let panelDoc = null;
      try {
        panelDoc = await Panel.findOneAndUpdate(
          { guildId, channelId: channel.id },
          { $setOnInsert: { guildId, channelId: channel.id } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch {
        panelDoc = null;
      }

      const payload = { embeds: [embed], components: [ticketSelectRow], ...(attachment ? { files: [attachment], attachmentName: TICKET_MEDIA_NAME } : {}) };

      let msg = null;
      if (panelDoc?.sponsorTicketPanelMessageId) {
        msg = await channel.messages.fetch(panelDoc.sponsorTicketPanelMessageId).catch(() => null);
      }

      if (msg) {
        if (await shouldEditMessage(msg, payload)) {
          await msg.edit({ embeds: [embed], components: [ticketSelectRow], ...(attachment ? { files: [attachment] } : {}) }).catch(() => { });
        }
      } else {
        msg = await channel.send({ embeds: [embed], components: [ticketSelectRow], ...(attachment ? { files: [attachment] } : {}) }).catch(() => null);
      }

      if (msg?.id) {
        await Panel.updateOne(
          { guildId, channelId: channel.id },
          { $set: { sponsorTicketPanelMessageId: msg.id } }
        ).catch(() => { });
      }
    } catch (err) {
      global.logger?.error?.('[SPONSOR TICKET] Error processing guild:', guildId, err);
    }
  }
}

module.exports = { runSponsorPanel, runSponsorGuildTagPanels, runSponsorVerifyPanels, runSponsorTicketPanels };
