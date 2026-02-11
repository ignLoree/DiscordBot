const IDs = require('../../Utils/Config/ids');

const { EmbedBuilder } = require('discord.js');
const { CustomRole } = require('../../Schemas/Community/communitySchemas');

const { safeMessageReply } = require('../../Utils/Moderation/reply');

const { createCustomRoleGrantRequest } = require('../../Events/interaction/customRoleHandlers');

const REQUEST_TIMEOUT_MS = 60_000;
function buildSyntaxEmbed() {
  return new EmbedBuilder()
    .setColor('Red')
    .setTitle('Errore di sintassi')
    .setDescription([
      'Sintassi corretta:',
      '`+customroleadd @utente`',
      'Devi taggare un utente valido diverso da te.'
    ].join('\n'));
}

module.exports = {
  name: 'customroleadd',
  aliases: ['cradd'],

  async execute(message) {
    if (!message.guild || !message.member) return;

    const target = message.mentions?.members?.first() || null;
    if (!target || target.id === message.author.id) {
      await safeMessageReply(message, { embeds: [buildSyntaxEmbed()], allowedMentions: { repliedUser: false } });
      return;
    }

    const doc = await CustomRole.findOne({ guildId: message.guild.id, userId: message.author.id }).lean().catch(() => null);
    if (!doc?.roleId) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Non hai un ruolo personalizzato. Usa prima `+customrolecreate`.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const role = message.guild.roles.cache.get(doc.roleId) || await message.guild.roles.fetch(doc.roleId).catch(() => null);
    if (!role) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Il tuo ruolo personalizzato non esiste più. Ricrealo con `+customrolecreate`.')
        ],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const started = await createCustomRoleGrantRequest({
      client: message.client,
      guildId: message.guild.id,
      channelId: message.channel.id,
      requesterId: message.author.id,
      targetId: target.id,
      roleId: role.id,
      timeoutMs: REQUEST_TIMEOUT_MS
    });

    if (!started?.ok) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Non sono riuscito ad avviare la richiesta (controlla DM aperti e permessi).')
        ],
        allowedMentions: { repliedUser: false }
      });
    }
  }
};




