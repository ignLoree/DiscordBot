const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require('discord.js');
const AvatarPrivacy = require('../../Schemas/Community/avatarPrivacySchema');

module.exports = {
  name: 'unblockavatar',
  aliases: ['unblockav', 'sblockav'],
  prefixOverride: '?',

  async execute(message) {
    if (!message.guild) return;
    const userId = message.author.id;
    try {
      await AvatarPrivacy.findOneAndUpdate(
        { guildId: message.guild.id, userId },
        { $set: { blocked: false }, $setOnInsert: { guildId: message.guild.id, userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch {}

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('Comando sbloccato')
      .setDescription('Hai sbloccato con successo la visualizzazione del tuo avatar.');

    return safeChannelSend(message.channel, { embeds: [embed] });
  }
};
