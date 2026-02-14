const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { getNoDmSet } = require('../../Utils/noDmList');

const getDevIds = (client) => {
  const raw =
    client.config?.developers ??
    '';
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id).trim()).filter(Boolean);
  }
  return String(raw)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
};

function chunkLines(lines, maxLen = 1900) {
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLen) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [''];
}

module.exports = {
  name: 'no-dm-list',
  aliases: ['nodmlist'],

  async execute(message) {
    const set = await getNoDmSet(message.guild.id);
    const ids = Array.from(set);
    if (!ids.length) {
      await safeMessageReply(message, {
        content: 'Nessun utente in lista `+no-dm`.',
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const lines = ids.map((id) => `<@${id}>`);
    const chunks = chunkLines(lines);
    await safeMessageReply(message, {
      content: `Utenti in \`+no-dm\`:\n${chunks[0]}`,
      allowedMentions: { repliedUser: false }
    });
    for (let i = 1; i < chunks.length; i += 1) {
      await message.channel.send({ content: chunks[i], allowedMentions: { repliedUser: false } });
    }
  }
};
