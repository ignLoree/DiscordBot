const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/message');
const ActivityUser = require('../../Schemas/Community/activityUserSchema');

const TOP_LIMIT = 10;

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
      .setFooter({ text: `⇢ Comando eseguito da: ${message.author.username}` });

    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};

