const { safeMessageReply } = require('../../Utils/Moderation/message');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { extractUserId, getReason } = require('../../Utils/Moderation/prefixModeration');
const { getModConfig, createModCase, logModCase } = require('../../Utils/Moderation/moderation');

module.exports = {
  skipPrefix: true,
  name: 'unban',
  async execute(message, args, client) {
    await message.channel.sendTyping();
    const userId = extractUserId(args?.[0], message);
    const config = await getModConfig(message.guild.id);

    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Non hai i permessi per usare questo comando.' });
    }

    if (!userId) return safeMessageReply(message, { content: '<:attentionfromvega:1443651874032062505> Specifica un ID valido.' });
    const reason = getReason(args, 1);
    try {
      await message.guild.members.unban(userId, reason);
    } catch {
      return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Utente non bannato o ID non valido.' });
    }

    const { doc } = await createModCase({
      guildId: message.guild.id,
      action: 'UNBAN',
      userId,
      modId: message.author.id,
      reason,
      context: { channelId: message.channel.id }
    });

    await logModCase({ client, guild: message.guild, modCase: doc, config });

    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`<:vegacheckmark:1443666279058772028> Ban rimosso per ${userId}. Case #${doc.caseId}`);

    return safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};

