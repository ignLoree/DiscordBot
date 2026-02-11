const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const Ticket = require('../../Schemas/Ticket/ticketSchema');
const { createTranscript, createTranscriptHtml, saveTranscriptHtml } = require('../../Utils/Ticket/transcriptUtils');
const IDs = require('../../Utils/Config/ids');

const LOG_CHANNEL_ID = IDs.channels.ticketLogs || IDs.channels.serveBbotLogs;
const STAFF_ROLE_ID = IDs.roles.Staff;
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const PARTNERMANAGER_ROLE_ID = IDs.roles.PartnerManager;
const STAFF_ROLE_IDS = [STAFF_ROLE_ID, HIGHSTAFF_ROLE_ID].filter(Boolean);

function hasAnyRole(member, roleIds = []) {
  return roleIds.some((roleId) => member?.roles?.cache?.has(roleId));
}

function canClaimTicket(member, ticketType) {
  if (!member) return false;
  const isSupport = ticketType === 'supporto' && hasAnyRole(member, STAFF_ROLE_IDS);
  const isPartnership = ticketType === 'partnership'
    && (member.roles.cache.has(PARTNERMANAGER_ROLE_ID) || member.roles.cache.has(HIGHSTAFF_ROLE_ID));
  const isHigh = ticketType === 'high' && member.roles.cache.has(HIGHSTAFF_ROLE_ID);
  return isSupport || isPartnership || isHigh;
}

function canCloseTicket(member, ticketType) {
  if (!member) return false;
  const canCloseSupport = ticketType === 'supporto' && hasAnyRole(member, STAFF_ROLE_IDS);
  const canClosePartnership = ticketType === 'partnership'
    && (member.roles.cache.has(PARTNERMANAGER_ROLE_ID) || member.roles.cache.has(HIGHSTAFF_ROLE_ID));
  const canCloseHigh = ticketType === 'high' && member.roles.cache.has(HIGHSTAFF_ROLE_ID);
  return canCloseSupport || canClosePartnership || canCloseHigh;
}

async function sendTranscriptWithBrowserLink(target, payload, hasHtml) {
  if (!target?.send) return null;
  const sent = await target.send(payload).catch(() => null);
  if (!sent || !hasHtml) return sent;
  const attachment = sent.attachments?.find((att) => {
    const name = String(att?.name || '').toLowerCase();
    const url = String(att?.url || '').toLowerCase();
    return name.endsWith('.html') || url.includes('.html');
  });
  if (attachment?.url) {
    const baseContent = typeof payload?.content === 'string' ? payload.content.trim() : '';
    const nextContent = baseContent
      ? `${baseContent}\nApri transcript HTML: ${attachment.url}`
      : `Apri transcript HTML: ${attachment.url}`;
    await sent.edit({ content: nextContent }).catch(() => {});
  }
  return sent;
}

