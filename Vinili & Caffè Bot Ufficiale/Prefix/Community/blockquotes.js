const { safeChannelSend } = require('../../Utils/Moderation/reply');
const { EmbedBuilder } = require('discord.js');
const { QuotePrivacy } = require('../../Schemas/Community/privacySchemas');

module.exports = {
  name: 'blockquotes',
  prefixOverride: '?',

  async execute(message) {
    if (!message.guild) return;
    const userId = message.author.id;
    try {
      await QuotePrivacy.findOneAndUpdate(
        { guildId: message.guild.id, userId },
        { $set: { blocked: true }, $setOnInsert: { guildId: message.guild.id, userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch {}

    const now = new Date();
    const date = now.toLocaleDateString('it-IT');
    const time = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('<a:VC_Unlock:1470011538432852108> Quote bloccate')
      .setDescription([
        'Le quote dei tuoi messaggi sono state bloccate con successo!',
        '',
        '**Cosa significa?**',
        'Gli altri utenti non potranno più creare quote dei tuoi messaggi.',
        '',
        '**Per sbloccare**',
        'Usa il comando `?unblockquotes` quando vuoi riattivare le quote.'
      ].join('\n'))
      .setFooter({ text: `Bloccate il ${date} " Oggi alle ${time}`, iconURL: message.author.displayAvatarURL() });

    return safeChannelSend(message.channel, { embeds: [embed] });
  }
};
