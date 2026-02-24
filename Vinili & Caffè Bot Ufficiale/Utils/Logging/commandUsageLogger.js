const { EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");

async function getChannelSafe(client, channelId) {
  if (!channelId) return null;
  return (
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null))
  );
}

/** Risolve il canale dal server principale per centralizzare i log in tutti i server. */
async function getCentralChannel(client, channelId) {
  if (!client || !channelId) return getChannelSafe(client, channelId);
  const mainGuildId = IDs?.guilds?.main || null;
  if (!mainGuildId) return getChannelSafe(client, channelId);
  const guild =
    client.guilds.cache.get(mainGuildId) ||
    (await client.guilds.fetch(mainGuildId).catch(() => null));
  if (!guild) return getChannelSafe(client, channelId);
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function logCommandUsage(
  client,
  { channelId, serverName, user, userId, content },
) {
  if (!channelId) return;
  const channel = await getCentralChannel(client, channelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: `${user} ha usato un comando.`,
      iconURL: client.user.displayAvatarURL({ size: 64 }),
    })
    .setTitle(`${client.user.username} Log Comandi`)
    .addFields(
      { name: "Nome Server", value: `${serverName}` },
      { name: "Comando", value: `\`\`\`${content}\`\`\`` },
      { name: "Utente", value: `${user} | ${userId}` },
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch((err) => {
    global.logger?.warn?.("[commandUsageLogger] send failed:", channelId, err?.message || err);
  });
}

module.exports = { logCommandUsage, getChannelSafe, getCentralChannel };
