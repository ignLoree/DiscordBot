const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { MinigameUser } = require('../../Schemas/Minigames/minigameSchema');

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

async function resolveTargetUser(message, args = []) {
  const mention = message.mentions?.users?.first();
  if (mention) return mention;
  const raw = Array.isArray(args) && args[0] ? String(args[0]) : '';
  const id = raw.replace(/[<@!>]/g, '');
  if (/^\d{16,20}$/.test(id)) {
    const user = await message.client.users.fetch(id).catch(() => null);
    if (user) return user;
  }
  return message.author;
}

module.exports = {
  name: 'minigamestats',
  aliases: ['mstats'],

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const targetUser = await resolveTargetUser(message, args);

    let totalExp = 0;
    try {
      const doc = await MinigameUser.findOne({ guildId: message.guild.id, userId: targetUser.id });
      totalExp = Number(doc?.totalExp || 0);
    } catch {}

    const unlocked = getUnlockedRewards(totalExp);
    const unlockedText = unlocked.length
      ? unlocked.map((reward) => `<a:VC_Arrow:1448672967721615452> <@&${reward.roleId}>`).join('\n')
      : 'Nessun ruolo ancora sbloccato';

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL() })
      .setTitle(`Le statistiche nei Minigames di ${targetUser.username} <a:VC_Flowers:1468687836055212174>`)
      .setDescription([
        `<a:VC_Arrow:1448672967721615452> Hai un totale di \`${totalExp}\` punti (e exp guadagnati) <a:VC_FlowerPink:1468688049725636903>`,
        '',
        '🎲 .ᐟRuoli sbloccati:',
        unlockedText,
      ].join('\n'))
      .setFooter({ text: `Comando eseguito da: ${message.author.username}`, iconURL: message.author.displayAvatarURL() });

    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
