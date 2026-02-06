const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const AvatarPrivacy = require('../../Schemas/Community/avatarPrivacySchema');

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
  name: "avatar",
  aliases: ["av"],
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

    const subRaw = args[0] ? String(args[0]).toLowerCase() : "";
    const sub = ["get", "server", "user"].includes(subRaw) ? subRaw : "get";
    const query = ["get", "server", "user"].includes(subRaw) ? args.slice(1).join(" ") : args.join(" ");
    const member = await resolveMember(message, query) || message.member;
    const user = member?.user || message.author;

    let privacyDoc = null;
    try {
      privacyDoc = await AvatarPrivacy.findOneAndUpdate(
        { guildId: message.guild.id, userId: user.id },
        { $setOnInsert: { guildId: message.guild.id, userId: user.id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      privacyDoc = await AvatarPrivacy.findOneAndUpdate(
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
        .setTitle('<:vegax:1443934876440068179> Avatar Bloccato')
        .setDescription('Questo utente ha bloccato la visualizzazione del proprio avatar.');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`avatar_unblock:${user.id}`)
          .setLabel('Sblocca')
          .setEmoji('🔓')
          .setStyle(ButtonStyle.Secondary)
      );
      return safeChannelSend(message.channel, { embeds: [blockedEmbed], components: [row] });
    }

    if (sub === "server") {
      const memberAvatar = member.displayAvatarURL();
      const userAvatar = user.displayAvatarURL();
      if (memberAvatar === userAvatar) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("<:vegax:1443934876440068179> Non ha un avatar impostato solo per questo server.")
          ]
        });
      }
    }

    const isUser = sub === "user";
    const title = isUser ? "User Avatar" : "Server Avatar";
    const imageUrl = isUser
      ? user.displayAvatarURL({ size: 4096 })
      : member.displayAvatarURL({ size: 4096 });
    const authorLabel = member?.displayName || member?.user?.username || user.tag;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setImage(imageUrl)
      .setAuthor({ name: authorLabel, iconURL: user.displayAvatarURL() })
      .setColor("#6f4e37")
      .setFooter({
        text: `Puoi disabilitare la visualizzazione del tuo avatar tramite il comando ?blockav.\n${totalViews} Views 👁`
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('avatar_views')
        .setLabel('Classifica Views')
        .setEmoji('📊')
        .setStyle(ButtonStyle.Secondary)
    );

    return safeChannelSend(message.channel, { embeds: [embed], components: [row] });
  }
};
