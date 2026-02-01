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

      const result = await claimArtFromMessage({
        messageId: message.id,
        userId: user.id,
        guildId: message.guild.id,
        cooldownHours: config.claimCooldownHours || 3
      });

      if (!result.ok) {
        if (result.reason === 'claimed') {
          await message.channel.send({
            content: `<@${user.id}> This character is already claimed.`
          }).then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));
        }
        if (result.reason === 'cooldown') {
          const remainingMin = Math.max(1, Math.ceil(result.remainingMs / 60000));
          const line = `@! ${user.username}, For this server, you can claim once per interval of 3h. The next interval begins in ${remainingMin} min.`;
          await message.channel.send({ content: line });
        }
        return;
      }

      const card = result.card;
      const embed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setDescription(`💖 ${user.username} and Claudia Hortensia are now married! 💖`)
        .setImage(card?.url || null);

      await message.channel.send({ embeds: [embed] });

      const original = message.embeds?.[0];
      if (original) {
        const updated = EmbedBuilder.from(original)
          .setColor('#b00020')
          .setFooter({ text: `belongs to ${user.username}`, iconURL: user.displayAvatarURL() });
        await message.edit({ embeds: [updated] }).catch(() => {});
      }
    } catch (err) {
      if (client?.logs?.error) {
        client.logs.error('[ART CATCH]', err);
      } else {
        global.logger.error('[ART CATCH]', err);
      }
    }
  }
};
