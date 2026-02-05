const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/message');
const MinigameUser = require('../../Schemas/Minigames/minigameUserSchema');

const EXP_REWARDS = [
  { exp: 100, roleId: '1468675561948971058' },
  { exp: 500, roleId: '1468675567015428239' },
  { exp: 1000, roleId: '1468675570865803407' },
  { exp: 1500, roleId: '1468675576326918302' },
  { exp: 2500, roleId: '1468675580609429536' },
  { exp: 5000, roleId: '1468675584094769427' },
  { exp: 10000, roleId: '1468675587747877028' },
  { exp: 50000, roleId: '1468675590747062355' },
  { exp: 100000, roleId: '1468675595058811075' },
];

function getUnlockedRewards(totalExp) {
  const expValue = Number(totalExp || 0);
  return EXP_REWARDS.filter((reward) => expValue >= reward.exp);
}

module.exports = {
  name: 'mstats',
  prefixOverride: "+",
  prefixOverride: "+",

  async execute(message) {
    await message.channel.sendTyping();

    let totalExp = 0;
    try {
      const doc = await MinigameUser.findOne({ guildId: message.guild.id, userId: message.author.id });
      totalExp = Number(doc?.totalExp || 0);
    } catch {}

    const unlocked = getUnlockedRewards(totalExp);
    const unlockedText = unlocked.length
      ? unlocked.map((reward) => `<@&${reward.roleId}>`).join('\n')
      : 'Nessun ruolo ancora sbloccato';

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
      .setTitle('Le tue statistiche nei Minigames <a:VC_Flowers:1468687836055212174>')
      .setDescription([
        `<a:VC_Arrow:1448672967721615452> Hai un totale di \`${totalExp}\` punti (e exp guadagnati) <a:VC_FlowerPink:1468688049725636903>`,
        '',
        '🎲 .ᐟRuoli sbloccati:',
        `<a:VC_Arrow:1448672967721615452> ${unlockedText}`,
      ].join('\n'))
      .setFooter({ text: `Comando eseguito da: ${message.author.username}`, iconURL: message.author.displayAvatarURL() });

    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
