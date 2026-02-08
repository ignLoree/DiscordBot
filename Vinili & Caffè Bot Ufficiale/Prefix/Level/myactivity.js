const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { getUserActivityStats } = require('../../Services/Community/activityService');

function formatHours(seconds) {
  const value = Number(seconds || 0) / 3600;
  return value.toFixed(1);
}

module.exports = {
  name: 'myactivity',
  
  async execute(message) {
    await message.channel.sendTyping();

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
        `<:dot:1443660294596329582> Totali: **${formatHours(stats.voice.totalSeconds)}** _ore_`,
      ].join('\n'))
      .setFooter({ text: `Comando eseguito da ${message.author.username}`, iconURL: message.author.displayAvatarURL() });

    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
