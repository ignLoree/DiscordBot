const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/message');
const InviteTrack = require('../../Schemas/Community/inviteTrackSchema');

function resolveTargetUser(message) {
  const mentioned = message.mentions?.users?.first();
  if (mentioned) return mentioned;

  const args = String(message.content || '').trim().split(/\s+/).slice(1);
  const raw = args[0];
  if (!raw) return message.author;

  const id = raw.replace(/[<@!>]/g, '');
  if (!/^\d{16,20}$/.test(id)) return message.author;
  return message.client.users.cache.get(id) || message.author;
}

function formatRetention(rate) {
  return `${rate}% dei membri invitati sono ancora presenti`;
}

async function getCurrentInviteUsesForUser(guild, userId) {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return 0;
  let total = 0;
  for (const invite of invites.values()) {
    if (invite?.inviter?.id === userId) {
      total += Number(invite.uses || 0);
    }
  }
  return total;
}

module.exports = {
  name: 'invites',

  async execute(message) {
    await message.channel.sendTyping();

    const target = resolveTargetUser(message);
    const rows = await InviteTrack.find({
      guildId: message.guild.id,
      inviterId: target.id
    })
      .select('active')
      .lean();

    const trackedTotal = rows.length;
    const trackedActive = rows.filter(r => r.active).length;
    const currentInviteUses = await getCurrentInviteUsesForUser(message.guild, target.id);
    const totalInvited = Math.max(trackedTotal, currentInviteUses);
    // Fallback storico: se il tracking DB e recente, usiamo anche gli uses correnti
    // per evitare "0 attivi" falsi su dati vecchi.
    const activeMembers = Math.min(
      totalInvited,
      Math.max(trackedActive, currentInviteUses)
    );
    const leftMembers = Math.max(0, totalInvited - activeMembers);
    const retention = totalInvited > 0
      ? Math.round((activeMembers / totalInvited) * 100)
      : 0;

    const now = new Date();
    const timeText = now.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Rome'
    });

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('Informazioni inviti')
      .setDescription(`Statistiche sugli inviti effettuati da **${target.username}**`)
      .addFields(
        { name: '👥 Totale Invitati', value: String(totalInvited), inline: true },
        { name: '<:vegacheckmark:1443666279058772028> Membri Attuali', value: String(activeMembers), inline: true },
        { name: '<:vegax:1443934876440068179> Membri Usciti', value: String(leftMembers), inline: true },
        { name: '<:podium:1469660769984708629> Tasso di Ritenzione', value: formatRetention(retention), inline: false }
      )
      .setThumbnail('https://images-ext-1.discordapp.net/external/qGJ0Tl7_BO1f7ichIGhodCqFJDuvfRdwagvKo44IhrE/https/i.imgur.com/9zzrBbk.png?format=webp&quality=lossless&width=120&height=114')
      .setFooter({
        text: `Richiesto da ${message.author.username} • Oggi alle ${timeText}`,
        iconURL: message.author.displayAvatarURL({ size: 64 })
      });

    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false }
    });
  }
};
