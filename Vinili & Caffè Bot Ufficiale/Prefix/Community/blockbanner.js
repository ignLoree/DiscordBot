const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BannerPrivacy = require('../../Schemas/Community/bannerPrivacySchema');

module.exports = {
  name: 'blockbanner',
  aliases: ['blockbn'],
  prefixOverride: '?',

  async execute(message) {
    if (!message.guild) return;
    const userId = message.author.id;
    try {
      await BannerPrivacy.findOneAndUpdate(
        { guildId: message.guild.id, userId },
        { $set: { blocked: true }, $setOnInsert: { guildId: message.guild.id, userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch {}

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('Banner bloccato')
      .setDescription([
        'Gli altri membri non potranno più visualizzare il tuo banner.',
        '',
        '?? Utilizza il pulsante qui sotto o il comando `?unblockbanner` se vuoi riattivare la visualizzazione.'
      ].join('\n'));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`banner_unblock:${userId}`)
        .setLabel('Sblocca')
        .setEmoji('??')
        .setStyle(ButtonStyle.Secondary)
    );

    return safeChannelSend(message.channel, { embeds: [embed], components: [row] });
  }
};
