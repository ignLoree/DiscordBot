const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { ActivityUser, InviteTrack } = require('../../Schemas/Community/communitySchemas');
const IDs = require('../../Utils/Config/ids');

const TOP_LIMIT = 10;
const LEADERBOARD_CHANNEL_ID = IDs.channels.commands;
const INVITE_THUMBNAIL_URL = 'https://images-ext-1.discordapp.net/external/qGJ0Tl7_BO1f7ichIGhodCqFJDuvfRdwagvKo44IhrE/https/i.imgur.com/9zzrBbk.png?format=webp&quality=lossless&width=120&height=114';

function rankLabel(index) {
  if (index === 0) return '<:VC_Podio1:1469659449974329598>';
  if (index === 1) return '<:VC_Podio2:1469659512863592500>';
  if (index === 2) return '<:VC_Podio3:1469659557696504024>';
  return `${index + 1}.`;
}

function formatHours(seconds) {
  const value = Number(seconds || 0) / 3600;
  return value.toFixed(1);
}

function formatUserLabel(member, userId) {
  if (member) {
    const username = member.user?.username || member.displayName || 'utente';
    return `${member} (${username})`;
  }
  return `<@${userId}>`;
}

async function fetchMembers(guild, userIds) {
  const unique = Array.from(new Set(userIds));
  const out = new Map();
  if (!guild || unique.length === 0) return out;
  for (const id of unique) {
    const cached = guild.members.cache.get(id);
    if (cached) {
      out.set(id, cached);
      continue;
    }
    const fetched = await guild.members.fetch(id).catch(() => null);
    if (fetched) out.set(id, fetched);
  }
  return out;
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

async function buildTopTextEmbed(message) {
  const rows = await ActivityUser.find({ guildId: message.guild.id })
    .sort({ 'messages.total': -1 })
    .limit(TOP_LIMIT)
    .lean();

  const members = await fetchMembers(message.guild, rows.map((r) => r.userId));
  const lines = [];
  rows.forEach((row, index) => {
    const member = members.get(row.userId);
    const label = formatUserLabel(member, row.userId);
    const totalMessages = Number(row?.messages?.total || 0);
    lines.push(`${rankLabel(index)} ${label}`);
    lines.push(`<:VC_Reply:1468262952934314131> Messaggi totali: **${totalMessages}**`);
  });
  if (lines.length === 0) lines.push('Nessun dato disponibile.');

  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL({ size: 128 }) })
    .setTitle('Classifica Messaggi [TopText]')
    .setThumbnail(message.guild.iconURL({ size: 128 }))
    .setDescription(lines.join('\n'));
}

async function buildTopVocEmbed(message) {
  const rows = await ActivityUser.find({ guildId: message.guild.id })
    .sort({ 'voice.totalSeconds': -1 })
    .limit(TOP_LIMIT)
    .lean();

  const members = await fetchMembers(message.guild, rows.map((r) => r.userId));
  const lines = [];
  rows.forEach((row, index) => {
    const member = members.get(row.userId);
    const label = formatUserLabel(member, row.userId);
    const totalSeconds = Number(row?.voice?.totalSeconds || 0);
    lines.push(`${rankLabel(index)} ${label}`);
    lines.push(`<:VC_Reply:1468262952934314131> Tempo vocale totale: **${formatHours(totalSeconds)}** ore`);
  });
  if (lines.length === 0) lines.push('Nessun dato disponibile.');

  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL({ size: 128 }) })
    .setTitle('Classifica Vocale [TopVoc]')
    .setThumbnail(message.guild.iconURL({ size: 128 }))
    .setDescription(lines.join('\n'));
}

async function buildTopInvitesEmbed(message) {
  const rows = await InviteTrack.aggregate([
    { $match: { guildId: message.guild.id } },
    {
      $group: {
        _id: '$inviterId',
        totalInvites: { $sum: 1 },
        activeInvites: { $sum: { $cond: [{ $eq: ['$active', true] }, 1, 0] } }
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
      const activeInvites = Math.min(totalInvites, Math.max(trackedActiveInvites, currentUses));
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
  if (lines.length === 0) lines.push('Nessun dato inviti disponibile.');

  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('<:VC_Leaderboard:1469659357678669958> Classifica Inviti')
    .setDescription(lines.join('\n').trim())
    .setThumbnail(INVITE_THUMBNAIL_URL);
}

function normalizeMode(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (['text', 'txt', 'messaggi', 'messages', 'toptext'].includes(value)) return 'text';
  if (['voc', 'voice', 'vocale', 'topvoc'].includes(value)) return 'voc';
  if (['invites', 'invite', 'inviti', 'topinvites'].includes(value)) return 'invites';
  return null;
}

async function sendLeaderboard(message, embed, mode) {
  const labels = {
    text: { noun: 'messaggi', button: 'Vai alla classifica messaggi' },
    voc: { noun: 'vocale', button: 'Vai alla classifica vocale' },
    invites: { noun: 'inviti', button: 'Vai alla classifica inviti' }
  };
  const meta = labels[mode] || labels.text;
  const shouldRedirect = message.channel.id !== LEADERBOARD_CHANNEL_ID;

  if (!shouldRedirect) {
    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
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
      `Per evitare di intasare la chat, la classifica ${meta.noun} e stata generata nel canale ` +
      `<#${LEADERBOARD_CHANNEL_ID}>. [Clicca qui per vederla](${sent.url}) o utilizza il bottone sottostante.`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(meta.button).setURL(sent.url)
  );

  await safeMessageReply(message, {
    embeds: [redirectEmbed],
    components: [row],
    allowedMentions: { repliedUser: false }
  });
}

module.exports = {
  name: 'top',
  aliases: ['toptext', 'topvoc', 'topinvites'],
  subcommands: ['text', 'voc', 'invites'],
  subcommandAliases: {
    toptext: 'text',
    topvoc: 'voc',
    topinvites: 'invites'
  },

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});

    const mode = normalizeMode(args[0]);
    if (!mode) {
      await safeMessageReply(message, {
        content: '<:vegax:1443934876440068179> Usa: `+top text` | `+top voc` | `+top invites`',
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    let embed = null;
    if (mode === 'text') embed = await buildTopTextEmbed(message);
    else if (mode === 'voc') embed = await buildTopVocEmbed(message);
    else embed = await buildTopInvitesEmbed(message);

    await sendLeaderboard(message, embed, mode);
  }
};
