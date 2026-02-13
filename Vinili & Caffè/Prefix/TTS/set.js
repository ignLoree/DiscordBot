const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { setUserTtsLang } = require('../../Services/TTS/ttsService');
const {
  TTS_LANGUAGE_CODES,
  normalizeTtsLanguageInput
} = require('../../Services/TTS/ttsLanguages');

function parseBooleanState(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (['true', 'on', 'attivo', 'attiva', '1', 'si', 'yes'].includes(value)) return true;
  if (['false', 'off', 'disattivo', 'disattiva', '0', 'no'].includes(value)) return false;
  return null;
}

module.exports = {
  name: 'set',
  subcommands: ['autojoin', 'voice'],

  async execute(message, args = [], client) {
    const sub = String(args[0] || '').trim().toLowerCase();
    client.config.tts = client.config.tts || {};

    if (sub === 'autojoin') {
      const state = parseBooleanState(args[1]);
      if (state == null) {
        await safeMessageReply(message, {
          content: '<:vegax:1443934876440068179> Usa: `+set autojoin true|false`',
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      client.config.tts.autojoin = state;
      const label = state ? 'attivo' : 'disattivato';
      await safeMessageReply(message, {
        content: `<:vegacheckmark:1443666279058772028> Autojoin TTS settato su \`${label}\`.`,
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (sub === 'voice') {
      const input = String(args[1] || '').trim();
      const lingua = normalizeTtsLanguageInput(input);
      if (!lingua) {
        await safeMessageReply(message, {
          content: `<:vegax:1443934876440068179> Usa: \`+set voice <${TTS_LANGUAGE_CODES.join('|')}>\` oppure formato locale (es: \`it-IT\`).`,
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      setUserTtsLang(message.author.id, lingua);
      await safeMessageReply(message, {
        content: `<:vegacheckmark:1443666279058772028> Lingua TTS personale impostata su \`${lingua}\`.`,
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    await safeMessageReply(message, {
      content: [
        '<:vegax:1443934876440068179> Subcomando non valido.',
        'Usa: `+set autojoin true|false` oppure `+set voice <lingua>`.'
      ].join('\n'),
      allowedMentions: { repliedUser: false }
    });
  }
};
