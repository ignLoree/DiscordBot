const { safeMessageReply } = require('../../Utils/Moderation/message');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveTarget, getReason } = require('../../Utils/Moderation/prefixModeration');
const { getModConfig, createModCase, logModCase, tryDmUser } = require('../../Utils/Moderation/moderation');

module.exports = {
  skipPrefix: true,
  name: 'warn',
  async execute(message, args, client) {
    await message.channel.sendTyping();
    const { user, member } = await resolveTarget(message, args, 0);
    const reason = getReason(args, 1);
    const config = await getModConfig(message.guild.id);

    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Non hai i permessi per usare questo comando.' });
    }

    if (!user) return safeMessageReply(message, { content: 'Specifica un utente.' });
    if (user.id == message.author.id) return safeMessageReply(message, { content: 'Non puoi warnare te stesso.' });
    if (member && member.roles.highest.position >= message.member.roles.highest.position) {
      return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Non puoi warnare un utente con ruolo uguale o superiore.' });
    }

    const { doc } = await createModCase({
      guildId: message.guild.id,
      action: 'WARN',
      userId: user.id,
      modId: message.author.id,
      reason,
      context: { channelId: message.channel.id }
    });

    await logModCase({ client, guild: message.guild, modCase: doc, config });

    if (config.dmOnAction) {
      const dmEmbed = new EmbedBuilder()
        .setColor(client.config2?.embedModLight || '#6f4e37')
        .setTitle('Warn')
        .setDescription(`Sei stato warnato in **${message.guild.name}**.`)
        .addFields({ name: 'Motivo', value: reason });
      await tryDmUser(user, { embeds: [dmEmbed] });
    }

    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`<:vegacheckmark:1443666279058772028> Warn assegnato a <@${user.id}>.`);

    return safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};

