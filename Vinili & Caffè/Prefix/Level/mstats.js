const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { MinigameUser } = require('../../Schemas/Minigames/minigameSchema');
const IDs = require('../../Utils/Config/ids');

const EXP_REWARDS = [
  { exp: 100, roleId: IDs.roles.Initiate },
  { exp: 500, roleId: IDs.roles.Rookie },
  { exp: 1000, roleId: IDs.roles.Scout },
  { exp: 1500, roleId: IDs.roles.Explorer },
  { exp: 2500, roleId: IDs.roles.Tracker },
  { exp: 5000, roleId: IDs.roles.Achivier },
  { exp: 10000, roleId: IDs.roles.Vanguard },
  { exp: 50000, roleId: IDs.roles.Mentor },
  { exp: 100000, roleId: IDs.roles.Strategist },
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
  name: 'mstats',
  
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

    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};

