const { EmbedBuilder } = require('discord.js');
const { spawnArtIfPossible } = require('../../Services/Art/artSpawnService');

module.exports = {
  name: "artroll",
  aliases: ["rollart", "roll"],
  async execute(message) {
    const config = message.client?.config2?.artRift;
    if (!config?.enabled) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor("Red").setDescription("Sistema ArtRift non attivo.")]
      });
    }
    if (String(message.channel.id) !== String(config.channelId)) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor("Red").setDescription("Usa questo comando nel canale di spawn.")]
      });
    }
    const result = await spawnArtIfPossible(message.channel, message.client, {
      reason: 'roll',
      force: true,
      requestedBy: message.author.id
    });
    if (!result.ok) {
      let reason = "Non posso spawnare ora.";
      if (result.reason === 'active') reason = "C'è già una card attiva in canale.";
      if (result.reason === 'cooldown') reason = "Aspetta qualche minuto prima di rollare di nuovo.";
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor("#6f4e37").setDescription(reason)]
      });
    }
    return message.react('✅').catch(() => {});
  }
};
