const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/message');
const renderShipCanvas = require('../../Utils/Render/shipCanvas');

function extractId(raw) {
  if (!raw) return null;
  const clean = String(raw).replace(/[<@!>]/g, '');
  return /^\d{16,20}$/.test(clean) ? clean : null;
}

async function resolveUser(guild, token) {
  const id = extractId(token);
  if (!id) return null;
  const member = guild.members.cache.get(id) || await guild.members.fetch(id).catch(() => null);
  return member?.user || null;
}

function trimName(name) {
  const v = String(name || '').trim();
  return v.length > 16 ? `${v.slice(0, 16)}...` : v;
}

function randomPercent() {
  return Math.floor(Math.random() * 100) + 1;
}

module.exports = {
  name: 'ship',

  async execute(message, args) {
    await message.channel.sendTyping();

    const mentioned = message.mentions.users;
    let left = message.author;
    let right = null;

    if (mentioned.size >= 2) {
      const users = Array.from(mentioned.values());
      left = users[0];
      right = users[1];
    } else if (mentioned.size === 1) {
      right = mentioned.first();
    } else if (Array.isArray(args) && args.length > 0) {
      right = await resolveUser(message.guild, args[0]);
    }

    if (!right) {
      const warn = new EmbedBuilder()
        .setColor('Red')
        .setDescription('<:vegax:1443934876440068179> Devi indicare almeno un utente. Esempio: `+ship @utente`');
      await safeMessageReply(message, { embeds: [warn], allowedMentions: { repliedUser: false } });
      return;
    }

    if (left.id === right.id) {
      const warn = new EmbedBuilder()
        .setColor('Red')
        .setDescription('<:vegax:1443934876440068179> Scegli due utenti diversi.');
      await safeMessageReply(message, { embeds: [warn], allowedMentions: { repliedUser: false } });
      return;
    }

    try {
      const percent = randomPercent();
      const image = await renderShipCanvas({
        leftAvatarUrl: left.displayAvatarURL({ extension: 'png', size: 512 }),
        rightAvatarUrl: right.displayAvatarURL({ extension: 'png', size: 512 }),
        leftName: trimName(left.username),
        rightName: trimName(right.username),
        leftId: left.id,
        rightId: right.id,
        percent
      });

      const file = new AttachmentBuilder(image, { name: 'ship.png' });
      await safeMessageReply(message, {
        content: `${left} e ${right}`,
        files: [file],
        allowedMentions: { repliedUser: false, users: [left.id, right.id] }
      });
    } catch (error) {
      global.logger.error('[SHIP COMMAND] Render error:', error);
      const fail = new EmbedBuilder()
        .setColor('Red')
        .setDescription('<:vegax:1443934876440068179> Non sono riuscito a generare la ship image.');
      await safeMessageReply(message, { embeds: [fail], allowedMentions: { repliedUser: false } });
    }
  }
};

