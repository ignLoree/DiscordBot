const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { getLevelHistoryPage } = require('../../Services/Community/expService');

async function resolveTargetUser(message, raw) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  const id = String(raw || '').replace(/[<@!>]/g, '');
  if (!/^\d{16,20}$/.test(id)) return message.author;
  return message.client.users.fetch(id).catch(() => message.author);
}

function fmtDate(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('it-IT', { hour12: false });
}

module.exports = {
  name: 'levelhistory',
  aliases: ['lvlhistory'],

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    const first = String(args[0] || '').trim();
    const second = String(args[1] || '').trim();
    const firstLooksPage = /^\d+$/.test(first);

    const target = await resolveTargetUser(message, firstLooksPage ? null : first);
    const pageRaw = firstLooksPage ? first : second;
    const page = /^\d+$/.test(pageRaw) ? Math.max(1, Number(pageRaw)) : 1;

    const { rows, page: effectivePage, totalPages } = await getLevelHistoryPage(message.guild.id, target.id, page, 10);

    if (!rows.length) {
      const embed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setDescription('<:vegax:1443934876440068179> Nessuna voce nello storico livelli.');
      await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
      return;
    }

    const lines = rows.map((row) => {
      const delta = Number(row.deltaExp || 0);
      const sign = delta >= 0 ? '+' : '';
      const actor = row.actorId ? `<@${row.actorId}>` : 'Sistema';
      return `- ${fmtDate(row.createdAt)} | \`${row.action}\` | Liv ${row.beforeLevel}->${row.afterLevel} | EXP ${row.beforeExp}->${row.afterExp} (${sign}${delta}) | ${actor}`;
    });

    const embed = new EmbedBuilder()
      .setColor('#6f4e37')
      .setTitle(`Storico livelli di ${target.username}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Pagina ${effectivePage}/${totalPages} • Usa: +levelhistory [@utente] [pagina]` });

    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
