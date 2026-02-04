const { safeMessageReply } = require('../../Utils/Moderation/message');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveTarget, getReason } = require('../../Utils/Moderation/prefixModeration');
const { getModConfig, createModCase, logModCase, tryDmUser } = require('../../Utils/Moderation/moderation');

module.exports = {
  skipPrefix: true,
  name: 'kick',
  async execute(message, args, client) {
    await message.channel.sendTyping();
    const { user, member } = await resolveTarget(message, args, 0);
    const reason = getReason(args, 1);
    const config = await getModConfig(message.guild.id);

    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Non hai i permessi per usare questo comando.' });
    }

    if (!user || !member) return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Utente non trovato.' });

    if (member.roles.highest.position >= message.member.roles.highest.position) {
      return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Non puoi kickare un utente con ruolo uguale o superiore.' });
    }

    if (!member.kickable) return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Non posso kickare questo utente.' });

    if (config.dmOnAction) {
      const dmEmbed = new EmbedBuilder()
        .setColor(client.config2?.embedModLight || '#6f4e37')
        .setTitle('Kick')
        .setDescription(`Sei stato espulso da **${message.guild.name}**.`)
        .addFields({ name: 'Motivo', value: reason });
      await tryDmUser(user, { embeds: [dmEmbed] });
    }

    await member.kick(reason);

    const { doc } = await createModCase({
      guildId: message.guild.id,
      action: 'KICK',
      userId: user.id,
      modId: message.author.id,
      reason,
      context: { channelId: message.channel.id }
    });

    await logModCase({ client, guild: message.guild, modCase: doc, config });

    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`<:vegacheckmark:1443666279058772028> Utente <@${user.id}> espulso. Case #${doc.caseId}`);

    return safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};


