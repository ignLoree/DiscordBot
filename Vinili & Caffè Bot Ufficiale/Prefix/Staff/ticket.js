const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const Ticket = require('../../Schemas/Ticket/ticketSchema');
const createTranscript = require('../../Utils/Ticket/createTranscript');

const LOG_CHANNEL_ID = '1442569290682208296';
const STAFF_ROLE_ID = '1442568910070349985';

module.exports = {
  name: 'ticket',

  async execute(message, args = []) {
    if (!message.inGuild?.() || !message.guild || !message.member) {
      await safeMessageReply(message, {
        content: '<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.',
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const subcommand = String(args[0] || '').toLowerCase();
    const rest = args.slice(1);

    if (!subcommand) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Uso corretto: `+ticket <add|remove|closerequest|close|claim|unclaim>`')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

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

      const transcriptTXT = await createTranscript(message.channel).catch(() => '');
      ticketDoc.open = false;
      ticketDoc.transcript = transcriptTXT;
      await ticketDoc.save().catch(() => {});

      const createdAtFormatted = ticketDoc.createdAt
        ? `<t:${Math.floor(ticketDoc.createdAt.getTime() / 1000)}:F>`
        : 'Data non disponibile';

      const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID) || await message.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (logChannel) {
        await logChannel.send({
          files: [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${message.channel.id}.txt` }],
          embeds: [
            new EmbedBuilder()
              .setTitle('Ticket Chiuso')
              .setDescription(`**Aperto da:** <@${ticketDoc.userId}>\n**Chiuso da:** ${message.author}\n**Aperto il:** ${createdAtFormatted}\n**Claimato da:** ${ticketDoc.claimedBy ? `<@${ticketDoc.claimedBy}>` : 'Non claimato'}\n**Motivo:** ${ticketDoc.closeReason ? ticketDoc.closeReason : 'Nessun motivo inserito'}`)
              .setColor('#6f4e37')
          ]
        }).catch((err) => global.logger.error(err));
      }

      const member = await message.guild.members.fetch(ticketDoc.userId).catch(() => null);
      if (member) {
        try {
          await member.send({
            files: [{ attachment: Buffer.from(transcriptTXT, 'utf-8'), name: `transcript_${message.channel.id}.txt` }],
            embeds: [
              new EmbedBuilder()
                .setTitle('Ticket Chiuso')
                .setDescription(`**Aperto da:** <@${ticketDoc.userId}>\n**Chiuso da:** ${message.author}\n**Aperto il:** ${createdAtFormatted}\n**Claimato da:** ${ticketDoc.claimedBy ? `<@${ticketDoc.claimedBy}>` : 'Non claimato'}\n**Motivo:** ${ticketDoc.closeReason ? ticketDoc.closeReason : 'Nessun motivo inserito'}`)
                .setColor('#6f4e37')
            ]
          });
        } catch (err) {
          if (err?.code !== 50007) global.logger.error('[DM ERROR]', err);
        }
      }

      await Ticket.updateOne(
        { channelId: message.channel.id },
        { $set: { open: false, transcript: transcriptTXT, claimedBy: ticketDoc.claimedBy || null, closeReason: ticketDoc.closeReason || null, closedAt: new Date() } }
      ).catch(() => {});

      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setDescription('🔒 Il ticket verrà chiuso...').setColor('#6f4e37')],
        allowedMentions: { repliedUser: false }
      });

      setTimeout(() => {
        if (message.channel) message.channel.delete().catch(() => {});
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
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Chiudi').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('close_ticket_motivo').setLabel('📝 Chiudi con motivo').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('unclaim').setLabel('<a:VC_Unlock:1470011538432852108> Unclaim').setStyle(ButtonStyle.Secondary)
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
      const hasAllowedRole = message.member.roles.cache.has(STAFF_ROLE_ID);
      if (message.author.id !== oldClaimer && !hasAllowedRole) {
        await safeMessageReply(message, {
          embeds: [new EmbedBuilder().setTitle('Errore').setDescription('<:vegax:1443934876440068179> Non puoi unclaimare questo ticket.').setColor('Red')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      ticketDoc.claimedBy = null;
      await ticketDoc.save();
      await message.channel.permissionOverwrites.delete(oldClaimer).catch(() => {});

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

    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription('<:vegax:1443934876440068179> Subcomando non valido. Usa: `add`, `remove`, `closerequest`, `close`, `claim`, `unclaim`.')
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
