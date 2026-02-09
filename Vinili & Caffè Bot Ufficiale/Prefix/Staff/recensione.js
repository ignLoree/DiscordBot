const { EmbedBuilder } = require('discord.js');
const IDs = require('../../Utils/Config/ids');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { ExpUser } = require('../../Schemas/Community/communitySchemas');
const { ReviewReward } = require('../../Schemas/Community/communitySchemas');
const { getLevelInfo, addExpWithLevel } = require('../../Services/Community/expService');

const REVIEW_CHANNEL_ID = IDs.channels.thanks;
const LEVELS_TO_ADD = 5;

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

    const alreadyRewarded = await ReviewReward.findOne({ guildId, userId: target.id }).lean().catch(() => null);
    if (alreadyRewarded) {
      const blocked = new EmbedBuilder()
        .setColor('Red')
        .setTitle('Recensione già riscattata')
        .setDescription('<:vegax:1443934876440068179> Su questo utente la ricompensa recensione è già stata assegnata.');
      await safeMessageReply(message, { embeds: [blocked], allowedMentions: { repliedUser: false } });
      return;
    }

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

    if (addedExp <= 0) {
      const nothing = new EmbedBuilder()
        .setColor('Red')
        .setDescription('<:vegax:1443934876440068179> Non posso assegnare livelli: il target ha già una soglia EXP superiore.');
      await safeMessageReply(message, { embeds: [nothing], allowedMentions: { repliedUser: false } });
      return;
    }

    const levelResult = await addExpWithLevel(message.guild, target.id, addedExp, false);
    const finalLevel = Number(levelResult?.levelInfo?.level ?? getLevelInfo(finalExp).level);
    await ReviewReward.create({
      guildId,
      userId: target.id,
      rewardedBy: message.author.id,
      rewardedAt: new Date()
    }).catch(() => {});

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

    const done = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('<:vegacheckmark:1443666279058772028> Recensione Registrata')
      .setDescription(`Ho assegnato la ricompensa recensione a ${target}.`)
      .addFields(
        { name: 'Livello', value: `\`${currentLevel}\` -> \`${finalLevel}\``, inline: true },
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



