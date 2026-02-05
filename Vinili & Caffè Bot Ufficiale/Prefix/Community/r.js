const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/message');
const { getUserRanks, getGlobalMultiplier } = require('../../Services/Community/expService');

module.exports = {
  name: 'r',
  prefixOverride: "+",

  async execute(message) {
    await message.channel.sendTyping();

    const { stats, weeklyRank, allTimeRank } = await getUserRanks(message.guild.id, message.author.id);
    const multiplier = await getGlobalMultiplier(message.guild.id);
    const weeklyText = stats.level === 0 ? 'Fuori dalla classifica' : `#${weeklyRank}`;
    const allTimeText = stats.level === 0 ? 'Fuori dalla classifica' : `#${allTimeRank}`;

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle(`Le statistiche di ${message.author.tag} .ᐟ ✧`)
      .setThumbnail(message.author.displayAvatarURL())
      .setDescription([
        `<:VC_EXP:1468714279673925883> Hai accumulato un totale di **${stats.totalExp} EXP**.`,
        `<a:VC_Rocket:1468544312475123753> **Moltiplicatore:** ${multiplier}x`,
      ].join('\n'))
      .addFields(
        { name: '<a:VC_StarPink:1330194976440848500> **Livello:**', value: `**${stats.level}**`, inline: true },
        { name: '<a:VC_StarBlue:1330194918043418674> **Weekly Top:**', value: `${weeklyText}`, inline: true },
        { name: '<a:VC_StarPurple:1330195026688344156> **General Top:**', value: `${allTimeText}`, inline: true }
      )
      .setFooter({ text: `⭐ 𓂃★  Ti mancano ${stats.remainingToNext} exp per il prossimo livello` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('r_multiplier_info')
        .setLabel('Info Moltiplicatori')
        .setEmoji('<a:VC_HeartsPink:1468685897389052008>')
        .setStyle(ButtonStyle.Secondary)
    );

    await safeMessageReply(message, { embeds: [embed], components: [row], allowedMentions: { repliedUser: false } });
  }
};


