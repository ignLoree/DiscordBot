const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const ReviewReward = require('../../Schemas/Community/reviewRewardSchema');

function parseUserIds(message, args = []) {
  const ids = new Set();
  for (const user of message.mentions?.users?.values?.() || []) {
    ids.add(user.id);
  }
  for (const raw of args) {
    const id = String(raw || '').replace(/[<@!>]/g, '');
    if (/^\d{16,20}$/.test(id)) ids.add(id);
  }
  return Array.from(ids);
}

module.exports = {
  name: 'reviewlock',
  aliases: ['recensionelock', 'lockrecensione'],

  async execute(message, args = []) {
    const guildId = message.guild?.id;
    if (!guildId) return;

    const userIds = parseUserIds(message, args);
    if (!userIds.length) {
      const help = new EmbedBuilder()
        .setColor('Red')
        .setDescription('<:vegax:1443934876440068179> Uso: `+reviewlock <@utente|id> [altri utenti...]`');
      await safeMessageReply(message, { embeds: [help], allowedMentions: { repliedUser: false } });
      return;
    }

    let added = 0;
    let already = 0;
    for (const userId of userIds) {
      const res = await ReviewReward.updateOne(
        { guildId, userId },
        {
          $setOnInsert: {
            guildId,
            userId,
            rewardedBy: message.author.id,
            rewardedAt: new Date()
          }
        },
        { upsert: true }
      ).catch(() => null);

      if (!res) continue;
      if (res.upsertedCount > 0) added += 1;
      else already += 1;
    }

    const done = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('<:vegacheckmark:1443666279058772028> Lock Recensioni Aggiornato')
      .setDescription([
        `Utenti processati: **${userIds.length}**`,
        `Nuovi lock creati: **${added}**`,
        `Già presenti: **${already}**`
      ].join('\n'));

    await safeMessageReply(message, { embeds: [done], allowedMentions: { repliedUser: false } });
  }
};

