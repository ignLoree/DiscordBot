const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const MentionReaction = require('../../Schemas/Community/mentionReactionSchema');

const MAX_REACTIONS = 6;

function parseReactionTokens(input) {
  const text = String(input || '').trim();
  if (!text) return [];
  const out = [];
  const customRegex = /<a?:[a-zA-Z0-9_]{2,}:(\d{16,20})>/g;
  let match;
  while ((match = customRegex.exec(text)) !== null) {
    out.push(`custom:${match[1]}`);
  }
  const cleaned = text.replace(customRegex, ' ');
  for (const part of cleaned.split(/\s+/).filter(Boolean)) {
    if (/^\d{16,20}$/.test(part)) out.push(`custom:${part}`);
    else out.push(`unicode:${part}`);
  }
  return Array.from(new Set(out));
}

function toDisplay(token) {
  if (String(token).startsWith('custom:')) {
    const id = token.slice('custom:'.length);
    return `<:emoji:${id}>`;
  }
  if (String(token).startsWith('unicode:')) {
    return token.slice('unicode:'.length);
  }
  return token;
}

module.exports = {
  name: 'reaction',
  aliases: ['myreaction', 'autoreaction'],

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    const guildId = message.guild?.id;
    const userId = message.author.id;
    if (!guildId) return;

    const sub = String(args[0] || '').toLowerCase();
    const rest = args.slice(1).join(' ');
    const doc = await MentionReaction.findOne({ guildId, userId }).catch(() => null);
    const current = Array.isArray(doc?.reactions) ? doc.reactions : [];

    if (!sub || sub === 'show') {
      const embed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setTitle('Reaction menzioni')
        .setDescription(current.length
          ? `Le tue reaction attive: ${current.map(toDisplay).join(' ')}`
          : 'Non hai reaction configurate.')
        .setFooter({ text: 'Usa: +reaction set/add/remove/clear' });
      await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
      return;
    }

    if (sub === 'clear' || sub === 'off' || sub === 'reset') {
      await MentionReaction.deleteOne({ guildId, userId }).catch(() => {});
      const embed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setDescription('<:vegacheckmark:1443666279058772028> Reaction automatiche disattivate.');
      await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
      return;
    }

    if (!['set', 'add', 'remove', 'del', 'rm'].includes(sub)) {
      const help = new EmbedBuilder()
        .setColor('Red')
        .setDescription([
          '<:vegax:1443934876440068179> Uso corretto:',
          '`+reaction show`',
          '`+reaction set 😀 <:emoji:123...>`',
          '`+reaction add 😀`',
          '`+reaction remove 😀`',
          '`+reaction clear`'
        ].join('\n'));
      await safeMessageReply(message, { embeds: [help], allowedMentions: { repliedUser: false } });
      return;
    }

    const tokens = parseReactionTokens(rest);
    if (!tokens.length) {
      await safeMessageReply(message, {
        content: '<:vegax:1443934876440068179> Devi indicare almeno una reaction.',
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    let next = [...current];
    if (sub === 'set') {
      next = tokens.slice(0, MAX_REACTIONS);
    } else if (sub === 'add') {
      next = Array.from(new Set([...current, ...tokens])).slice(0, MAX_REACTIONS);
    } else {
      const removeSet = new Set(tokens);
      next = current.filter((token) => !removeSet.has(token));
    }

    if (!next.length) {
      await MentionReaction.deleteOne({ guildId, userId }).catch(() => {});
    } else {
      await MentionReaction.findOneAndUpdate(
        { guildId, userId },
        { $set: { reactions: next } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).catch(() => {});
    }

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle('Reaction menzioni aggiornate')
      .setDescription(next.length
        ? `Nuove reaction: ${next.map(toDisplay).join(' ')}`
        : 'Nessuna reaction attiva.')
      .setFooter({ text: `Massimo ${MAX_REACTIONS} reaction.` });
    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
