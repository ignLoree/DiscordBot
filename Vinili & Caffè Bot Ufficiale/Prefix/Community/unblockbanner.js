const { safeChannelSend } = require('../../Utils/Moderation/reply');
const { EmbedBuilder } = require('discord.js');
const { BannerPrivacy } = require('../../Schemas/Community/privacySchemas');

module.exports = {
  name: 'unblockbanner',
  aliases: ['unblockbn'],
  prefixOverride: '?',

  async execute(message) {
    if (!message.guild) return;
    const userId = message.author.id;
    try {
      await BannerPrivacy.findOneAndUpdate(
        { guildId: message.guild.id, userId },
        { $set: { blocked: false }, $setOnInsert: { guildId: message.guild.id, userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch {}

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('Comando sbloccato')
      .setDescription('Hai sbloccato con successo la visualizzazione del tuo banner.');

    return safeChannelSend(message.channel, { embeds: [embed] });
  }
};
