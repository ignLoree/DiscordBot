const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const AvatarPrivacy = require('../../Schemas/Community/avatarPrivacySchema');

module.exports = {
  name: 'blockav',
  aliases: ['blockavatar', 'blockavt'],
  prefixOverride: '?',

  async execute(message) {
    if (!message.guild) return;
    const userId = message.author.id;
    try {
      await AvatarPrivacy.findOneAndUpdate(
        { guildId: message.guild.id, userId },
        { $set: { blocked: true }, $setOnInsert: { guildId: message.guild.id, userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch {}

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('Avatar bloccato')
      .setThumbnail(`https://images-ext-1.discordapp.net/external/GrhQsfA7zwxEiX5aOQo9kfQ-EF9Z9VLS-JD0w5iJEZU/https/i.imgur.com/Qqn7J3d.png?format=webp&quality=lossless&width=640&height=640`)
      .setDescription([
        'Gli altri membri non potranno più visualizzare il tuo avatar.',
        '',
        'ⓘ Utilizza il pulsante qui sotto o il comando `?unblockavatar` se vuoi riattivare la visualizzazione.'
      ].join('\n'));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`avatar_unblock:${userId}`)
        .setLabel('Sblocca')
        .setEmoji('🔓')
        .setStyle(ButtonStyle.Secondary)
    );

    return safeChannelSend(message.channel, { embeds: [embed], components: [row] });
  }
};
