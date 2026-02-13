const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { getUserOverviewStats } = require('../../Services/Community/activityService');
const { renderUserActivityCanvas } = require('../../Utils/Render/activityCanvas');

function parseWindowDays(rawValue) {
  const parsed = Number(String(rawValue || '14').toLowerCase().replace(/d$/i, ''));
  if ([7, 14, 21].includes(parsed)) return parsed;
  return 14;
}

function parseMyActivityArgs(args = []) {
  const tokens = Array.isArray(args) ? args.map((x) => String(x || '').trim()).filter(Boolean) : [];
  const wantsEmbed = tokens.some((t) => t.toLowerCase() === 'embed');
  const dayToken = tokens.find((t) => /^\d+d?$/i.test(t));
  return {
    lookbackDays: parseWindowDays(dayToken || '14'),
    wantsEmbed
  };
}

function formatHours(seconds) {
  return (Number(seconds || 0) / 3600).toFixed(2);
}

async function resolveChannelLabel(guild, channelId) {
  const id = String(channelId || '');
  if (!id) return `#${id}`;
  const channel = guild.channels?.cache?.get(id) || await guild.channels?.fetch(id).catch(() => null);
  if (!channel) return `#${id}`;
  return `#${channel.name}`;
}

async function enrichChannels(guild, items = []) {
  const out = [];
  for (const item of items) {
    out.push({ ...item, label: await resolveChannelLabel(guild, item?.id) });
  }
  return out;
}

module.exports = {
  name: 'me',

  async execute(message, args = []) {
    await message.channel.sendTyping();

    const { lookbackDays, wantsEmbed } = parseMyActivityArgs(args);
    const stats = await getUserOverviewStats(message.guild.id, message.author.id, lookbackDays);
    const topChannelsText = await enrichChannels(message.guild, stats.topChannelsText);
    const topChannelsVoice = await enrichChannels(message.guild, stats.topChannelsVoice);

    const imageName = `me-overview-${message.author.id}-${lookbackDays}d.png`;
    let file = null;
    try {
      const buffer = await renderUserActivityCanvas({
        guildName: message.guild?.name || 'Server',
        userTag: message.author.tag,
        displayName: message.member?.displayName || message.author.username,
        avatarUrl: message.author.displayAvatarURL({ extension: 'png', size: 256 }),
        createdOn: message.author.createdAt || null,
        joinedOn: message.member?.joinedAt || null,
        lookbackDays,
        windows: stats.windows,
        ranks: stats.ranks,
        topChannelsText,
        topChannelsVoice,
        chart: stats.chart
      });
      file = new AttachmentBuilder(buffer, { name: imageName });
    } catch (error) {
      global.logger?.warn?.('[ME] Canvas render failed:', error?.message || error);
    }

    if (!wantsEmbed) {
      await safeMessageReply(message, {
        files: file ? [file] : [],
        content: file ? null : '<:vegax:1443934876440068179> Non sono riuscito a generare il canvas.',
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setAuthor({ name: `${message.author.tag} - My Activity ${lookbackDays}d`, iconURL: message.author.displayAvatarURL({ size: 128 }) })
      .setImage(file ? `attachment://${imageName}` : null)
      .setDescription([
        `Messaggi (1d/7d/14d): **${stats.windows.d1.text} / ${stats.windows.d7.text} / ${stats.windows.d14.text}**`,
        `Ore vocali (1d/7d/14d): **${formatHours(stats.windows.d1.voiceSeconds)} / ${formatHours(stats.windows.d7.voiceSeconds)} / ${formatHours(stats.windows.d14.voiceSeconds)}**`,
        `Rank server (14d): **Text #${stats.ranks.text || '-'} • Voice #${stats.ranks.voice || '-'}**`,
        stats.approximate ? '_Nota: dati retroattivi parziali._' : null
      ].filter(Boolean).join('\n'));

    await safeMessageReply(message, {
      embeds: [embed],
      files: file ? [file] : [],
      allowedMentions: { repliedUser: false }
    });
  }
};
