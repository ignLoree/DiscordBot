const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { getUserExpStats, getTotalExpForLevel } = require('../../Services/Community/expService');
const IDs = require('../../Utils/Config/ids');

const LEVEL_REWARDS = [
  { level: 10, roleId: IDs.roles.level10 },
  { level: 20, roleId: IDs.roles.level20 },
  { level: 30, roleId: IDs.roles.level30 },
  { level: 50, roleId: IDs.roles.level50 },
  { level: 70, roleId: IDs.roles.level70 },
  { level: 100, roleId: IDs.roles.level100 }
];

module.exports = {
  name: 'nextreward',
  aliases: ['nreward'],

  async execute(message) {
    await message.channel.sendTyping().catch(() => {});
    const stats = await getUserExpStats(message.guild.id, message.author.id);
    const next = LEVEL_REWARDS.find((reward) => reward.level > stats.level) || null;

    if (!next) {
      const doneEmbed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setDescription('<:vegacheckmark:1443666279058772028> Hai già sbloccato tutti i reward livello disponibili.');
      await safeMessageReply(message, { embeds: [doneEmbed], allowedMentions: { repliedUser: false } });
      return;
    }

    const targetExp = getTotalExpForLevel(next.level);
    const remaining = Math.max(0, targetExp - stats.totalExp);
    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('Prossimo reward livello')
      .setDescription([
        `- Reward: <@&${next.roleId}>`,
        `- Livello richiesto: **${next.level}**`,
        `- Mancano: **${remaining} exp**`,
        `- Soglia totale: **${targetExp} exp**`
      ].join('\n'));

    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
