/**
 * Comando prefix +ticket per server sponsor (Bot Test).
 * Solo staff (sponsorStaffRoleIds) può usare i subcomandi; solo ticket tipo supporto.
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeMessageReply } = require('../Moderation/reply');
const Ticket = require('../../Schemas/Ticket/ticketSchema');
const { createTranscript, createTranscriptHtml, saveTranscriptHtml } = require('./transcriptUtils');
const IDs = require('../Config/ids');

const SUBCOMMAND_ALIASES = {
  add: 'add',
  remove: 'remove',
  close: 'close',
  closerequest: 'closerequest',
  claim: 'claim',
  unclaim: 'unclaim',
  rename: 'rename',
  ticketclose: 'close',
  ticketclaim: 'claim',
  ticketunclaim: 'unclaim',
  tadd: 'add',
  tremove: 'remove',
  ticketadd: 'add',
  ticketremove: 'remove',
  trename: 'rename',
  ticketrename: 'rename'
};

const TICKET_FIRST_TOKENS = new Set([
  'ticket',
  ...Object.keys(SUBCOMMAND_ALIASES)
]);

function isTicketCommand(args) {
  const first = (args[0] || '').toLowerCase();
  return first === 'ticket' || SUBCOMMAND_ALIASES[first] != null;
}

function parseTicketArgs(args) {
  const first = (args[0] || '').toLowerCase();
  let subcommand, rest;
  if (first === 'ticket') {
    subcommand = (args[1] || '').toLowerCase();
    rest = args.slice(2);
  } else {
    subcommand = SUBCOMMAND_ALIASES[first] || first;
    rest = args.slice(1);
  }
  if (rest.length && String(rest[0] || '').toLowerCase() === subcommand) rest = rest.slice(1);
  return { subcommand, rest };
}

function makeErrorEmbed(title, description) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor('#6f4e37');
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
    const transcriptButton = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(attachment.url)
      .setLabel('View Online Transcript')
      .setEmoji('📁');
    const row = new ActionRowBuilder().addComponents(transcriptButton);
    await sent.edit({ content: baseContent || undefined, components: [row] }).catch(() => {});
  }
  return sent;
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

async function runTicketCommand(message, args, client) {
  if (!message?.inGuild?.() || !message.guild || !message.member) return false;
  if (!isTicketCommand(args)) return false;

  const guildId = message.guild.id;
  const staffRoleId = (IDs.roles?.sponsorStaffRoleIds || {})[guildId];
  if (!staffRoleId) return false;

  const { subcommand, rest: normalizedRest } = parseTicketArgs(args);
  if (!subcommand) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription('<:vegax:1472992044140990526> Uso: `+ticket <add|remove|closerequest|close|claim|unclaim|rename>`')
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  const parentChannel = message.channel?.parent || null;
  const inTicketCategory = Boolean(
    parentChannel && String(parentChannel.name || '').toLowerCase().includes('tickets')
  );
  const activeTicketInChannel = await Ticket.findOne({ channelId: message.channel.id, open: true }).catch(() => null);

  if (!inTicketCategory || !activeTicketInChannel) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription('<:vegax:1472992044140990526> I comandi ticket si usano solo dentro un canale ticket.')
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  const hasStaffRole = message.member.roles?.cache?.has(staffRoleId);
  if (!hasStaffRole) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription('<:vegax:1472992044140990526> Solo lo **staff** può usare i comandi ticket su questo server.')
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  const LOG_CHANNEL_ID = IDs.channels?.ticketLogs || null;

  if (subcommand === 'add') {
    const user = await resolveUserFromArg(message, normalizedRest[0]);
    if (!user) {
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1472992044140990526> Specifica un utente valido.')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    await message.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setTitle('Aggiungi')
          .setDescription(`<:vegacheckmark:1472992042203349084> ${user} è stato aggiunto a ${message.channel}`)
          .setColor('#6f4e37')
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  if (subcommand === 'remove') {
    const user = await resolveUserFromArg(message, normalizedRest[0]);
    if (!user) {
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1472992044140990526> Specifica un utente valido.')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    await message.channel.permissionOverwrites.edit(user.id, { ViewChannel: false, SendMessages: false });
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setTitle('Rimuovi')
          .setDescription(`<:vegacheckmark:1472992042203349084> ${user} è stato rimosso da ${message.channel}`)
          .setColor('#6f4e37')
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  if (subcommand === 'closerequest') {
    const reason = normalizedRest.join(' ').trim();
    const ticketDoc = await Ticket.findOne({ channelId: message.channel.id });
    if (!ticketDoc) {
      await safeMessageReply(message, {
        embeds: [makeErrorEmbed('Errore', '<:vegax:1472992044140990526> Questo non è un canale ticket')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    const canRequestClose = message.author.id === ticketDoc.claimedBy;
    if (!canRequestClose) {
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1472992044140990526> Solo chi ha claimato il ticket può inviare la richiesta di chiusura.')],
        allowedMentions: { repliedUser: false }
      });
      return true;
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
    return true;
  }

  if (subcommand === 'close') {
    const ticketDoc = await Ticket.findOne({ channelId: message.channel.id });
    if (!ticketDoc) {
      await safeMessageReply(message, {
        embeds: [makeErrorEmbed('Errore', '<:vegax:1472992044140990526> Questo non è un canale ticket')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    if (ticketDoc.userId === message.author.id) {
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1472992044140990526> Non puoi chiudere da solo il ticket che hai aperto.')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    const claimed = await Ticket.findOneAndUpdate(
      { channelId: message.channel.id, open: true },
      { $set: { open: false, closedAt: new Date() } },
      { new: true }
    );
    if (!claimed) {
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setColor('Orange').setDescription('<:attentionfromvega:1472992040601260042> Ticket già chiuso o chiusura già in corso.')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    const transcriptTXT = await createTranscript(message.channel).catch(() => '');
    const transcriptHTML = await createTranscriptHtml(message.channel).catch(() => '');
    const transcriptHtmlPath = transcriptHTML ? await saveTranscriptHtml(message.channel, transcriptHTML).catch(() => null) : null;
    await Ticket.updateOne(
      { channelId: message.channel.id },
      { $set: { transcript: transcriptTXT, closeReason: claimed.closeReason || null, claimedBy: claimed.claimedBy || null } }
    ).catch(() => {});

    const createdAtFormatted = claimed.createdAt ? `<t:${Math.floor(claimed.createdAt.getTime() / 1000)}:F>` : 'Data non disponibile';
    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID) || await message.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (logChannel?.isTextBased?.()) {
      await sendTranscriptWithBrowserLink(logChannel, {
        files: transcriptHtmlPath
          ? [{ attachment: transcriptHtmlPath, name: `transcript_${message.channel.id}.html` }]
          : [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${message.channel.id}.txt` }],
        embeds: [
          new EmbedBuilder()
            .setTitle('Ticket Chiuso')
            .setDescription(`<:member_role_icon:1330530086792728618> **Aperto da:** <@${claimed.userId}>\n<:discordstaff:1443651872258003005> **Chiuso da:** ${message.author}\n<:Clock:1330530065133338685> **Aperto il:** ${createdAtFormatted}\n<a:VC_Verified:1448687631109197978> **Claimato da:** ${claimed.claimedBy ? `<@${claimed.claimedBy}>` : 'Non claimato'}\n<:reportmessage:1443670575376765130> **Motivo:** ${claimed.closeReason || 'Nessun motivo inserito'}`)
            .setColor('#6f4e37')
        ]
      }, Boolean(transcriptHtmlPath));
    }
    const member = await message.guild.members.fetch(claimed.userId).catch(() => null);
    if (member) {
      try {
        await sendTranscriptWithBrowserLink(member, {
          files: transcriptHtmlPath
            ? [{ attachment: transcriptHtmlPath, name: `transcript_${message.channel.id}.html` }]
            : [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${message.channel.id}.txt` }],
          embeds: [
            new EmbedBuilder()
              .setTitle('Ticket Chiuso')
              .setDescription(`<:member_role_icon:1330530086792728618> **Aperto da:** <@${claimed.userId}>\n<:discordstaff:1443651872258003005> **Chiuso da:** ${message.author}\n<:Clock:1330530065133338685> **Aperto il:** ${createdAtFormatted}\n<a:VC_Verified:1448687631109197978> **Claimato da:** ${claimed.claimedBy ? `<@${claimed.claimedBy}>` : 'Non claimato'}\n<:reportmessage:1443670575376765130> **Motivo:** ${claimed.closeReason || 'Nessun motivo inserito'}`)
              .setColor('#6f4e37')
          ]
        }, Boolean(transcriptHtmlPath));
      } catch (err) {
        if (err?.code !== 50007) global.logger?.error?.('[Ticket DM]', err);
      }
    }
    await safeMessageReply(message, {
      embeds: [new EmbedBuilder().setDescription('🔒 Il ticket verrà chiuso...').setColor('#6f4e37')],
      allowedMentions: { repliedUser: false }
    });
    setTimeout(() => { if (message.channel) message.channel.delete().catch(() => {}); }, 2000);
    return true;
  }

  if (subcommand === 'claim') {
    const ticketDoc = await Ticket.findOne({ channelId: message.channel.id });
    if (!ticketDoc) {
      await safeMessageReply(message, {
        embeds: [makeErrorEmbed('Errore', '<:vegax:1472992044140990526> Questo non è un canale ticket')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    if (ticketDoc.claimedBy) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setTitle('Errore')
            .setDescription(`<:attentionfromvega:1472992040601260042> Questo ticket è già stato claimato da <@${ticketDoc.claimedBy}>`)
            .setColor('Red')
        ],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    if (ticketDoc.userId === message.author.id) {
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setTitle('Errore').setDescription('<:vegax:1472992044140990526> Non puoi claimare il ticket che hai aperto tu.').setColor('Red')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    ticketDoc.claimedBy = message.author.id;
    await ticketDoc.save();
    await message.channel.permissionOverwrites.edit(message.author.id, { ViewChannel: true, SendMessages: true });
    const msg = await fetchTicketMessage(message.channel, ticketDoc.messageId);
    if (!msg) {
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setTitle('Errore').setDescription('<:vegax:1472992044140990526> Non riesco a trovare il messaggio del ticket.').setColor('Red')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    const updatedEmbed = msg.embeds?.[0] ? EmbedBuilder.from(msg.embeds[0]) : new EmbedBuilder().setColor('#6f4e37');
    const updatedButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Chiudi').setStyle(ButtonStyle.Danger),
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
    return true;
  }

  if (subcommand === 'unclaim') {
    const ticketDoc = await Ticket.findOne({ channelId: message.channel.id });
    if (!ticketDoc) {
      await safeMessageReply(message, {
        embeds: [makeErrorEmbed('Errore', '<:vegax:1472992044140990526> Questo non è un canale ticket')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    if (!ticketDoc.claimedBy) {
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setTitle('Errore').setDescription('<:vegax:1472992044140990526> Questo ticket non è claimato.').setColor('Red')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    const oldClaimer = ticketDoc.claimedBy;
    if (message.author.id !== oldClaimer) {
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setTitle('Errore').setDescription('<:vegax:1472992044140990526> Solo chi ha claimato può unclaimare il ticket.').setColor('Red')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    ticketDoc.claimedBy = null;
    await ticketDoc.save();
    await message.channel.permissionOverwrites.delete(oldClaimer).catch(() => {});
    const msg = await fetchTicketMessage(message.channel, ticketDoc.messageId);
    if (!msg) {
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setTitle('Errore').setDescription('<:vegax:1472992044140990526> Non riesco a trovare il messaggio principale del ticket.').setColor('Red')],
        allowedMentions: { repliedUser: false }
      });
      return true;
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
    return true;
  }

  if (subcommand === 'rename') {
    const rawNewName = normalizedRest.join(' ').trim();
    if (!rawNewName) {
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1472992044140990526> Uso: `+ticket rename <nuovo nome>`')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    const currentName = String(message.channel.name || '');
    const firstSeparatorIndex = currentName.indexOf('︲');
    if (firstSeparatorIndex === -1) {
      await safeMessageReply(message, {
        embeds: [makeErrorEmbed('Errore', '<:vegax:1472992044140990526> Nome canale ticket non valido.')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    const ticketPrefix = currentName.slice(0, firstSeparatorIndex + 1);
    const words = rawNewName.replace(/-/g, ' ').split(/\s+/).map((word) => word.replace(/[\/\\#@:`*?"<>|]/g, '').trim()).filter(Boolean);
    const normalizedTail = words.join('᲼');
    if (!normalizedTail) {
      await safeMessageReply(message, {
        embeds: [makeErrorEmbed('Errore', '<:vegax:1472992044140990526> Il nuovo nome non è valido.')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    const newName = `${ticketPrefix}${normalizedTail}`.slice(0, 100);
    const renamed = await message.channel.setName(newName).catch(() => null);
    if (!renamed) {
      await safeMessageReply(message, {
        embeds: [makeErrorEmbed('Errore', '<:vegax:1472992044140990526> Non riesco a rinominare il canale.')],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('#6f4e37')
          .setTitle('Rinomina Ticket')
          .setDescription(`<:vegacheckmark:1472992042203349084> Canale rinominato in \`${newName}\``)
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  await safeMessageReply(message, {
    embeds: [
      new EmbedBuilder()
        .setColor('Red')
        .setDescription('<:vegax:1472992044140990526> Subcomando non valido. Usa: `add`, `remove`, `closerequest`, `close`, `claim`, `unclaim`, `rename`.')
    ],
    allowedMentions: { repliedUser: false }
  });
  return true;
}

module.exports = { runTicketCommand, isTicketCommand, TICKET_FIRST_TOKENS };
