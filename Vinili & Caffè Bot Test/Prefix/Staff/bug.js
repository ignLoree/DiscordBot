const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const IDs = require('../../Utils/Config/ids');
const TEST_GUILD_ID = IDs.guilds?.test || '1462458562507964584';
const {
  addItem,
  removeItem,
  setItemTest,
  setItemStatus,
  refreshBugMessage,
  normalizeStatus,
  STATUS_ORDER
} = require('../../Utils/Bug/bugListService');

function parseBugArgs(args) {
  const first = (args[0] || '').toLowerCase();
  if (first === 'modify') {
    const rest = args.slice(1).join(' ');
    const raw = String(rest || '').trim();
    if (!raw) return null;
    const twoQuoted = raw.match(/^"([^"]*)"\s*"([^"]*)"\s*$/);
    if (twoQuoted) {
      const task = twoQuoted[1].trim();
      const status = normalizeStatus(twoQuoted[2]);
      if (status) return { action: 'modify', task, status };
    }
    const oneQuotedThenWord = raw.match(/^"([^"]*)"\s+(\S+)\s*$/);
    if (oneQuotedThenWord) {
      const task = oneQuotedThenWord[1].trim();
      const status = normalizeStatus(oneQuotedThenWord[2]);
      if (status) return { action: 'modify', task, status };
    }
    const parts = rest.split(/\s+/);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].toLowerCase();
      if (STATUS_ORDER.includes(last)) {
        const task = parts.slice(0, -1).join(' ').trim();
        if (task) return { action: 'modify', task, status: last };
      }
    }
    return null;
  }
  if (first !== 'report') {
    const rest = args.join(' ');
    const raw = String(rest || '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    const stripQuotes = (s) => String(s || '').trim().replace(/^["']|["']$/g, '');
    if (lower.endsWith(' fatto')) {
      return { action: 'fatto', task: stripQuotes(raw.slice(0, -6)) };
    }
    if (lower.endsWith(' test')) {
      return { action: 'test', task: stripQuotes(raw.slice(0, -5)) };
    }
    return null;
  }

  const rest = args.slice(1).join(' ');
  const raw = String(rest || '').trim();
  if (!raw) return null;

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

  const parts = rest.split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].toLowerCase();
    if (STATUS_ORDER.includes(last)) {
      const task = parts.slice(0, -1).join(' ').trim();
      if (task) return { action: 'add', task, status: last };
    }
  }

  return null;
}

async function runBugCommand(message, args, client) {
  if (!message?.guild || !message.member) return false;
  if (message.guild.id !== TEST_GUILD_ID) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription('<:vegax:1472992044140990526> Il comando `-bug` è utilizzabile solo nel **server test**.')
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  const parsed = parseBugArgs(args);

  if (!parsed) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('Red')
          .setDescription(
            '**Uso:**\n' +
            '`-bug report "descrizione" "online"` | `"inattivo"` | `"pausa"` | `"offline"`\n' +
            '`-bug modify "descrizione" "nuova gravità"` — modifica la gravità\n' +
            '`-bug "descrizione" fatto` — rimuove il bug\n' +
            '`-bug "descrizione" test` — segna in test (online + **[TEST]**)'
          )
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  if (parsed.action === 'add') {
    const result = await addItem(parsed.task, parsed.status);
    if (!result.ok) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription(
              result.error === 'status_invalid'
                ? 'Gravità non valida. Usa: `online`, `inattivo`, `pausa`, `offline`.'
                : 'Inserisci una descrizione per il bug.'
            )
        ],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    await refreshBugMessage(client);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('#6f4e37')
          .setDescription(`<:vegacheckmark:1472992042203349084> Bug segnalato: **${parsed.task}** (gravità: ${parsed.status})`)
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  if (parsed.action === 'fatto') {
    const result = await removeItem(parsed.task);
    if (!result.ok) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription(result.error === 'not_found' ? 'Nessun bug trovato con questa descrizione.' : 'Inserisci la descrizione del bug da rimuovere.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    await refreshBugMessage(client);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('#6f4e37')
          .setDescription(`<:vegacheckmark:1472992042203349084> Bug rimosso: **${parsed.task}**`)
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  if (parsed.action === 'modify') {
    const result = await setItemStatus(parsed.task, parsed.status);
    if (!result.ok) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription(
              result.error === 'status_invalid'
                ? 'Gravità non valida. Usa: `online`, `inattivo`, `pausa`, `offline`.'
                : result.error === 'not_found'
                  ? 'Nessun bug trovato con questa descrizione.'
                  : 'Inserisci la descrizione del bug e la nuova gravità.'
            )
        ],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    await refreshBugMessage(client);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('#6f4e37')
          .setDescription(`<:vegacheckmark:1472992042203349084> Gravità aggiornata: **${parsed.task}** → **${parsed.status}**`)
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  if (parsed.action === 'test') {
    const result = await setItemTest(parsed.task, true);
    if (!result.ok) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription(result.error === 'not_found' ? 'Nessun bug trovato.' : 'Inserisci la descrizione del bug.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return true;
    }
    await refreshBugMessage(client);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('#6f4e37')
          .setDescription(`<:vegacheckmark:1472992042203349084> Bug in **test**: **${parsed.task}** (online + **[TEST]**)`)
      ],
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  return true;
}

module.exports = {
  name: 'bug',
  aliases: [],
  async execute(message, args, client, context = {}) {
    const invoked = String(context?.invokedName || 'bug').toLowerCase();
    return runBugCommand(message, [invoked, ...(Array.isArray(args) ? args : [])], client);
  }
};
