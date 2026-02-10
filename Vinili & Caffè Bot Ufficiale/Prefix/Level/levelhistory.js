const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { getRecentLevelHistory } = require('../../Services/Community/expService');

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
    const target = await resolveTargetUser(message, args[0]);
    const rows = await getRecentLevelHistory(message.guild.id, target.id, 10);

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
      .setDescription(lines.join('\n'));

    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
