const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const AutoResponder = require('../../Schemas/Community/autoResponderSchema');

const MAX_RULES = 50;
const MAX_REACTIONS = 6;
const MAX_TRIGGER_LENGTH = 120;
const MAX_RESPONSE_LENGTH = 1600;

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
  return Array.from(new Set(out)).slice(0, MAX_REACTIONS);
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

function splitRulePayload(raw) {
  const parts = String(raw || '').split('|').map((part) => part.trim());
  const trigger = parts[0] || '';
  const response = parts[1] || '';
  const reactionText = parts[2] || '';
  return { trigger, response, reactionText };
}

module.exports = {
  name: 'autoresponder',
  aliases: ['ar', 'autorespond'],

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    const guildId = message.guild?.id;
    if (!guildId) return;

    const sub = String(args[0] || '').toLowerCase();
    const rest = args.slice(1).join(' ').trim();

    if (!sub || sub === 'help') {
      const embed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setTitle('AutoResponder')
        .setDescription([
          '`+autoresponder list`',
          '`+autoresponder add trigger | risposta | 😀 <:emoji:123...>`',
          '`+autoresponder remove trigger`',
          '`+autoresponder clear`',
          '',
          'Note:',
          `- Massimo ${MAX_RULES} regole`,
          `- Massimo ${MAX_REACTIONS} reaction per regola`,
          '- Per trigger frase usa il separatore `|` come negli esempi'
        ].join('\n'));
      await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
      return;
    }

    if (sub === 'list' || sub === 'show') {
      const docs = await AutoResponder.find({ guildId, enabled: true }).sort({ triggerLower: 1 }).lean().catch(() => []);
      if (!Array.isArray(docs) || !docs.length) {
        await safeMessageReply(message, {
          embeds: [new EmbedBuilder().setColor('#6f4e37').setDescription('<:vegax:1443934876440068179> Nessun autoresponder configurato.')],
          allowedMentions: { repliedUser: false }
        });
        return;
      }
      const lines = docs.slice(0, 20).map((doc, idx) => {
        const trigger = String(doc?.trigger || '').trim() || '-';
        const response = String(doc?.response || '').trim();
        const reacts = Array.isArray(doc?.reactions) ? doc.reactions : [];
        const reactionLabel = reacts.length ? reacts.map(toDisplay).join(' ') : 'nessuna';
        const responseLabel = response ? `risposta: ${response.slice(0, 80)}${response.length > 80 ? '...' : ''}` : 'risposta: nessuna';
        return `\`${idx + 1}.\` **${trigger}** -> ${responseLabel} | reaction: ${reactionLabel}`;
      });
      const hiddenCount = docs.length - lines.length;
      if (hiddenCount > 0) lines.push(`...e altre ${hiddenCount} regole`);
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setColor('#6f4e37').setTitle('AutoResponder attivi').setDescription(lines.join('\n'))],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (sub === 'clear' || sub === 'reset') {
      await AutoResponder.deleteMany({ guildId }).catch(() => {});
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setColor('#6f4e37').setDescription('<:vegacheckmark:1443666279058772028> Tutti gli autoresponder sono stati rimossi.')],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (sub === 'remove' || sub === 'del' || sub === 'rm') {
      const trigger = String(rest || '').trim();
      if (!trigger) {
        await safeMessageReply(message, {
          content: '<:vegax:1443934876440068179> Specifica il trigger da rimuovere.',
          allowedMentions: { repliedUser: false }
        });
        return;
      }
      const triggerLower = trigger.toLowerCase();
      const removed = await AutoResponder.findOneAndDelete({ guildId, triggerLower }).lean().catch(() => null);
      if (!removed) {
        await safeMessageReply(message, {
          content: '<:vegax:1443934876440068179> Trigger non trovato.',
          allowedMentions: { repliedUser: false }
        });
        return;
      }
      await safeMessageReply(message, {
        embeds: [new EmbedBuilder().setColor('#6f4e37').setDescription(`<:vegacheckmark:1443666279058772028> Rimosso trigger: **${removed.trigger}**`)],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (sub === 'add' || sub === 'set' || sub === 'edit') {
      const { trigger, response, reactionText } = splitRulePayload(rest);
      const normalizedTrigger = String(trigger || '').trim();
      const triggerLower = normalizedTrigger.toLowerCase();
      const normalizedResponse = String(response || '').trim();
      const reactions = parseReactionTokens(reactionText);

      if (!normalizedTrigger) {
        await safeMessageReply(message, {
          content: '<:vegax:1443934876440068179> Trigger mancante. Usa: `+autoresponder add trigger | risposta | reaction`',
          allowedMentions: { repliedUser: false }
        });
        return;
      }
      if (normalizedTrigger.length > MAX_TRIGGER_LENGTH) {
        await safeMessageReply(message, {
          content: `<:vegax:1443934876440068179> Trigger troppo lungo (max ${MAX_TRIGGER_LENGTH} caratteri).`,
          allowedMentions: { repliedUser: false }
        });
        return;
      }
      if (normalizedResponse.length > MAX_RESPONSE_LENGTH) {
        await safeMessageReply(message, {
          content: `<:vegax:1443934876440068179> Risposta troppo lunga (max ${MAX_RESPONSE_LENGTH} caratteri).`,
          allowedMentions: { repliedUser: false }
        });
        return;
      }
      if (!normalizedResponse && !reactions.length) {
        await safeMessageReply(message, {
          content: '<:vegax:1443934876440068179> Devi impostare almeno una risposta o una reaction.',
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const currentCount = await AutoResponder.countDocuments({ guildId }).catch(() => 0);
      const existing = await AutoResponder.findOne({ guildId, triggerLower }).lean().catch(() => null);
      if (!existing && currentCount >= MAX_RULES) {
        await safeMessageReply(message, {
          content: `<:vegax:1443934876440068179> Hai raggiunto il limite massimo di ${MAX_RULES} regole.`,
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const nextDoc = await AutoResponder.findOneAndUpdate(
        { guildId, triggerLower },
        {
          $set: {
            guildId,
            trigger: normalizedTrigger,
            triggerLower,
            response: normalizedResponse,
            reactions,
            enabled: true,
            updatedBy: message.author.id
          },
          $setOnInsert: {
            createdBy: message.author.id
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean().catch(() => null);

      if (!nextDoc) {
        await safeMessageReply(message, {
          content: '<:vegax:1443934876440068179> Errore durante il salvataggio dell\'autoresponder.',
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      const resultEmbed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setTitle('AutoResponder aggiornato')
        .addFields(
          { name: 'Trigger', value: `\`${nextDoc.trigger}\`` },
          { name: 'Risposta', value: nextDoc.response ? nextDoc.response.slice(0, 1024) : 'Nessuna' },
          { name: 'Reaction', value: Array.isArray(nextDoc.reactions) && nextDoc.reactions.length ? nextDoc.reactions.map(toDisplay).join(' ') : 'Nessuna' }
        );
      await safeMessageReply(message, { embeds: [resultEmbed], allowedMentions: { repliedUser: false } });
      return;
    }

    await safeMessageReply(message, {
      content: '<:vegax:1443934876440068179> Sottocomando non valido. Usa `+autoresponder help`.',
      allowedMentions: { repliedUser: false }
    });
  }
};
