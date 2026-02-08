const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { setGlobalMultiplier } = require('../../Services/Community/expService');

module.exports = {
  name: 'gmulti',
  adminOnly: true,

  async execute(message, args) {
    const raw = args?.[0];
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value <= 0) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setDescription('<:vegax:1443934876440068179> Uso corretto: `+gmulti <numero>`');
      await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
      return;
    }

    const stored = await setGlobalMultiplier(message.guild.id, value);
    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setDescription(`<:vegacheckmark:1443666279058772028> Moltiplicatore globale impostato a **${stored}x**.`);
    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
