const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { ActivityUser } = require('../../Schemas/Community/communitySchemas');
const IDs = require('../../Utils/Config/ids');

const TOP_LIMIT = 10;
const LEADERBOARD_CHANNEL_ID = IDs.channels.commands;

function rankLabel(index) {
  if (index === 0) return '<:VC_Podio1:1469659449974329598>';
  if (index === 1) return '<:VC_Podio2:1469659512863592500>';
  if (index === 2) return '<:VC_Podio3:1469659557696504024>';
  return `${index + 1}°`;
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

module.exports = {
  name: 'toptext',

  async execute(message) {
    await message.channel.sendTyping();

    const rows = await ActivityUser.find({ guildId: message.guild.id })
      .sort({ 'messages.total': -1 })
      .limit(TOP_LIMIT)
      .lean();

    const members = await fetchMembers(message.guild, rows.map(r => r.userId));
    const lines = [];

    rows.forEach((row, index) => {
      const member = members.get(row.userId);
      const label = formatUserLabel(member, row.userId);
      const totalMessages = Number(row?.messages?.total || 0);
      lines.push(`${rankLabel(index)} ${label}`);
      lines.push(`<:VC_Reply:1468262952934314131> Messaggi totali: **${totalMessages}**`);
    });

    if (lines.length === 0) {
      lines.push('Nessun dato disponibile.');
    }

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL({ size: 128 }) })
      .setTitle('Classifica Messaggi [TopText]')
      .setThumbnail(message.guild.iconURL({ size: 128 }))
      .setDescription(lines.join('\n'))

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
        `Per evitare di intasare la chat, la classifica messaggi e stata generata nel canale ` +
        `<#${LEADERBOARD_CHANNEL_ID}>. [Clicca qui per vederla](${sent.url}) o utilizza il bottone sottostante.`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Vai alla classifica messaggi')
        .setURL(sent.url)
    );

    await safeMessageReply(message, {
      embeds: [redirectEmbed],
      components: [row],
      allowedMentions: { repliedUser: false }
    });
  }
};



