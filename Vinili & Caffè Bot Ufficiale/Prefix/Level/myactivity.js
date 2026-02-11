const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { getUserActivityStats } = require('../../Services/Community/activityService');
const { renderUserActivityCanvas } = require('../../Utils/Render/activityCanvas');

function formatHours(seconds) {
  const value = Number(seconds || 0) / 3600;
  return value.toFixed(1);
}

module.exports = {
  name: 'myactivity',
  aliases: ['me'],

  async execute(message) {
    await message.channel.sendTyping();

    const stats = await getUserActivityStats(message.guild.id, message.author.id);
    const guildName = message.guild?.name || 'Server';
    const guildIcon = message.guild?.iconURL({ size: 128 }) || null;

    const imageName = `myactivity-${message.author.id}.png`;
    let file = null;
    try {
      const buffer = await renderUserActivityCanvas({
        guildName,
        userTag: message.author.tag,
        avatarUrl: message.author.displayAvatarURL({ extension: 'png', size: 256 }),
        messages: stats.messages,
        voice: stats.voice
      });
      file = new AttachmentBuilder(buffer, { name: imageName });
    } catch (error) {
      global.logger?.warn?.('[MYACTIVITY] Canvas render failed:', error?.message || error);
    }

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setAuthor({ name: guildName, iconURL: guildIcon })
      .setImage(file ? `attachment://${imageName}` : null)
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

    await safeMessageReply(message, {
      embeds: [embed],
      files: file ? [file] : [],
      allowedMentions: { repliedUser: false }
    });
  }
};
