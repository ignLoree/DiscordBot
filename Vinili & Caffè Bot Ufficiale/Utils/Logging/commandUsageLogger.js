const { EmbedBuilder } = require('discord.js');

async function getChannelSafe(client, channelId) {
  if (!channelId) return null;
  return client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
}

async function logCommandUsage(client, {
  channelId,
  serverName,
  user,
  userId,
  content,
  userAvatarUrl
}) {
  if (!channelId) return;
  const channel = await getChannelSafe(client, channelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor('#6f4e37')
    .setAuthor({ name: `${user} ha usato un comando.`, iconURL: client.user.avatarURL({ dynamic: true }) })
    .setTitle(`${client.user.username} Log Comandi`)
    .addFields(
      { name: 'Nome Server', value: `${serverName}` },
      { name: 'Comando', value: `\`\`\`${content}\`\`\`` },
      { name: 'Utente', value: `${user} | ${userId}` }
    )
    .setTimestamp()
    .setFooter({ text: `Log Comandi ${client.config.devBy}`, iconURL: userAvatarUrl });
  await channel.send({ embeds: [embed] });
}

module.exports = { logCommandUsage, getChannelSafe };
