const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { getServerOverviewStats } = require('../../Services/Community/activityService');
const { renderServerActivityCanvas } = require('../../Utils/Render/activityCanvas');

function parseWindowDays(rawValue) {
  const parsed = Number(String(rawValue || '14').toLowerCase().replace(/d$/i, ''));
  if ([7, 14, 21].includes(parsed)) return parsed;
  return 14;
}

function parseServerActivityArgs(args = []) {
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

function formatCompactMessages(value) {
  const n = Number(value || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`;
  return `${n}`;
}

async function resolveChannelLabel(guild, channelId) {
  const id = String(channelId || '');
  if (!id) return `#${id}`;
  const channel = guild.channels?.cache?.get(id) || await guild.channels?.fetch(id).catch(() => null);
  if (!channel) return `#${id}`;
  return `#${channel.name}`;
}

async function resolveUserLabel(guild, userId) {
  const id = String(userId || '');
  if (!id) return `@${id}`;
  const member = guild.members?.cache?.get(id) || await guild.members?.fetch(id).catch(() => null);
  if (member?.displayName) return `@${member.displayName}`;
  if (member?.user?.username) return `@${member.user.username}`;
  const user = await guild.client?.users?.fetch(id).catch(() => null);
  if (user?.username) return `@${user.username}`;
  return `@${id}`;
}

async function enrichTops(guild, stats) {
  const topUsersText = [];
  for (const item of stats.topUsersText || []) topUsersText.push({ ...item, label: await resolveUserLabel(guild, item.id) });
  const topUsersVoice = [];
  for (const item of stats.topUsersVoice || []) topUsersVoice.push({ ...item, label: await resolveUserLabel(guild, item.id) });
  const topChannelsText = [];
  for (const item of stats.topChannelsText || []) topChannelsText.push({ ...item, label: await resolveChannelLabel(guild, item.id) });
  const topChannelsVoice = [];
  for (const item of stats.topChannelsVoice || []) topChannelsVoice.push({ ...item, label: await resolveChannelLabel(guild, item.id) });
  return { topUsersText, topUsersVoice, topChannelsText, topChannelsVoice };
}

module.exports = {
  name: 'serveractivity',
  aliases: ['sactivity', 'guildactivity'],

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const { lookbackDays, wantsEmbed } = parseServerActivityArgs(args);
    const stats = await getServerOverviewStats(message.guild.id, lookbackDays);
    const enriched = await enrichTops(message.guild, stats);

    const imageName = `serveractivity-overview-${message.guild.id}-${lookbackDays}d.png`;
    let file = null;
    try {
      const buffer = await renderServerActivityCanvas({
        guildName: message.guild?.name || 'Server',
        guildIconUrl: message.guild?.iconURL({ extension: 'png', size: 256 }) || null,
        createdOn: message.guild?.createdAt || null,
        invitedBotOn: message.guild?.members?.me?.joinedAt || null,
        lookbackDays,
        windows: stats.windows,
        topUsersText: enriched.topUsersText,
        topUsersVoice: enriched.topUsersVoice,
        topChannelsText: enriched.topChannelsText,
        topChannelsVoice: enriched.topChannelsVoice,
        chart: stats.chart,
        approximate: stats.approximate
      });
      file = new AttachmentBuilder(buffer, { name: imageName });
    } catch (error) {
      global.logger?.warn?.('[SERVERACTIVITY] Canvas render failed:', error?.message || error);
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
      .setAuthor({ name: `${message.guild?.name || 'Server'} - Overview ${lookbackDays}d`, iconURL: message.guild?.iconURL({ size: 128 }) || null })
      .setImage(file ? `attachment://${imageName}` : null)
      .setDescription([
        `Messaggi (1d/7d/14d): **${stats.windows.d1.text} / ${stats.windows.d7.text} / ${stats.windows.d14.text}**`,
        `Ore vocali (1d/7d/14d): **${formatHours(stats.windows.d1.voiceSeconds)} / ${formatHours(stats.windows.d7.voiceSeconds)} / ${formatHours(stats.windows.d14.voiceSeconds)}**`,
        `Contributors (1d/7d/14d): **${stats.windows.d1.contributors} / ${stats.windows.d7.contributors} / ${stats.windows.d14.contributors}**`,
        stats.approximate ? '_Nota: dati retroattivi parziali._' : null
      ].filter(Boolean).join('\n'));

    await safeMessageReply(message, {
      embeds: [embed],
      files: file ? [file] : [],
      allowedMentions: { repliedUser: false }
    });
  }
};
