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

async function resolveTargetUser(message, raw) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  const id = String(raw || '').replace(/[<@!>]/g, '');
  if (!/^\d{16,20}$/.test(id)) return message.author;
  return message.client.users.fetch(id).catch(() => message.author);
}

module.exports = {
  name: 'rewards',
  aliases: ['levelrewards'],

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    const target = await resolveTargetUser(message, args[0]);
    const stats = await getUserExpStats(message.guild.id, target.id);
    const member = message.guild.members.cache.get(target.id) || await message.guild.members.fetch(target.id).catch(() => null);

    const lines = LEVEL_REWARDS.map((reward) => {
      const unlockedByLevel = stats.level >= reward.level;
      const hasRole = member?.roles?.cache?.has(reward.roleId);
      const status = unlockedByLevel ? (hasRole ? 'Ottenuto' : 'Sbloccato (ruolo mancante)') : 'Non ottenuto';
      const expNeeded = getTotalExpForLevel(reward.level);
      return `- Livello **${reward.level}** -> <@&${reward.roleId}> | **${status}** | soglia: \`${expNeeded} exp\``;
    });

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle(`Reward livelli di ${target.username}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Livello attuale: ${stats.level} | EXP totale: ${stats.totalExp}` });

    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
