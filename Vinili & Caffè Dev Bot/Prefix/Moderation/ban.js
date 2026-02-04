const { safeMessageReply } = require('../../Utils/Moderation/message');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveTarget, getReason, extractUserId } = require('../../Utils/Moderation/prefixModeration');
const { getModConfig, createModCase, logModCase, tryDmUser } = require('../../Utils/Moderation/moderation');

module.exports = {
  skipPrefix: true,
  name: 'ban',
  async execute(message, args, client) {
    await message.channel.sendTyping();
    const { user, member, userId } = await resolveTarget(message, args, 0);
    const reason = getReason(args, 1);
    const config = await getModConfig(message.guild.id);

    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Non hai i permessi per usare questo comando.' });
    }

    if (!userId) return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Specifica un utente o ID valido.' });
    if (member && member.roles.highest.position >= message.member.roles.highest.position) {
      return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Non puoi moderare un utente con ruolo uguale o superiore.' });
    }
    if (member && !member.bannable) return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Non posso bannare questo utente.' });

    if (user && config.dmOnAction) {
      const dmEmbed = new EmbedBuilder()
        .setColor(client.config2?.embedModLight || '#6f4e37')
        .setTitle('Ban')
        .setDescription(`Sei stato bannato da **${message.guild.name}**.`)
        .addFields({ name: 'Motivo', value: reason });
      await tryDmUser(user, { embeds: [dmEmbed] });
    }

    if (member) {
      await member.ban({ reason });
    } else {
      await message.guild.members.ban(userId, { reason });
    }

    const { doc } = await createModCase({
      guildId: message.guild.id,
      action: 'BAN',
      userId: userId,
      modId: message.author.id,
      reason,
      context: { channelId: message.channel.id }
    });

    await logModCase({ client, guild: message.guild, modCase: doc, config });

    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`<:vegacheckmark:1443666279058772028> Utente <@${userId}> bannato. Case #${doc.caseId}`);

    return safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};

