const { safeMessageReply } = require('../../Utils/Moderation/message');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveTarget } = require('../../Utils/Moderation/prefixModeration');
const ModCase = require('../../Schemas/Moderation/modCaseSchema');
const { formatDuration } = require('../../Utils/Moderation/moderation');

module.exports = {
  skipPrefix: true, 
  name: 'modlogs',
  async execute(message, args, client) {
    await message.channel.sendTyping();
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Non hai i permessi per usare questo comando.' });
    }
    const sub = (args?.[0] || '').toLowerCase();

    if (sub === 'case') {
      const caseId = Number(args?.[1]);
      if (!caseId) return safeMessageReply(message, { content: '<:attentionfromvega:1443651874032062505> Specifica un case id valido.' });
      const c = await ModCase.findOne({ guildId: message.guild.id, caseId });
      if (!c) return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Case non trovato.' });
      const isUserId = /^\d{17,20}$/.test(String(c.userId));
      const userLabel = isUserId ? `<@${c.userId}>` : String(c.userId);
      const embed = new EmbedBuilder()
        .setColor(client.config2?.embedModLight || '#6f4e37')
        .setTitle(`Case #${c.caseId}`)
        .addFields(
          { name: 'Azione', value: c.action, inline: true },
          { name: 'Utente', value: userLabel, inline: true },
          { name: 'Moderatore', value: `<@${c.modId}>`, inline: true },
          { name: 'Motivo', value: c.reason || 'Nessun motivo fornito' }
        )
        .setTimestamp(c.createdAt);
      if (c.durationMs) embed.addFields({ name: 'Durata', value: formatDuration(c.durationMs), inline: true });
      if (c.context?.channelId) embed.addFields({ name: 'Canale', value: `<#${c.context.channelId}>`, inline: true });
      return safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const { user } = await resolveTarget(message, args, 0);
    if (!user) return safeMessageReply(message, { content: '<:attentionfromvega:1443651874032062505> Specifica un utente.' });
    const cases = await ModCase.find({
      guildId: message.guild.id,
      userId: user.id
    }).sort({ caseId: -1 }).limit(10);
    if (!cases.length) return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Nessun case trovato.' });
    const lines = cases.map(c => {
      const status = c.active ? '' : ' (chiuso)';
      return `#${c.caseId} - ${c.action}${status} - ${c.reason}`;
    });

    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setTitle(`Modlogs di ${user.tag}`)
      .setDescription(lines.join('\n'));
    return safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};

