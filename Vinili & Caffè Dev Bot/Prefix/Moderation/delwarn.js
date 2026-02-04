const { safeMessageReply } = require('../../Utils/Moderation/message');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ModCase = require('../../Schemas/Moderation/modCaseSchema');
const { getModConfig, createModCase, logModCase } = require('../../Utils/Moderation/moderation');

module.exports = {
  skipPrefix: true,
  name: 'delwarn',
  async execute(message, args, client) {
    await message.channel.sendTyping();
    const caseId = Number(args?.[0]);
    const reason = args?.slice(1).join(' ').trim() || 'Rimosso dal moderatore';
    const config = await getModConfig(message.guild.id);
    const targetUser = await message.client.users.fetch(warnCase.userId).catch(() => null);
    const userLabel = targetUser ? targetUser.username : warnCase.userId;

    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Non hai i permessi per usare questo comando.' });
    }

    if (!caseId) return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Specifica un case id valido.' });
    const warnCase = await ModCase.findOne({
      guildId: message.guild.id,
      caseId,
      action: 'WARN'
    });

    if (!warnCase) return safeMessageReply(message, { content: '<:vegax:1443934876440068179> Case non trovato.' });
    warnCase.active = false;
    await warnCase.save();

    const { doc } = await createModCase({
      guildId: message.guild.id,
      action: 'UNWARN',
      userId: warnCase.userId,
      modId: message.author.id,
      reason: `Rimosso warn #${caseId}: ${reason}`,
      context: { channelId: message.channel.id }
    });

    await logModCase({ client, guild: message.guild, modCase: doc, config });

    const embed = new EmbedBuilder()
      .setColor(client.config2?.embedModLight || '#6f4e37')
      .setDescription(`<:vegacheckmark:1443666279058772028> Warn rimosso: "${warnCase.reason || '<:vegax:1443934876440068179> Nessun motivo fornito'}" per ${userLabel}.`);

    return safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};

