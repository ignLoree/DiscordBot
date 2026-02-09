const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { InviteTrack } = require('../../Schemas/Community/communitySchemas');
const IDs = require('../../Utils/Config/ids');

const TOP_LIMIT = 10;
const THUMBNAIL_URL = 'https://images-ext-1.discordapp.net/external/qGJ0Tl7_BO1f7ichIGhodCqFJDuvfRdwagvKo44IhrE/https/i.imgur.com/9zzrBbk.png?format=webp&quality=lossless&width=120&height=114';
const LEADERBOARD_CHANNEL_ID = IDs.channels.levelUp;

function rankLabel(index) {
  if (index === 0) return '<:VC_Podio1:1469659449974329598>';
  if (index === 1) return '<:VC_Podio2:1469659512863592500>';
  if (index === 2) return '<:VC_Podio3:1469659557696504024>';
  return `${index + 1}°`;
}

async function resolveDisplayName(guild, userId) {
  const cachedMember = guild.members.cache.get(userId);
  if (cachedMember) return cachedMember.displayName;

  const fetchedMember = await guild.members.fetch(userId).catch(() => null);
  if (fetchedMember) return fetchedMember.displayName;

  const cachedUser = guild.client.users.cache.get(userId);
  if (cachedUser) return cachedUser.username;

  const fetchedUser = await guild.client.users.fetch(userId).catch(() => null);
  if (fetchedUser) return fetchedUser.username;

  return `utente_${String(userId).slice(-6)}`;
}

async function getCurrentInviteUsesMap(guild) {
  const map = new Map();
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return map;
  for (const invite of invites.values()) {
    const inviterId = invite?.inviter?.id;
    if (!inviterId) continue;
    map.set(inviterId, (map.get(inviterId) || 0) + Number(invite.uses || 0));
  }
  return map;
}

module.exports = {
  name: 'topinvites',

  async execute(message) {
    await message.channel.sendTyping();

    const rows = await InviteTrack.aggregate([
      { $match: { guildId: message.guild.id } },
      {
        $group: {
          _id: '$inviterId',
          totalInvites: { $sum: 1 },
          activeInvites: {
            $sum: {
              $cond: [{ $eq: ['$active', true] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          inviterId: '$_id',
          totalInvites: 1,
          activeInvites: 1,
          leftInvites: { $subtract: ['$totalInvites', '$activeInvites'] }
        }
      },
      { $sort: { totalInvites: -1, activeInvites: -1 } },
      { $limit: TOP_LIMIT * 3 }
    ]);

    const currentUsesMap = await getCurrentInviteUsesMap(message.guild);
    const merged = new Map();

    for (const row of rows) {
      merged.set(row.inviterId, {
        inviterId: row.inviterId,
        trackedTotal: Number(row.totalInvites || 0),
        activeInvites: Number(row.activeInvites || 0),
        leftInvites: Number(row.leftInvites || 0)
      });
    }

    for (const [inviterId, uses] of currentUsesMap.entries()) {
      if (!merged.has(inviterId)) {
        merged.set(inviterId, {
          inviterId,
          trackedTotal: 0,
          activeInvites: 0,
          leftInvites: 0
        });
      }
      const item = merged.get(inviterId);
      item.currentUses = Number(uses || 0);
      merged.set(inviterId, item);
    }

    const finalRows = Array.from(merged.values())
      .map((r) => {
        const totalInvites = Math.max(Number(r.trackedTotal || 0), Number(r.currentUses || 0));
        const trackedActiveInvites = Number(r.activeInvites || 0);
        const currentUses = Number(r.currentUses || 0);
        const activeInvites = Math.min(
          totalInvites,
          Math.max(trackedActiveInvites, currentUses)
        );
        const leftInvites = Math.max(0, totalInvites - activeInvites);
        return { inviterId: r.inviterId, totalInvites, activeInvites, leftInvites };
      })
      .sort((a, b) => b.totalInvites - a.totalInvites || b.activeInvites - a.activeInvites)
      .slice(0, TOP_LIMIT);

    const lines = [];
    for (let i = 0; i < finalRows.length; i += 1) {
      const row = finalRows[i];
      const name = await resolveDisplayName(message.guild, row.inviterId);
      const total = Number(row.totalInvites || 0);
      const active = Number(row.activeInvites || 0);
      const left = Number(row.leftInvites || 0);
      const retention = total > 0 ? Math.round((active / total) * 100) : 0;

      lines.push(`${rankLabel(i)} **${name}**`);
      lines.push(`<:VC_Reply:1468262952934314131> **${total}** inviti totali (<:vegacheckmark:1443666279058772028> **${active}** attivi, <:vegax:1443934876440068179> **${left}** usciti, <:podium:1469660769984708629> **${retention}%** ritenzione)`);
      lines.push('');
    }

    if (lines.length === 0) {
      lines.push('Nessun dato inviti disponibile.');
    }

    const now = new Date().toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Rome'
    });

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('<:VC_Leaderboard:1469659357678669958> Classifica Inviti')
      .setDescription(lines.join('\n').trim())
      .setThumbnail(THUMBNAIL_URL)

    const shouldRedirect = message.channel.id !== LEADERBOARD_CHANNEL_ID;
    if (!shouldRedirect) {
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const leaderboardChannel = message.guild.channels.cache.get(LEADERBOARD_CHANNEL_ID)
      || await message.guild.channels.fetch(LEADERBOARD_CHANNEL_ID).catch(() => null);

    if (!leaderboardChannel || !leaderboardChannel.isTextBased()) {
      await safeMessageReply(message, {
        content: `Non riesco a trovare il canale <#${LEADERBOARD_CHANNEL_ID}>.`,
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const sent = await leaderboardChannel.send({ embeds: [embed] }).catch(() => null);
    if (!sent) {
      await safeMessageReply(message, {
        content: `Non sono riuscito a inviare la classifica in <#${LEADERBOARD_CHANNEL_ID}>.`,
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const redirectEmbed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setDescription(
        `Per evitare di intasare la chat, la classifica inviti è stata generata nel canale ` +
        `<#${LEADERBOARD_CHANNEL_ID}>. [Clicca qui per vederla](${sent.url}) o utilizza il bottone sottostante.`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Vai alla classifica inviti')
        .setURL(sent.url)
    );

    await safeMessageReply(message, {
      embeds: [redirectEmbed],
      components: [row],
      allowedMentions: { repliedUser: false }
    });
  }
};



