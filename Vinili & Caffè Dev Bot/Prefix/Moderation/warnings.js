const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveTarget } = require('../../Utils/Moderation/prefixModeration');
const ModCase = require('../../Schemas/Moderation/modCaseSchema');

module.exports = {
  skipPrefix: true,
  name: 'warnings',
  async execute(message, args, client) {
    await message.channel.sendTyping();
    const { user } = await resolveTarget(message, args, 0);
    const lines = warns.map(w => `#${w.caseId} - ${w.reason} (${w.createdAt.toISOString().slice(0, 10)})`);

    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply({ content: '<:vegax:1443934876440068179> Non hai i permessi per usare questo comando.' });
    }

    if (!user) return message.reply({ content: '<:attentionfromvega:1443651874032062505> Specifica un utente.' });

    const warns = await ModCase.find({
      guildId: message.guild.id,
      userId: user.id,
      action: 'WARN'
    }).sort({ caseId: -1 }).limit(10);
    if (!warns.length) return message.reply({ content: '<:vegax:1443934876440068179> Nessun warn trovato.' });


    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setTitle(`Warn di ${user.tag}`)
      .setDescription(lines.join('\n'));
    return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
