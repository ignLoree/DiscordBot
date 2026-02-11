const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { getServerActivityStats } = require('../../Services/Community/activityService');
const { renderServerActivityCanvas } = require('../../Utils/Render/activityCanvas');

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
  name: 'serveractivity',
  aliases: ['sactivity', 'guildactivity'],

  async execute(message, args = []) {
    await message.channel.sendTyping();

    const days = parseWindowDays(args[0]);
    const stats = await getServerActivityStats(message.guild.id, days);

    const imageName = `serveractivity-${message.guild.id}-${days}d.png`;
    let file = null;
    try {
      const buffer = await renderServerActivityCanvas({
        guildName: message.guild?.name || 'Server',
        guildIconUrl: message.guild?.iconURL({ extension: 'png', size: 256 }) || null,
        days,
        totals: stats.totals,
        topChannelsText: stats.topChannelsText,
        topChannelsVoice: stats.topChannelsVoice,
        topUsersText: stats.topUsersText,
        topUsersVoice: stats.topUsersVoice,
        approximate: Boolean(stats.approximate)
      });
      file = new AttachmentBuilder(buffer, { name: imageName });
    } catch (error) {
      global.logger?.warn?.('[SERVERACTIVITY] Canvas render failed:', error?.message || error);
    }

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setAuthor({
        name: `${message.guild?.name || 'Server'} - Activity ${days}d`,
        iconURL: message.guild?.iconURL({ size: 128 }) || null
      })
      .setImage(file ? `attachment://${imageName}` : null)
      .setDescription([
        `<a:VC_Flowers:1468687836055212174> Statistiche server ultime **${days}d**`,
        '',
        `Messaggi totali: **${stats.totals.text}**`,
        `Ore vocali totali: **${formatHours(stats.totals.voiceSeconds)}**`,
        stats.approximate
          ? '_Nota: dati retroattivi parziali (top canali disponibili solo dal nuovo tracking)._'
          : null
      ].filter(Boolean).join('\n'))
      .addFields(
        { name: 'Top 3 canali text', value: topChannelsText(stats.topChannelsText), inline: false },
        { name: 'Top 3 canali voc', value: topChannelsVoice(stats.topChannelsVoice), inline: false },
        { name: 'Top 3 utenti text', value: topUsersText(stats.topUsersText), inline: false },
        { name: 'Top 3 utenti voc', value: topUsersVoice(stats.topUsersVoice), inline: false }
      );

    await safeMessageReply(message, {
      embeds: [embed],
      files: file ? [file] : [],
      allowedMentions: { repliedUser: false }
    });
  }
};
