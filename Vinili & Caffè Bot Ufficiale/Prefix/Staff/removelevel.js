const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { ExpUser } = require('../../Schemas/Community/communitySchemas');
const { getLevelInfo } = require('../../Services/Community/expService');

function roundToNearest50(value) {
  return Math.round(value / 50) * 50;
}

function getLevelStep(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
  let step = 90 + Math.floor(safeLevel * 12) + (safeLevel % 4) * 15;

  if (safeLevel >= 10) {
    const over10 = safeLevel - 9;
    step += 120 + (over10 * 28) + Math.floor((over10 * over10) * 1.3);
  }
  if (safeLevel >= 30) {
    step += 120 + ((safeLevel - 30) * 18);
  }
  if (safeLevel >= 50) {
    step += 220 + ((safeLevel - 50) * 25);
  }

  return Math.max(110, step);
}

function getTotalExpForLevel(level) {
  const targetLevel = Math.max(0, Math.floor(Number(level || 0)));
  if (targetLevel <= 0) return 0;

  let threshold = 100;
  for (let l = 1; l < targetLevel; l += 1) {
    threshold = roundToNearest50(threshold + Math.max(110, getLevelStep(l)));
  }
  return threshold;
}

async function resolveTargetUser(message, raw) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  const id = String(raw || '').replace(/[<@!>]/g, '');
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.client.users.fetch(id).catch(() => null);
}

module.exports = {
  name: 'removelevel',
  aliases: ['removelvl', 'levelremove', 'dellvl'],

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});

    const target = await resolveTargetUser(message, args[0]);
    const amount = Number(args[1]);

    if (!target || !Number.isInteger(amount) || amount <= 0) {
      const help = new EmbedBuilder()
        .setColor('Red')
        .setDescription('<:vegax:1443934876440068179> Uso corretto: `+removelevel <@utente|id> <livelli>`');
      await safeMessageReply(message, { embeds: [help], allowedMentions: { repliedUser: false } });
      return;
    }

    const guildId = message.guild?.id;
    if (!guildId) return;

    let doc = await ExpUser.findOne({ guildId, userId: target.id });
    if (!doc) {
      doc = new ExpUser({ guildId, userId: target.id });
    }

    const currentExp = Number(doc.totalExp || 0);
    const currentLevel = getLevelInfo(currentExp).level;
    const targetLevel = Math.max(0, currentLevel - amount);
    const finalExp = getTotalExpForLevel(targetLevel);
    const removedExp = Math.max(0, currentExp - finalExp);

    doc.totalExp = finalExp;
    doc.level = getLevelInfo(finalExp).level;
    await doc.save();

    const done = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('<:vegacheckmark:1443666279058772028> Livelli Aggiornati')
      .setDescription(`Ho rimosso **${Math.min(amount, currentLevel)} livelli** a ${target}.`)
      .addFields(
        { name: 'Livello', value: `\`${currentLevel}\` -> \`${doc.level}\``, inline: true },
        { name: 'EXP Rimossa', value: `\`-${removedExp}\``, inline: true },
        { name: 'EXP Totale', value: `\`${finalExp}\``, inline: true }
      )
      .setThumbnail(target.displayAvatarURL({ size: 256 }));

    await safeMessageReply(message, {
      embeds: [done],
      allowedMentions: { repliedUser: false, users: [target.id] }
    });
  }
};



