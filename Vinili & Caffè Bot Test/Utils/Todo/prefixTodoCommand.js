/**
 * Comando +to-do / +todo solo nella guild test. Canale to-do fisso.
 * +to-do "task" "online|inattivo|pausa|offline" → aggiunge
 * +to-do "task" fatto → rimuove
 * +to-do "task" test → imposta online + **[TEST]**
 */
const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../Moderation/reply');
const IDs = require('../Config/ids');
const TEST_GUILD_ID = IDs.guilds?.test || '1462458562507964584';
const {
  addItem,
  removeItem,
  setItemTest,
  setItemStatus,
  refreshTodoMessage,
  normalizeStatus,
  STATUS_ORDER
} = require('./todoListService');

function parseTodoArgs(rest) {
  const raw = String(rest || '').trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower.endsWith(' fatto')) {
    return { action: 'fatto', task: raw.slice(0, -6).trim() };
  }
  if (lower.endsWith(' test')) {
    return { action: 'test', task: raw.slice(0, -5).trim() };
  }

  if (lower.startsWith('modify ')) {
    const remainder = raw.slice(7).trim();
    const twoQuoted = remainder.match(/^"([^"]*)"\s*"([^"]*)"\s*$/);
    if (twoQuoted) {
      const task = twoQuoted[1].trim();
      const status = normalizeStatus(twoQuoted[2]);
      if (status) return { action: 'modify', task, status };
    }
    const oneQuotedThenWord = remainder.match(/^"([^"]*)"\s+(\S+)\s*$/);
    if (oneQuotedThenWord) {
      const task = oneQuotedThenWord[1].trim();
      const status = normalizeStatus(oneQuotedThenWord[2]);
      if (status) return { action: 'modify', task, status };
    }
    const parts = remainder.split(/\s+/);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].toLowerCase();
      if (STATUS_ORDER.includes(last)) {
        const task = parts.slice(0, -1).join(' ').trim();
        if (task) return { action: 'modify', task, status: last };
      }
    }
    return null;
  }

  const twoQuoted = raw.match(/^"([^"]*)"\s*"([^"]*)"\s*$/);
  if (twoQuoted) {
    const task = twoQuoted[1].trim();
    const status = normalizeStatus(twoQuoted[2]);
    if (status) return { action: 'add', task, status };
  }

  const oneQuotedThenWord = raw.match(/^"([^"]*)"\s+(\S+)\s*$/);
  if (oneQuotedThenWord) {
    const task = oneQuotedThenWord[1].trim();
    const status = normalizeStatus(oneQuotedThenWord[2]);
    if (status) return { action: 'add', task, status };
  }

  const parts = raw.split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].toLowerCase();
    if (STATUS_ORDER.includes(last)) {
      const task = parts.slice(0, -1).join(' ').trim();
      if (task) return { action: 'add', task, status: last };
    }
  }

  return null;
}

function isTodoCommand(args) {
  const first = (args[0] || '').toLowerCase();
  return first === 'to-do' || first === 'todo';
}

async function runTodoCommand(message, args, client) {
  if (!message?.guild || !message.member) return false;
  if (!isTodoCommand(args)) return false;
  if (message.guild.id !== TEST_GUILD_ID) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription('<:vegax:1472992044140990526> I comandi `+to-do` / `+todo` sono utilizzabili solo nel **server test**.')
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  const rest = args.slice(1).join(' ');
  const parsed = parseTodoArgs(rest);

  if (!parsed) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription(
            '**Uso:**\n' +
            '`+to-do "cosa fare" "online"` | `"inattivo"` | `"pausa"` | `"offline"`\n' +
            '`+to-do modify "cosa fare" "nuovo stato"` — modifica lo stato\n' +
            '`+to-do "cosa fare" fatto` — rimuove la voce\n' +
            '`+to-do "cosa fare" test` — segna in test (online + **[TEST]**)'
          )
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  if (parsed.action === 'add') {
    const result = addItem(parsed.task, parsed.status);
    if (!result.ok) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription(
              result.error === 'status_invalid'
                ? 'Stato non valido. Usa: `online`, `inattivo`, `pausa`, `offline`.'
                : 'Inserisci un testo per la voce.'
            )
          ],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    await refreshTodoMessage(client);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('#6f4e37')
          .setDescription(`<:vegacheckmark:1443666279058772028> Aggiunto: **${parsed.task}** (${parsed.status})`)
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  if (parsed.action === 'fatto') {
    const result = removeItem(parsed.task);
    if (!result.ok) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription(result.error === 'not_found' ? 'Nessuna voce trovata con questo testo.' : 'Inserisci il testo della voce da rimuovere.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    await refreshTodoMessage(client);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('#6f4e37')
          .setDescription(`<:vegacheckmark:1443666279058772028> Voce rimossa: **${parsed.task}**`)
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  if (parsed.action === 'modify') {
    const result = setItemStatus(parsed.task, parsed.status);
    if (!result.ok) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription(
              result.error === 'status_invalid'
                ? 'Stato non valido. Usa: `online`, `inattivo`, `pausa`, `offline`.'
                : result.error === 'not_found'
                  ? 'Nessuna voce trovata con questo testo.'
                  : 'Inserisci il testo della voce e il nuovo stato.'
            )
        ],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    await refreshTodoMessage(client);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('#6f4e37')
          .setDescription(`<:vegacheckmark:1443666279058772028> Stato aggiornato: **${parsed.task}** → **${parsed.status}**`)
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  if (parsed.action === 'test') {
    const result = setItemTest(parsed.task, true);
    if (!result.ok) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription(result.error === 'not_found' ? 'Nessuna voce trovata.' : 'Inserisci il testo della voce.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    await refreshTodoMessage(client);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('#6f4e37')
          .setDescription(`<:vegacheckmark:1443666279058772028> Voce in **test**: **${parsed.task}** (online + **[TEST]**)`)
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  return true;
}

module.exports = { runTodoCommand, isTodoCommand };
