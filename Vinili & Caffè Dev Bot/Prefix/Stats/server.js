const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { buildServerStats } = require("../../Services/Stats/statsService");
const renderServerStatsCanvas = require("../../Utils/Render/serverStatsCanvas");

async function resolveUserLabel(guild, userId) {
  if (!userId) return "-";
  let member = guild.members.cache.get(userId);
  if (!member) {
    try {
      member = await guild.members.fetch(userId);
    } catch {
      member = null;
    }
  }
  if (member) return member.displayName || member.user?.username || "Unknown";
  const user = guild.client.users.cache.get(userId);
  return user?.username || "Unknown";
}

async function resolveChannelLabel(guild, channelId) {
  if (!channelId) return "-";
  let channel = guild.channels.cache.get(channelId);
  if (!channel) {
    try {
      channel = await guild.channels.fetch(channelId);
    } catch {
      channel = null;
    }
  }
  if (!channel) return "Unknown";
  if (!channel.name) return "Unknown";
  return `#${channel.name}`;
}\\uFE0F]/gu, "")
    .replace(/\\s{2,}/g, " ")
    .trim();
  return cleaned ? `#${cleaned}` : "Unknown";
}

module.exports = {
  skipPrefix: false,
  name: "server",
  aliases: ["serverstats", "stats"],
  prefixOverride: "s?",

  async execute(message) {
    if (!message.guild) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando puo essere usato solo in un server.")
        ]
      });
    }

    const stats = await buildServerStats(message.guild, 14);
    const [topMsgUserLabel, topVoiceUserLabel, topMsgChannelLabel, topVoiceChannelLabel] = await Promise.all([
      resolveUserLabel(message.guild, stats.top?.messageUser?.id),
      resolveUserLabel(message.guild, stats.top?.voiceUser?.id),
      resolveChannelLabel(message.guild, stats.top?.messageChannel?.id),
      resolveChannelLabel(message.guild, stats.top?.voiceChannel?.id)
    ]);

    const timezoneLabel = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
      } catch {
        return "Local";
      }
    })();

    const buffer = await renderServerStatsCanvas({
      guildName: message.guild.name,
      guildIconUrl: message.guild.iconURL({ size: 128, extension: "png" }),
      createdAt: message.guild.createdAt,
      joinedAt: message.guild.members.me?.joinedAt || message.guild.joinedAt,
      botIconUrl: message.guild.members.me?.user?.displayAvatarURL({ size: 64 }),
      totals: stats.totals,
      contributors: stats.contributors,
      series: {
        message: stats.messageSeries,
        voice: stats.voiceSeries
      },
      top: {
        messageUser: { label: topMsgUserLabel, value: stats.top?.messageUser?.total || 0 },
        voiceUser: { label: topVoiceUserLabel, value: stats.top?.voiceUser?.total || 0 },
        messageChannel: { label: topMsgChannelLabel, value: stats.top?.messageChannel?.total || 0 },
        voiceChannel: { label: topVoiceChannelLabel, value: stats.top?.voiceChannel?.total || 0 }
      },
      timezoneLabel
    });

    if (!buffer) {
      const fallback = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Server Overview")
        .setDescription("Canvas non disponibile. Abilita il modulo `canvas` per vedere la card grafica.");
      return message.channel.send({ embeds: [fallback] });
    }

    const attachment = new AttachmentBuilder(buffer, { name: "server-stats.png" });
    return message.channel.send({ files: [attachment] });
  }
};