module.exports = {
  name: 'ticket',
  aliases: ['add', 'remove', 'close', 'closerequest', 'claim', 'unclaim', 'switchpanel', 'rename', 'ticketclose', 'ticketclaim', 'ticketunclaim', 'ticketswitchpanel', 'ticketrename', 'trename', 'tadd', 'tremove', 'ticketadd', 'ticketremove'],
  description: 'Gestione ticket.',
  subcommands: ['add', 'remove', 'closerequest', 'close', 'claim', 'unclaim', 'switchpanel', 'rename'],
  subcommandAliases: {
    add: 'add',
    remove: 'remove',
    close: 'close',
    closerequest: 'closerequest',
    claim: 'claim',
    unclaim: 'unclaim',
    switchpanel: 'switchpanel',
    rename: 'rename',
    ticketswitchpanel: 'switchpanel',
    ticketrename: 'rename',
    trename: 'rename',
    ticketclose: 'close',
    ticketclaim: 'claim',
    ticketunclaim: 'unclaim',
    tadd: 'add',
    tremove: 'remove',
    ticketadd: 'add',
    ticketremove: 'remove'
  },

  async execute(message, args = []) {
    if (!message.inGuild?.() || !message.guild || !message.member) {
      await safeMessageReply(message, {
        content: '<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.',
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const defaultPrefix = '+';
    const rawContent = String(message.content || '').trim();
    const invokedToken = rawContent.startsWith(defaultPrefix)
      ? rawContent.slice(defaultPrefix.length).trim().split(/\s+/)[0]?.toLowerCase()
      : '';
    const directAliasSub = invokedToken && this.subcommandAliases
      ? this.subcommandAliases[invokedToken]
      : null;

    const subcommand = String(directAliasSub || args[0] || '').toLowerCase();
    const rest = directAliasSub ? args : args.slice(1);
    const parentChannel = message.channel?.parent || null;
    const inTicketCategory = Boolean(
      parentChannel &&
      String(parentChannel.name || '').toLowerCase().includes('tickets')
    );
    const activeTicketInChannel = await Ticket.findOne({ channelId: message.channel.id, open: true }).catch(() => null);

    if (!subcommand) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Uso corretto: `+ticket <add|remove|closerequest|close|claim|unclaim|switchpanel|rename>`')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }
    if (!inTicketCategory || !activeTicketInChannel) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> I comandi ticket possono essere usati solo dentro un canale ticket.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const isHighStaffBypass = message.member.roles.cache.has(HIGHSTAFF_ROLE_ID);

    if (subcommand === 'add') {
      const user = await resolveUserFromArg(message, rest[0]);
      if (!user) {
        await safeMessageReply(message, {
          embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Specifica un utente valido.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      await message.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setTitle('Aggiungi')
            .setDescription(`<:vegacheckmark:1443666279058772028> ${user} è stato aggiunto a ${message.channel}`)
            .setColor('#6f4e37')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (subcommand === 'remove') {
      const user = await resolveUserFromArg(message, rest[0]);
      if (!user) {
        await safeMessageReply(message, {
          embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Specifica un utente valido.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      await message.channel.permissionOverwrites.edit(user.id, { ViewChannel: false, SendMessages: false });
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setTitle('Rimuovi')
            .setDescription(`<:vegacheckmark:1443666279058772028> ${user} è stato rimosso da ${message.channel}`)
            .setColor('#6f4e37')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (subcommand === 'closerequest') {
      const reason = rest.join(' ').trim();
      const ticketDoc = await Ticket.findOne({ channelId: message.channel.id });
      if (!ticketDoc) {
        await safeMessageReply(message, {
          embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Questo non è un canale ticket')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }
      const canRequestClose = message.author.id === ticketDoc.claimedBy || isHighStaffBypass;
      if (!canRequestClose) {
        await safeMessageReply(message, {
          embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Solo chi ha claimato il ticket può inviare la richiesta di chiusura.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accetta').setEmoji('<:vegacheckmark:1443666279058772028>').setLabel('Accetta e chiudi').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('rifiuta').setEmoji('<:vegax:1443934876440068179>').setLabel('Rifiuta e mantieni aperto').setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({
        content: `<@${ticketDoc.userId}>`,
        embeds: [
          new EmbedBuilder()
            .setTitle('Richiesta di chiusura')
            .setDescription(`${message.author} ha richiesto di chiudere questo ticket.\nMotivo:\n\`\`\`${reason || 'Nessun motivo inserito'}\`\`\``)
            .setColor('#6f4e37')
        ],
        components: [closeButton]
      });
      return;
    }

    if (subcommand === 'close') {
      const ticketDoc = await Ticket.findOne({ channelId: message.channel.id });
      if (!ticketDoc) {
        await safeMessageReply(message, {
          embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Questo non è un canale ticket')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }
      if (ticketDoc.userId === message.author.id) {
        await safeMessageReply(message, {
          embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Non puoi chiudere da solo il ticket che hai aperto.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }
      if (!canCloseTicket(message.member, ticketDoc.ticketType)) {
        await safeMessageReply(message, {
          embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1443934876440068179> Non puoi chiudere questo ticket.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const transcriptTXT = await createTranscript(message.channel).catch(() => '');
      const transcriptHTML = await createTranscriptHtml(message.channel).catch(() => '');
      const transcriptHtmlPath = transcriptHTML
        ? await saveTranscriptHtml(message.channel, transcriptHTML).catch(() => null)
        : null;
      ticketDoc.open = false;
      ticketDoc.transcript = transcriptTXT;
      await ticketDoc.save().catch(() => { });

      const createdAtFormatted = ticketDoc.createdAt
        ? `<t:${Math.floor(ticketDoc.createdAt.getTime() / 1000)}:F>`
        : 'Data non disponibile';

      const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID) || await message.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (logChannel) {
        await sendTranscriptWithBrowserLink(logChannel, {
          files: transcriptHtmlPath
            ? [{ attachment: transcriptHtmlPath, name: `transcript_${message.channel.id}.html` }]
            : [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${message.channel.id}.txt` }],
          embeds: [
            new EmbedBuilder()
              .setTitle('Ticket Chiuso')
              .setDescription(`**Aperto da:** <@${ticketDoc.userId}>\n**Chiuso da:** ${message.author}\n**Aperto il:** ${createdAtFormatted}\n**Claimato da:** ${ticketDoc.claimedBy ? `<@${ticketDoc.claimedBy}>` : 'Non claimato'}\n**Motivo:** ${ticketDoc.closeReason ? ticketDoc.closeReason : 'Nessun motivo inserito'}`)
              .setColor('#6f4e37')
          ]
        }, Boolean(transcriptHtmlPath));
      }

      const member = await message.guild.members.fetch(ticketDoc.userId).catch(() => null);
      if (member) {
        try {
          await sendTranscriptWithBrowserLink(member, {
            files: transcriptHtmlPath
              ? [{ attachment: transcriptHtmlPath, name: `transcript_${message.channel.id}.html` }]
              : [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${message.channel.id}.txt` }],
            embeds: [
              new EmbedBuilder()
                .setTitle('Ticket Chiuso')
                .setDescription(`**Aperto da:** <@${ticketDoc.userId}>\n**Chiuso da:** ${message.author}\n**Aperto il:** ${createdAtFormatted}\n**Claimato da:** ${ticketDoc.claimedBy ? `<@${ticketDoc.claimedBy}>` : 'Non claimato'}\n**Motivo:** ${ticketDoc.closeReason ? ticketDoc.closeReason : 'Nessun motivo inserito'}`)
                .setColor('#6f4e37')
            ]
          }, Boolean(transcriptHtmlPath));
        } catch (err) {
          if (err?.code !== 50007) global.logger.error('[DM ERROR]', err);
        }
      }

      await Ticket.updateOne(
        { channelId: message.channel.id },
        { $set: { open: false, transcript: transcriptTXT, claimedBy: ticketDoc.claimedBy || null, closeReason: ticketDoc.closeReason || null, closedAt: new Date() } }
      ).catch(() => { });

      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setDescription('🔒 Il ticket verrà chiuso...').setColor('#6f4e37')],
        allowedMentions: { repliedUser: false }
      });

      setTimeout(() => {
        if (message.channel) message.channel.delete().catch(() => { });
      }, 2000);
      return;
    }

    if (subcommand === 'claim') {
      const ticketDoc = await Ticket.findOne({ channelId: message.channel.id });
      if (!ticketDoc) {
        await safeMessageReply(message, {
          embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Questo non è un canale ticket')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }
      if (!canClaimTicket(message.member, ticketDoc.ticketType)) {
        await safeMessageReply(message, {
          embeds: [new EmbedBuilder().setTitle('Errore').setDescription('<:vegax:1443934876440068179> Solo il personale autorizzato può claimare questo ticket.').setColor('Red')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      if (ticketDoc.claimedBy) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setTitle('Errore')
              .setDescription(`<:attentionfromvega:1443651874032062505> Questo ticket è già stato claimato da <@${ticketDoc.claimedBy}>`)
              .setColor('Red')
          ],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      if (ticketDoc.userId === message.author.id) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setTitle('Errore')
              .setDescription('<:vegax:1443934876440068179> Non puoi claimare il ticket che hai aperto tu.')
              .setColor('Red')
          ],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      ticketDoc.claimedBy = message.author.id;
      await ticketDoc.save();
      await message.channel.permissionOverwrites.edit(message.author.id, { ViewChannel: true, SendMessages: true });

      const msg = await fetchTicketMessage(message.channel, ticketDoc.messageId);
      if (!msg) {
        await safeMessageReply(message, {
          embeds: [new EmbedBuilder().setTitle('Errore').setDescription('<:vegax:1443934876440068179> Non riesco a trovare il messaggio del ticket.').setColor('Red')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const updatedEmbed = msg.embeds?.[0] ? EmbedBuilder.from(msg.embeds[0]) : new EmbedBuilder().setColor('#6f4e37');
      const updatedButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒Chiudi').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('close_ticket_motivo').setLabel('📝 Chiudi con motivo').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('unclaim').setLabel('🔓 Unclaim').setStyle(ButtonStyle.Secondary)
      );

      await msg.edit({ embeds: [updatedEmbed], components: [updatedButtons] });
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setTitle('Ticket Claimato')
            .setDescription(`Il ticket è stato preso in carico da <@${ticketDoc.claimedBy}>`)
            .setColor('#6f4e37')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (subcommand === 'unclaim') {
      const ticketDoc = await Ticket.findOne({ channelId: message.channel.id });
      if (!ticketDoc) {
        await safeMessageReply(message, {
          embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Questo non è un canale ticket')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      if (!ticketDoc.claimedBy) {
        await safeMessageReply(message, {
          embeds: [new EmbedBuilder().setTitle('Errore').setDescription('<:vegax:1443934876440068179> Questo ticket non è claimato.').setColor('Red')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const oldClaimer = ticketDoc.claimedBy;
      if (message.author.id !== oldClaimer) {
        await safeMessageReply(message, {
          embeds: [new EmbedBuilder().setTitle('Errore').setDescription('<:vegax:1443934876440068179> Solo chi ha claimato può unclaimare il ticket.').setColor('Red')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      ticketDoc.claimedBy = null;
      await ticketDoc.save();
      await message.channel.permissionOverwrites.delete(oldClaimer).catch(() => { });

      const msg = await fetchTicketMessage(message.channel, ticketDoc.messageId);
      if (!msg) {
        await safeMessageReply(message, {
          embeds: [new EmbedBuilder().setTitle('Errore').setDescription('<:vegax:1443934876440068179> Non riesco a trovare il messaggio principale del ticket.').setColor('Red')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const originalEmbed = msg.embeds?.[0] ? EmbedBuilder.from(msg.embeds[0]) : new EmbedBuilder().setColor('#6f4e37');
      const originalButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Chiudi').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('close_ticket_motivo').setLabel('📝 Chiudi Con Motivo').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('✅ Claim').setStyle(ButtonStyle.Success)
      );

      await msg.edit({ embeds: [originalEmbed], components: [originalButtons] });
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setTitle('Ticket Unclaimato')
            .setDescription(`<@${oldClaimer}> non gestisce più il ticket`)
            .setColor('#6f4e37')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }
    if (subcommand === 'switchpanel') {
      if (!message.member.roles.cache.has(HIGHSTAFF_ROLE_ID)) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setDescription('<:vegax:1443934876440068179> Solo l\'**High Staff** può usare `switchpanel`.')
          ],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const targetChannel = message.channel;
      const categoryToken = String(rest[0] || '').toLowerCase();
      const panelConfig = getTicketPanelConfig(categoryToken);

      if (!targetChannel || !targetChannel.isTextBased?.()) {
        await safeMessageReply(message, {
          embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Specifica un canale valido.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      if (!panelConfig) {
        await safeMessageReply(message, {
          embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Categoria non valida. Usa: `supporto`, `partnership`, `highstaff`.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      if (!message.client.ticketSwitchLocks) message.client.ticketSwitchLocks = new Set();
      if (!message.client.ticketSwitchCooldowns) message.client.ticketSwitchCooldowns = new Map();
      const switchKey = `${message.guild.id}:${targetChannel.id}`;
      const lastSwitchAt = Number(message.client.ticketSwitchCooldowns.get(switchKey) || 0);

      if (message.client.ticketSwitchLocks.has(switchKey)) {
        await safeMessageReply(message, {
          embeds: [makeErrorEmbed('Attendi', '<:attentionfromvega:1443651874032062505> C\'è già uno switchpanel in esecuzione su questo ticket.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      if (Date.now() - lastSwitchAt < 2000) {
        await safeMessageReply(message, {
          embeds: [makeErrorEmbed('Attendi', '<:attentionfromvega:1443651874032062505> Aspetta un attimo prima di rifare switchpanel.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      message.client.ticketSwitchLocks.add(switchKey);
      try {
        const ticketDoc = activeTicketInChannel;
        if (!ticketDoc) {
          await safeMessageReply(message, {
            embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Nel canale indicato non c\'è un ticket aperto.')],
            allowedMentions: { repliedUser: false }
          });
          return;
        }
        if (ticketDoc.ticketType === panelConfig.type) {
          await safeMessageReply(message, {
            embeds: [makeErrorEmbed('Info', `<:attentionfromvega:1443651874032062505> Questo ticket è già impostato su **${panelConfig.label}**.`)],
            allowedMentions: { repliedUser: false }
          });
          return;
        }

        const openerMember = await message.guild.members.fetch(ticketDoc.userId).catch(() => null);
        const openerName = openerMember?.user?.username || 'utente';
        const safeOpenerName = String(openerName).replace(/[^\w.-]/g, '').slice(0, 20) || 'utente';
        const newChannelName = `༄${panelConfig.emoji}︲${panelConfig.name}᲼${safeOpenerName}`;
        if (targetChannel.name !== newChannelName) {
          await targetChannel.setName(newChannelName).catch(() => { });
        }

        await targetChannel.permissionOverwrites.edit(message.guild.roles.everyone.id, { ViewChannel: false }).catch(() => { });
        await targetChannel.permissionOverwrites.edit(ticketDoc.userId, {
          ViewChannel: true,
          SendMessages: true,
          EmbedLinks: true,
          AttachFiles: true,
          ReadMessageHistory: true,
          AddReactions: true
        }).catch(() => { });

        const applyReadOnly = { ViewChannel: true, SendMessages: false, ReadMessageHistory: true };
        const applyFull = {
          ViewChannel: true,
          SendMessages: true,
          EmbedLinks: true,
          AttachFiles: true,
          ReadMessageHistory: true,
          AddReactions: true
        };
        const denyView = { ViewChannel: false };

        if (panelConfig.type === 'supporto') {
          if (ticketDoc.claimedBy) {
            await targetChannel.permissionOverwrites.edit(STAFF_ROLE_ID, applyReadOnly).catch(() => { });
            await targetChannel.permissionOverwrites.edit(HIGHSTAFF_ROLE_ID, applyReadOnly).catch(() => { });
          } else {
            await targetChannel.permissionOverwrites.edit(STAFF_ROLE_ID, applyFull).catch(() => { });
            await targetChannel.permissionOverwrites.edit(HIGHSTAFF_ROLE_ID, applyFull).catch(() => { });
          }
          await targetChannel.permissionOverwrites.edit(PARTNERMANAGER_ROLE_ID, denyView).catch(() => { });
        }

        if (panelConfig.type === 'partnership') {
          if (ticketDoc.claimedBy) {
            await targetChannel.permissionOverwrites.edit(PARTNERMANAGER_ROLE_ID, applyReadOnly).catch(() => { });
            await targetChannel.permissionOverwrites.edit(HIGHSTAFF_ROLE_ID, applyReadOnly).catch(() => { });
          } else {
            await targetChannel.permissionOverwrites.edit(PARTNERMANAGER_ROLE_ID, applyFull).catch(() => { });
            await targetChannel.permissionOverwrites.edit(HIGHSTAFF_ROLE_ID, applyReadOnly).catch(() => { });
          }
          await targetChannel.permissionOverwrites.edit(STAFF_ROLE_ID, denyView).catch(() => { });
        }

        if (panelConfig.type === 'high') {
          if (ticketDoc.claimedBy) {
            await targetChannel.permissionOverwrites.edit(HIGHSTAFF_ROLE_ID, applyReadOnly).catch(() => { });
          } else {
            await targetChannel.permissionOverwrites.edit(HIGHSTAFF_ROLE_ID, applyFull).catch(() => { });
          }
          await targetChannel.permissionOverwrites.edit(STAFF_ROLE_ID, denyView).catch(() => { });
          await targetChannel.permissionOverwrites.edit(PARTNERMANAGER_ROLE_ID, denyView).catch(() => { });
        }

        if (ticketDoc.claimedBy) {
          await targetChannel.permissionOverwrites.edit(ticketDoc.claimedBy, {
            ViewChannel: true,
            SendMessages: true,
            EmbedLinks: true,
            AttachFiles: true,
            ReadMessageHistory: true,
            AddReactions: true
          }).catch(() => { });
        }

        ticketDoc.ticketType = panelConfig.type;
        await ticketDoc.save().catch(() => { });

        if (panelConfig.type === 'partnership' && !ticketDoc.descriptionSubmitted) {
          if (ticketDoc.descriptionPromptMessageId) {
            const oldPrompt = await targetChannel.messages.fetch(ticketDoc.descriptionPromptMessageId).catch(() => null);
            if (oldPrompt) await oldPrompt.delete().catch(() => { });
          }
          const descriptionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('ticket_open_desc_modal')
              .setLabel('📝 Invia Descrizione')
              .setStyle(ButtonStyle.Primary)
          );
          const descriptionPrompt = await targetChannel.send({
            content: `<@${ticketDoc.userId}> usa il pulsante qui sotto per inviare la descrizione del ticket.`,
            components: [descriptionRow]
          }).catch(() => null);
          if (descriptionPrompt?.id) {
            ticketDoc.descriptionPromptMessageId = descriptionPrompt.id;
            await ticketDoc.save().catch(() => { });
          }
        }

        const msg = await fetchTicketMessage(targetChannel, ticketDoc.messageId);
        if (msg) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Chiudi').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('close_ticket_motivo').setLabel('📝 Chiudi Con Motivo').setStyle(ButtonStyle.Danger),
            ticketDoc.claimedBy
              ? new ButtonBuilder().setCustomId('unclaim').setLabel('🔓 Unclaim').setStyle(ButtonStyle.Secondary)
              : new ButtonBuilder().setCustomId('claim_ticket').setLabel('✅ Claim').setStyle(ButtonStyle.Success)
          );
          await msg.edit({ embeds: [panelConfig.embed], components: [row] }).catch(() => { });
        }

        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor('#6f4e37')
              .setTitle('Switch Panel')
              .setDescription(`<:vegacheckmark:1443666279058772028> Ticket aggiornato in **${panelConfig.label || panelConfig.name || panelConfig.type}** nel canale ${targetChannel}.`)
          ],
          allowedMentions: { repliedUser: false }
        });
        return;
      } finally {
        message.client.ticketSwitchLocks.delete(switchKey);
        message.client.ticketSwitchCooldowns.set(switchKey, Date.now());
      }
    }

    if (subcommand === 'rename') {
      if (!message.member.roles.cache.has(HIGHSTAFF_ROLE_ID)) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setDescription('<:vegax:1443934876440068179> Solo l\'**High Staff** può usare `rename`.')
          ],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const rawNewName = rest.join(' ').trim();
      if (!rawNewName) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setDescription('<:vegax:1443934876440068179> Uso corretto: `+ticket rename <nuovo nome>`')
          ],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const currentName = String(message.channel.name || '');
      const firstSeparatorIndex = currentName.indexOf('︲');
      if (firstSeparatorIndex === -1) {
        await safeMessageReply(message, {
          embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Nome canale ticket non valido: manca il separatore `︲`.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const ticketPrefix = currentName.slice(0, firstSeparatorIndex + 1);
      const words = rawNewName
        .replace(/-/g, ' ')
        .split(/\s+/)
        .map((word) => word.replace(/[\/\\#@:`*?"<>|]/g, '').trim())
        .filter(Boolean);
      const normalizedTail = words.join('᲼');

      if (!normalizedTail) {
        await safeMessageReply(message, {
          embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Il nuovo nome non è valido.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const newName = `${ticketPrefix}${normalizedTail}`.slice(0, 100);
      if (newName === currentName) {
        await safeMessageReply(message, {
          embeds: [makeErrorEmbed('Info', '<:attentionfromvega:1443651874032062505> Il canale ha già questo nome.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const renamed = await message.channel.setName(newName).catch(() => null);
      if (!renamed) {
        await safeMessageReply(message, {
          embeds: [makeErrorEmbed('Errore', '<:vegax:1443934876440068179> Non riesco a rinominare il canale con questo nome.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('#6f4e37')
            .setTitle('Rinomina Ticket')
            .setDescription(`<:vegacheckmark:1443666279058772028> Canale rinominato in \`${newName}\``)
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription('<:vegax:1443934876440068179> Subcomando non valido. Usa: `add`, `remove`, `closerequest`, `close`, `claim`, `unclaim`, `switchpanel`, `rename`.')
      ],
      allowedMentions: { repliedUser: false }
    });
  }
};

function makeErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor('#6f4e37');
}

async function resolveUserFromArg(message, rawArg) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  if (!rawArg) return null;

  const id = String(rawArg).match(/^<@!?(\d+)>$/)?.[1] || (String(rawArg).match(/^\d{17,20}$/) ? String(rawArg) : null);
  if (!id) return null;
  return message.client.users.fetch(id).catch(() => null);
}

async function fetchTicketMessage(channel, messageId) {
  if (messageId) {
    const found = await channel.messages.fetch(messageId).catch(() => null);
    if (found) return found;
  }
  const fallback = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  return fallback?.first() || null;
}

function getTicketPanelConfig(raw) {
  const key = String(raw || '').toLowerCase();
  const configs = {
    supporto: {
      type: "supporto",
      emoji: "⭐",
      name: "supporto",
      label: "Supporto",
      embed: new EmbedBuilder()
        .setTitle("<:vsl_ticket:1329520261053022208> • **__TICKET SUPPORTO__**")
        .setDescription(`<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> 🠆 Attendi un membro dello **__\`STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Descrivi supporto, segnalazione o problema in modo chiaro.`)
        .setColor("#6f4e37")
    },
    partnership: {
      type: "partnership",
      emoji: "🤝",
      name: "partnership",
      label: "Partnership",
      embed: new EmbedBuilder()
        .setTitle("<:vsl_ticket:1329520261053022208> • **__TICKET PARTNERSHIP__**")
        .setDescription(`<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> 🠆 Attendi un **__\`PARTNER MANAGER\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Manda la descrizione del tuo server/catena tramite il bottone qui in basso.`)
        .setColor("#6f4e37")
    },
    highstaff: {
      type: "high",
      emoji: "✨",
      name: "highstaff",
      label: "High Staff",
      embed: new EmbedBuilder()
        .setTitle("<:vsl_ticket:1329520261053022208> • **__TICKET HIGH STAFF__**")
        .setDescription(`<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> 🠆 Attendi un **__\`HIGH STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Specifica se riguarda Verifica Selfie, Donazioni, Sponsor o HighStaff.`)
        .setColor("#6f4e37")
    }
  };
  const aliases = {
    supporto: 'supporto',
    prima: 'supporto',
    '1': 'supporto',
    first: 'supporto',
    partnership: 'partnership',
    partner: 'partnership',
    seconda: 'partnership',
    '2': 'partnership',
    second: 'partnership',
    highstaff: 'highstaff',
    high: 'highstaff',
    terza: 'highstaff',
    '3': 'highstaff',
    third: 'highstaff'
  };
  const resolved = aliases[key] || key;
  return configs[resolved] || null;
}
