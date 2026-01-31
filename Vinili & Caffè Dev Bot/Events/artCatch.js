const { EmbedBuilder } = require('discord.js');
const { claimArtFromMessage } = require('../Services/Art/artClaimService');

function normalizeEmojiId(raw) {
  if (!raw) return null;
  const match = String(raw).match(/:(\d+)>$/);
  return match ? match[1] : null;
}

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client) {
    try {
      if (!reaction || !user || user.bot) return;
      if (reaction.partial) await reaction.fetch().catch(() => {});
      if (reaction.message?.partial) await reaction.message.fetch().catch(() => {});
      const message = reaction.message;
      if (!message?.guild) return;

      const config = client?.config2?.artRift;
      if (!config?.enabled) return;

      const expectedId = normalizeEmojiId(config.catchEmoji);
      const isMatch = expectedId
        ? reaction.emoji?.id === expectedId
        : reaction.emoji?.name === config.catchEmoji;
      if (!isMatch) return;

      const result = await claimArtFromMessage({
        messageId: message.id,
        userId: user.id,
        guildId: message.guild.id
      });

      if (!result.ok) {
        if (result.reason === 'claimed') {
          await message.channel.send({
            content: `<@${user.id}> Questa card è già stata presa.`
          }).then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));
        }
        return;
      }

      const card = result.card;
      const shortId = card?.cardId ? card.cardId.slice(0, 6).toUpperCase() : 'CARD';
      const rarity = (result.spawn?.rarity || 'common').toUpperCase();
      const embed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setDescription(`Hai collezionato **${shortId}** · ${rarity}`)
        .setImage(card?.url || null);

      await message.channel.send({ embeds: [embed] });
    } catch (err) {
      if (client?.logs?.error) {
        client.logs.error('[ART CATCH]', err);
      } else {
        global.logger.error('[ART CATCH]', err);
      }
    }
  }
};
