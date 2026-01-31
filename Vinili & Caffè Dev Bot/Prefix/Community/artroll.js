const { EmbedBuilder } = require('discord.js');
const { spawnArtIfPossible } = require('../../Services/Art/artSpawnService');
const ArtRoll = require('../../Schemas/Art/artRollSchema');

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
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const limit = Number(config.rollLimitPerDay || 10);
    const roll = await ArtRoll.findOneAndUpdate(
      { guildId: message.guild.id, userId: message.author.id, day: dayKey },
      { $setOnInsert: { guildId: message.guild.id, userId: message.author.id, day: dayKey, count: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (roll.count >= limit) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor("Red").setDescription("Hai già usato tutti i roll di oggi.")]
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

    roll.count += 1;
    roll.lastAt = new Date();
    await roll.save();

    const remaining = limit - roll.count;
    if (remaining <= 3 && remaining >= 0 && result.message?.embeds?.[0]) {
      const updated = EmbedBuilder.from(result.message.embeds[0]);
      updated.setFooter({ text: `⚠️ ${remaining} ROLLS LEFT!` });
      await result.message.edit({ embeds: [updated] }).catch(() => {});
    }
    return message.react('✅').catch(() => {});
  }
};
