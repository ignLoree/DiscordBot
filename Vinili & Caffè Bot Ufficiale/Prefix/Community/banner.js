const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BannerPrivacy = require('../../Schemas/Community/bannerPrivacySchema');

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

async function resolveMember(message, query) {
  const mention = message.mentions?.members?.first();
  if (mention) return mention;
  const id = String(query || "").replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id)) {
    const cached = message.guild.members.cache.get(id);
    if (cached) return cached;
    try {
      return await message.guild.members.fetch(id);
    } catch {
      return null;
    }
  }
  if (!query) return null;
  const target = normalize(query);
  return message.guild.members.cache.find(member => {
    const username = normalize(member.user?.username);
    const displayName = normalize(member.displayName);
    const tag = normalize(member.user?.tag);
    return username === target || displayName === target || tag === target;
  }) || null;
}

module.exports = {
  skipPrefix: false,
  name: "banner",
  aliases: ["bn"],
  prefixOverride: "?",

  async execute(message, args) {
    if (!message.guild) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.")
        ]
      });
    }

    const query = args.join(" ");
    const member = await resolveMember(message, query) || message.member;
    const user = member?.user || message.author;

    let privacyDoc = null;
    try {
      privacyDoc = await BannerPrivacy.findOneAndUpdate(
        { guildId: message.guild.id, userId: user.id },
        { $setOnInsert: { guildId: message.guild.id, userId: user.id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      privacyDoc = await BannerPrivacy.findOneAndUpdate(
        { guildId: message.guild.id, userId: user.id },
        { $inc: { views: 1 } },
        { new: true }
      );
    } catch {}

    const totalViews = Number(privacyDoc?.views || 0);
    const isBlocked = Boolean(privacyDoc?.blocked);
    const isSelf = message.author.id === user.id;
    if (isBlocked && !isSelf) {
      const blockedEmbed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setThumbnail(`https://images-ext-1.discordapp.net/external/fRgXgmNV39-c_gorTdDdWPSyx2fFy_i4t01cYEF-DKY/https/i.imgur.com/7OnTq5S.png?format=webp&quality=lossless&width=640&height=640`)
        .setTitle('<:vegax:1443934876440068179> Banner Bloccato')
        .setDescription('Questo utente ha bloccato la visualizzazione del proprio banner.');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`banner_unblock:${user.id}`)
          .setLabel('Sblocca')
          .setEmoji('🔓')
          .setStyle(ButtonStyle.Secondary)
      );
      return safeChannelSend(message.channel, { embeds: [blockedEmbed], components: [row] });
    }

    let fetchedUser = user;
    try {
      fetchedUser = await user.fetch();
    } catch {}

    const bannerUrl = fetchedUser.bannerURL({ size: 4096 });
    if (!bannerUrl) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Questo utente non ha un banner.')
        ]
      });
    }

    const authorLabel = member?.displayName || member?.user?.username || user.tag;
    const embed = new EmbedBuilder()
      .setTitle('User Banner')
      .setImage(bannerUrl)
      .setAuthor({ name: authorLabel, iconURL: user.displayAvatarURL() })
      .setColor('#6f4e37')
      .setFooter({
        text: `Puoi disabilitare la visualizzazione del tuo banner tramite il comando ?blockbanner.\n${totalViews} Views 👁`
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('banner_views')
        .setLabel('Classifica Views')
        .setEmoji('📊')
        .setStyle(ButtonStyle.Secondary)
    );

    return safeChannelSend(message.channel, { embeds: [embed], components: [row] });
  }
};
