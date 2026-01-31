const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveTarget, getReason } = require('../../Utils/Moderation/prefixModeration');
const { getModConfig, createModCase, logModCase, parseDuration, formatDuration, tryDmUser } = require('../../Utils/Moderation/moderation');
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

module.exports = {
  skipPrefix: true,
  name: 'mute',
  async execute(message, args, client) {
    await message.channel.sendTyping();
    const { user, member } = await resolveTarget(message, args, 0);
    const durationRaw = args?.[1];
    const durationMs = parseDuration(durationRaw);
    if (durationMs > MAX_TIMEOUT_MS) return message.reply({ content: '<:attentionfromvega:1443651874032062505> Durata massima 28d.' });
    const reason = getReason(args, 2);
    const config = await getModConfig(message.guild.id);

    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply({ content: '<:vegax:1443934876440068179> Non hai i permessi per usare questo comando.' });
    }

    if (!user) return message.reply({ content: '<:attentionfromvega:1443651874032062505> Specifica un utente.' });
    if (!durationRaw) return message.reply({ content: '<:attentionfromvega:1443651874032062505> Specifica una durata (es: 10m, 2h, 1d).' });
    if (!durationMs) return message.reply({ content: '<:vegax:1443934876440068179> Durata non valida. Usa formato tipo 1s, 3m, 5h, 7d.' });
    if (!member) return message.reply({ content: '<:vegax:1443934876440068179> Utente non trovato.' });
    if (member.roles.highest.position >= message.member.roles.highest.position) {
      return message.reply({ content: '<:vegax:1443934876440068179> Non puoi mutare un utente con ruolo uguale o superiore.' });
    }
    if (!member.moderatable) return message.reply({ content: '<:vegax:1443934876440068179> Non posso mutare questo utente.' });
    await member.timeout(durationMs, reason);

    const { doc } = await createModCase({
      guildId: message.guild.id,
      action: 'TIMEOUT',
      userId: user.id,
      modId: message.author.id,
      reason,
      durationMs,
      context: { channelId: message.channel.id }
    });
    await logModCase({ client, guild: message.guild, modCase: doc, config });

    if (config.dmOnAction) {
      const dmEmbed = new EmbedBuilder()
        .setColor(client.config2?.embedModLight || '#6f4e37')
        .setTitle('Mute')
        .setDescription(`Sei stato mutato in **${message.guild.name}** per ${formatDuration(durationMs)}.`)
        .addFields({ name: 'Motivo', value: reason });
      await tryDmUser(user, { embeds: [dmEmbed] });
    }

    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`<:vegacheckmark:1443666279058772028> Mute applicato a <@${user.id}> per ${formatDuration(durationMs)}. Case #${doc.caseId}`);

    return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};