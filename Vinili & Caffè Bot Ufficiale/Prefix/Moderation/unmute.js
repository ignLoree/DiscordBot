const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveTarget, getReason } = require('../../Utils/Moderation/prefixModeration');
const { getModConfig, createModCase, logModCase, tryDmUser } = require('../../Utils/Moderation/moderation');

module.exports = {
  skipPrefix: true, 
  name: 'unmute',
  async execute(message, args, client) {
    await message.channel.sendTyping();
    const { user, member } = await resolveTarget(message, args, 0);
    const reason = getReason(args, 1);
    await member.timeout(null, reason);
    const config = await getModConfig(message.guild.id);

    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply({ content: '<:vegax:1443934876440068179> Non hai i permessi per usare questo comando.' });
    }

    if (!user || !member) return message.reply({ content: '<:vegax:1443934876440068179> Utente non trovato.' });
    if (!member.moderatable) return message.reply({ content: '<:vegax:1443934876440068179> Non posso smutare questo utente.' });

    const { doc } = await createModCase({
      guildId: message.guild.id,
      action: 'UNTIMEOUT',
      userId: user.id,
      modId: message.author.id,
      reason,
      context: { channelId: message.channel.id }
    });

    await logModCase({ client, guild: message.guild, modCase: doc, config });
    if (config.dmOnAction) {
      const dmEmbed = new EmbedBuilder()
        .setColor(client.config2?.embedModLight || '#6f4e37')
        .setTitle('Unmute')
        .setDescription(`Il tuo mute in **${message.guild.name}** è stato rimosso.`)
        .addFields({ name: 'Motivo', value: reason });
      await tryDmUser(user, { embeds: [dmEmbed] });
    }

    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`<:vegacheckmark:1443666279058772028> Mute rimosso da <@${user.id}>.`);

    return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
