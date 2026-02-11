const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { getUserActivityStats, getServerActivityStats } = require('../../Services/Community/activityService');

function formatHours(seconds) {
  const value = Number(seconds || 0) / 3600;
  return value.toFixed(1);
}

function parseWindowDays(rawValue) {
  const parsed = Number(String(rawValue || '7').toLowerCase().replace(/d$/i, ''));
  if ([7, 14, 21].includes(parsed)) return parsed;
  return 7;
}

function topChannelsText(items) {
  if (!Array.isArray(items) || items.length === 0) return 'Nessun dato disponibile.';
  return items.map((item, idx) => `${idx + 1}. <#${item.id}> - **${item.value}** msg`).join('\n');
}

function topChannelsVoice(items) {
  if (!Array.isArray(items) || items.length === 0) return 'Nessun dato disponibile.';
  return items.map((item, idx) => `${idx + 1}. <#${item.id}> - **${formatHours(item.value)}** h`).join('\n');
}

function topUsersText(items) {
  if (!Array.isArray(items) || items.length === 0) return 'Nessun dato disponibile.';
  return items.map((item, idx) => `${idx + 1}. <@${item.id}> - **${item.value}** msg`).join('\n');
}

function topUsersVoice(items) {
  if (!Array.isArray(items) || items.length === 0) return 'Nessun dato disponibile.';
  return items.map((item, idx) => `${idx + 1}. <@${item.id}> - **${formatHours(item.value)}** h`).join('\n');
}

module.exports = {
  name: 'myactivity',

  async execute(message, args = []) {
    await message.channel.sendTyping();

    const mode = String(args[0] || '').toLowerCase();
    if (mode === 'server' || mode === 'guild') {
      const days = parseWindowDays(args[1]);
      const stats = await getServerActivityStats(message.guild.id, days);

      const embed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setAuthor({
          name: `${message.guild?.name || 'Server'} - Activity ${days}d`,
          iconURL: message.guild?.iconURL({ size: 128 }) || null
        })
        .setDescription([
          `<a:VC_Flowers:1468687836055212174> Statistiche server ultime **${days}d**`,
          '',
          `Messaggi totali: **${stats.totals.text}**`,
          `Ore vocali totali: **${formatHours(stats.totals.voiceSeconds)}**`
        ].join('\n'))
        .addFields(
          { name: 'Top 3 canali text', value: topChannelsText(stats.topChannelsText), inline: false },
          { name: 'Top 3 canali voc', value: topChannelsVoice(stats.topChannelsVoice), inline: false },
          { name: 'Top 3 utenti text', value: topUsersText(stats.topUsersText), inline: false },
          { name: 'Top 3 utenti voc', value: topUsersVoice(stats.topUsersVoice), inline: false }
        );

      await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
      return;
    }

    const stats = await getUserActivityStats(message.guild.id, message.author.id);
    const guildName = message.guild?.name || 'Server';
    const guildIcon = message.guild?.iconURL({ size: 128 }) || null;

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setAuthor({ name: guildName, iconURL: guildIcon })
      .setDescription([
        `<a:VC_Flowers:1468687836055212174> **__${message.author.tag}__** le tue statistiche 𓂃★`,
        '',
        '<:channeltext:1443247596922470551> __Messaggi__:',
        `<:dot:1443660294596329582> Giornalieri: **${stats.messages.daily}** _messaggi_`,
        `<:dot:1443660294596329582> Settimanali: **${stats.messages.weekly}** _messaggi_`,
        `<:dot:1443660294596329582> Totali: **${stats.messages.total}** _messaggi_`,
        '',
        '<:voice:1467639623735054509> __Ore in vocale__:',
        `<:dot:1443660294596329582> Giornalieri: **${formatHours(stats.voice.dailySeconds)}** _ore_`,
        `<:dot:1443660294596329582> Settimanali: **${formatHours(stats.voice.weeklySeconds)}** _ore_`,
        `<:dot:1443660294596329582> Totali: **${formatHours(stats.voice.totalSeconds)}** _ore_`
      ].join('\n'));

    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
