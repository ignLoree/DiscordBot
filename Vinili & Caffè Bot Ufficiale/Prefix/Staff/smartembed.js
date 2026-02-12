const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');

const MAX_TITLE = 256;
const MAX_DESC = 4096;

function stripAndCollectMentions(input) {
  let text = String(input || '');
  const mentionTokens = [];
  const userIds = [];
  const roleIds = [];
  let pingEveryone = false;
  let pingHere = false;

  text = text.replace(/@(everyone|here)\b/gi, (full, type) => {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'everyone') pingEveryone = true;
    if (normalized === 'here') pingHere = true;
    mentionTokens.push(`@${normalized}`);
    return ' ';
  });

  text = text.replace(/<@!?(\d{16,20})>/g, (full, id) => {
    const normalized = String(id || '');
    if (normalized) {
      userIds.push(normalized);
      mentionTokens.push(`<@${normalized}>`);
    }
    return ' ';
  });

  text = text.replace(/<@&(\d{16,20})>/g, (full, id) => {
    const normalized = String(id || '');
    if (normalized) {
      roleIds.push(normalized);
      mentionTokens.push(`<@&${normalized}>`);
    }
    return ' ';
  });

  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    cleanText: text,
    mentionTokens: Array.from(new Set(mentionTokens)),
    userIds: Array.from(new Set(userIds)),
    roleIds: Array.from(new Set(roleIds)),
    pingEveryone,
    pingHere
  };
}

function extractSmartTitleAndDescription(raw) {
  const normalized = String(raw || '').replace(/\r/g, '').trim();
  if (!normalized) {
    return { title: null, description: '' };
  }

  const lines = normalized.split('\n');
  const first = String(lines[0] || '').trim();
  const titlePrefix = first.match(/^(title|titolo)\s*:\s*(.+)$/i);

  if (titlePrefix) {
    const title = String(titlePrefix[2] || '').trim().slice(0, MAX_TITLE);
    const description = lines.slice(1).join('\n').trim().slice(0, MAX_DESC);
    return { title: title || null, description };
  }

  return {
    title: null,
    description: normalized.slice(0, MAX_DESC)
  };
}

function buildAllowedMentions({ pingEveryone, pingHere, userIds, roleIds }) {
  const parse = [];
  if (pingEveryone || pingHere) parse.push('everyone');
  return {
    parse,
    users: userIds,
    roles: roleIds,
    repliedUser: false
  };
}

function buildNoPingOutsideContent(parsed, message) {
  const guild = message?.guild || null;
  const parts = [];

  for (const token of parsed.mentionTokens) {
    if (token === '@everyone' || token === '@here') {
      parts.push(token);
      continue;
    }

    const userMatch = token.match(/^<@(\d{16,20})>$/);
    if (userMatch?.[1]) {
      const userId = String(userMatch[1]);
      const member = guild?.members?.cache?.get(userId) || null;
      const username = member?.user?.username || message?.client?.users?.cache?.get(userId)?.username || `utente-${userId}`;
      parts.push(`@${username}`);
      continue;
    }

    const roleMatch = token.match(/^<@&(\d{16,20})>$/);
    if (roleMatch?.[1]) {
      const roleId = String(roleMatch[1]);
      const role = guild?.roles?.cache?.get(roleId) || null;
      const roleName = role?.name || `ruolo-${roleId}`;
      parts.push(`@${roleName}`);
      continue;
    }

    parts.push(token);
  }

  return parts.join(' ').trim();
}

async function getSourceText(message, args) {
  const filteredArgs = args.filter((arg) => !['--ping', '-p', '--noping', '-np'].includes(String(arg || '').toLowerCase()));
  const direct = String(filteredArgs.join(' ') || '').trim();
  if (direct) return direct;

  const reference = message.reference?.messageId;
  if (!reference) return '';
  const replied = await message.channel.messages.fetch(reference).catch(() => null);
  return String(replied?.content || '').trim();
}

module.exports = {
  name: 'smartembed',
  aliases: ['sembed', 'embedsmart', 'embedify'],

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    const shouldPing = !(args.includes('--noping') || args.includes('-np'));

    const sourceText = await getSourceText(message, args);
    if (!sourceText) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription(
              '<:vegax:1443934876440068179> Uso: `+smartembed <testo>` oppure rispondi ad un messaggio con `+smartembed`. I ping sono reali di default; usa `--noping` per disattivarli. Per titolo embed usa `titolo: ...` oppure `title: ...`.'
            )
        ],
        allowedMentions: { repliedUser: false }
      });
    }

    const parsed = stripAndCollectMentions(sourceText);
    const smart = extractSmartTitleAndDescription(parsed.cleanText);

    if (!smart.description) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Dopo la rimozione dei ping non e rimasto testo valido per l\'embed.')
        ],
        allowedMentions: { repliedUser: false }
      });
    }

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setDescription(smart.description);
    if (smart.title) embed.setTitle(smart.title);

    const pingContent = shouldPing
      ? parsed.mentionTokens.join(' ').trim()
      : buildNoPingOutsideContent(parsed, message);
    await message.channel.send({
      content: pingContent || undefined,
      embeds: [embed],
      allowedMentions: shouldPing
        ? buildAllowedMentions(parsed)
        : { parse: [], users: [], roles: [], repliedUser: false }
    });
  }
};
