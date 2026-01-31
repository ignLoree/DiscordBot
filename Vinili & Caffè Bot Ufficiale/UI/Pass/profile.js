const { EmbedBuilder } = require('discord.js');

async function buildProfileEmbed(season, u) {
  const fragments = [...u.fragments.entries()]
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ') || '-';
  return new EmbedBuilder()
    .setTitle(`🚀 ${season.name}`)
    .setDescription(`Tema: **${season.theme || '-'}**`)
    .addFields(
      { name: '⚡ Energia', value: `${u.energy}`, inline: true },
      { name: '🎫 Ticket', value: `${u.tickets}`, inline: true },
      { name: '🧩 Frammenti', value: fragments },
      {
        name: '🛣️ Percorso',
        value: formatPath(u.path),
        inline: true
      },
      {
        name: '📈 Avanzamento',
        value: `<:vegacheckmark:1443666279058772028> ${u.completedNodes.length} nodi completati`,
        inline: true
      }
    )
    .setFooter({
      text: `<a:VC_Timer:1462779065625739344> Fine stagione: ${new Date(season.endAt).toLocaleDateString()}`
    });
}

function formatPath(path) {
  if (!path || path === 'none') return 'Da scegliere';
  if (path === 'chaos') return 'Caos';
  if (path === 'order') return 'Ordine';
  return path;
}

module.exports = { buildProfileEmbed };
