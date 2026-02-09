const { safeChannelSend } = require('../../Utils/Moderation/reply');
const { EmbedBuilder } = require('discord.js');
const { QuotePrivacy } = require('../../Schemas/Community/communitySchemas');

module.exports = {
  name: 'unblockquotes',
  prefixOverride: '?',

  async execute(message) {
    if (!message.guild) return;
    const userId = message.author.id;
    try {
      await QuotePrivacy.findOneAndUpdate(
        { guildId: message.guild.id, userId },
        { $set: { blocked: false }, $setOnInsert: { guildId: message.guild.id, userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch {}

    const now = new Date();
    const date = now.toLocaleDateString('it-IT');
    const time = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('<a:VC_Unlock:1470011538432852108> Quote sbloccate')
      .setDescription([
        'Le quote dei tuoi messaggi sono state sbloccate con successo!',
        '',
        '**Cosa significa?**',
        'Gli altri utenti possono ora creare quote dei tuoi messaggi.',
        '',
        '**Per bloccare nuovamente**',
        'Usa il comando `?blockquotes` quando vuoi bloccare di nuovo le quote.'
      ].join('\n'))
      .setFooter({ text: `Sbloccate il ${date} • Oggi alle ${time}`, iconURL: message.author.displayAvatarURL() });

    return safeChannelSend(message.channel, { embeds: [embed] });
  }
};

