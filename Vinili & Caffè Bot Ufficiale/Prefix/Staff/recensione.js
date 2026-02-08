const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const ExpUser = require('../../Schemas/Community/expUserSchema');
const { getLevelInfo } = require('../../Services/Community/expService');

const REVIEW_CHANNEL_ID = '1442569123426074736';
const LEVEL_UP_CHANNEL_ID = '1442569138114662490';
const LEVELS_TO_ADD = 5;

const LEVEL_ROLE_MAP = new Map([
  [10, '1442568936423034940'],
  [20, '1442568934510297226'],
  [30, '1442568933591748688'],
  [50, '1442568932136587297'],
  [70, '1442568931326824488'],
  [100, '1442568929930379285']
]);

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
  name: 'recensione',
  aliases: ['review', 'disboardreview'],

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});

    const target = await resolveTargetUser(message, args[0]);
    if (!target) {
      const help = new EmbedBuilder()
        .setColor('Red')
        .setDescription('<:vegax:1443934876440068179> Uso corretto: `+recensione <@utente|id>`');
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
    const targetLevel = currentLevel + LEVELS_TO_ADD;
    const targetExp = getTotalExpForLevel(targetLevel);
    const finalExp = Math.max(currentExp, targetExp);
    const addedExp = Math.max(0, finalExp - currentExp);

    doc.totalExp = finalExp;
    doc.level = getLevelInfo(finalExp).level;
    await doc.save();

    const reviewChannel = message.guild.channels.cache.get(REVIEW_CHANNEL_ID)
      || await message.guild.channels.fetch(REVIEW_CHANNEL_ID).catch(() => null);
    if (reviewChannel) {
      const reviewEmbed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL({ size: 128 }) || undefined })
        .setTitle('Grazie per la recensione su Disboard! <a:VC_StarPink:1330194976440848500>')
        .setDescription([
          `<a:VC_ThankYou:1330186319673950401> Grazie ${target} per aver lasciato una recensione su **Disboard**.`,
          '',
          '<:VC_LevelUp2:1443701876892762243> Ricompensa assegnata: **+5 livelli**'
        ].join('\n'))
        .setThumbnail(target.displayAvatarURL({ size: 256 }))

      await reviewChannel.send({ content: `${target}`, embeds: [reviewEmbed] }).catch(() => {});
    }

    const levelUpChannel = message.guild.channels.cache.get(LEVEL_UP_CHANNEL_ID)
      || await message.guild.channels.fetch(LEVEL_UP_CHANNEL_ID).catch(() => null);
    if (levelUpChannel) {
      const levelUpEmbed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setTitle(`${target.username} leveled up!`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setDescription([
          `<a:VC_PandaClap:1331620157398712330> **Complimenti ${target}!**`,
          `<:VC_LevelUp2:1443701876892762243> Hai appena raggiunto il **livello** \`${doc.level}\``,
          `<:dot:1443660294596329582> Livelli assegnati per recensione: **+${LEVELS_TO_ADD}**`
        ].join('\n'))
        .setFooter({ text: `Azione staff: ${message.author.tag}` });

      await levelUpChannel.send({
        content: `${target} sei salito/a di livello! <a:VC_LevelUp:1469046204582068376>`,
        embeds: [levelUpEmbed]
      }).catch(() => {});

      const reachedPerkLevels = Array.from(LEVEL_ROLE_MAP.keys())
        .filter((level) => level > currentLevel && level <= doc.level)
        .sort((a, b) => a - b);

      for (const level of reachedPerkLevels) {
        const roleId = LEVEL_ROLE_MAP.get(level);
        if (!roleId) continue;
        const perkEmbed = new EmbedBuilder()
          .setColor('#6f4e37')
          .setTitle(`${target.username} leveled up!`)
          .setThumbnail(target.displayAvatarURL({ size: 256 }))
          .setDescription([
            `<a:VC_PandaClap:1331620157398712330> **Complimenti ${target}!**`,
            `<:VC_LevelUp2:1443701876892762243> Hai appena raggiunto il <@&${roleId}>`,
            '<a:VC_HelloKittyGift:1329447876857958471> Controlla <#1442569111119990887> per i nuovi vantaggi!'
          ].join('\n'))
          .setFooter({ text: `Azione staff: ${message.author.tag}` });

        await levelUpChannel.send({
          content: `${target} sei salito/a di livello! <a:VC_LevelUp:1469046204582068376>`,
          embeds: [perkEmbed]
        }).catch(() => {});
      }
    }

    const done = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('<:vegacheckmark:1443666279058772028> Recensione Registrata')
      .setDescription(`Ho assegnato la ricompensa recensione a ${target}.`)
      .addFields(
        { name: 'Livello', value: `\`${currentLevel}\` -> \`${doc.level}\``, inline: true },
        { name: 'EXP Aggiunta', value: `\`+${addedExp}\``, inline: true },
        { name: 'Ricompensa', value: `\`+${LEVELS_TO_ADD} livelli\``, inline: true }
      )
      .setThumbnail(target.displayAvatarURL({ size: 256 }));

    await safeMessageReply(message, {
      embeds: [done],
      allowedMentions: { repliedUser: false, users: [target.id] }
    });
  }
};
