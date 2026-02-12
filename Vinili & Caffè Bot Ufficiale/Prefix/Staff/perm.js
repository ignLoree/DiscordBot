const { EmbedBuilder } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const { parseDuration, formatDuration } = require('../../Utils/Moderation/moderation');
const {
  parseCommandTokenList,
  parseRevokeTokenList,
  grantTemporaryCommandPermissions,
  revokeTemporaryCommandPermissions,
  clearTemporaryCommandPermissionsForUser,
  listTemporaryCommandPermissionsForUser
} = require('../../Utils/Moderation/temporaryCommandPermissions');

function buildUsageEmbed() {
  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Permessi Temporanei')
    .setDescription([
      '`+perm grant <@utente|id> <durata> <comando1,comando2,...>`',
      '`+perm revoke <@utente|id> <comando1,comando2,...>`',
      '`+perm list <@utente|id>`',
      '`+perm clear <@utente|id>`',
      '',
      'Durate supportate: `30m`, `2h`, `3d`',
      'Formato comandi supportato:',
      '`partnership` (any)',
      '`slash:partnership`',
      '`prefix:level.add`'
    ].join('\n'));
}

async function resolveTargetUser(message, raw) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  const id = String(raw || '').replace(/[<@!>]/g, '');
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.client.users.fetch(id).catch(() => null);
}

function formatRemaining(expiresAt) {
  const expires = new Date(expiresAt).getTime();
  const remaining = Math.max(0, expires - Date.now());
  return formatDuration(remaining);
}

module.exports = {
  name: 'perm',
  aliases: ['tempperm', 'permgrant', 'permrevoke', 'permlist', 'permclear'],
  subcommands: ['grant', 'revoke', 'list', 'clear'],
  subcommandAliases: {
    permgrant: 'grant',
    permrevoke: 'revoke',
    permlist: 'list',
    permclear: 'clear'
  },

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    const sub = String(args[0] || '').trim().toLowerCase();

    if (!sub || !['grant', 'revoke', 'list', 'clear'].includes(sub)) {
      return safeMessageReply(message, {
        embeds: [buildUsageEmbed()],
        allowedMentions: { repliedUser: false }
      });
    }

    const target = await resolveTargetUser(message, args[1]);
    if (!target || target.bot) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Utente non valido. Usa un mention o ID valido.')
        ],
        allowedMentions: { repliedUser: false }
      });
    }

    if (sub === 'grant') {
      const durationMs = parseDuration(args[2]);
      if (!durationMs) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setDescription('<:vegax:1443934876440068179> Durata non valida. Usa ad esempio `30m`, `2h`, `3d`.')
          ],
          allowedMentions: { repliedUser: false }
        });
      }

      const commandInput = args.slice(3).join(' ');
      const commandKeys = parseCommandTokenList(commandInput);
      if (!commandKeys.length) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setDescription('<:vegax:1443934876440068179> Devi specificare almeno un comando.')
          ],
          allowedMentions: { repliedUser: false }
        });
      }

      const result = await grantTemporaryCommandPermissions({
        guildId: message.guild.id,
        userId: target.id,
        grantedBy: message.author.id,
        commandKeys,
        durationMs
      });

      const expiresText = result.expiresAt
        ? `<t:${Math.floor(new Date(result.expiresAt).getTime() / 1000)}:F>`
        : 'N/A';

      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('#6f4e37')
            .setTitle('Permessi temporanei assegnati')
            .setDescription([
              `Utente: ${target}`,
              `Durata: **${formatDuration(durationMs)}**`,
              `Scadenza: ${expiresText}`,
              `Comandi: ${commandKeys.map((k) => `\`${k}\``).join(', ')}`
            ].join('\n'))
        ],
        allowedMentions: { repliedUser: false }
      });
    }

    if (sub === 'revoke') {
      const commandInput = args.slice(2).join(' ');
      const commandKeys = parseRevokeTokenList(commandInput);
      if (!commandKeys.length) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setDescription('<:vegax:1443934876440068179> Devi specificare almeno un comando da revocare.')
          ],
          allowedMentions: { repliedUser: false }
        });
      }

      const removed = await revokeTemporaryCommandPermissions({
        guildId: message.guild.id,
        userId: target.id,
        commandKeys
      });

      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('#6f4e37')
            .setTitle('Permessi temporanei revocati')
            .setDescription(`Revoche effettuate per ${target}: **${removed}**`)
        ],
        allowedMentions: { repliedUser: false }
      });
    }

    if (sub === 'clear') {
      const removed = await clearTemporaryCommandPermissionsForUser({
        guildId: message.guild.id,
        userId: target.id
      });

      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('#6f4e37')
            .setTitle('Permessi temporanei azzerati')
            .setDescription(`Permessi rimossi per ${target}: **${removed}**`)
        ],
        allowedMentions: { repliedUser: false }
      });
    }

    const rows = await listTemporaryCommandPermissionsForUser({
      guildId: message.guild.id,
      userId: target.id
    });

    const lines = rows.length
      ? rows.map((row) => `• \`${row.commandKey}\` -> scade tra **${formatRemaining(row.expiresAt)}**`)
      : ['Nessun permesso temporaneo attivo.'];

    return safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor('#6f4e37')
          .setTitle(`Permessi temporanei di ${target.username}`)
          .setDescription(lines.join('\n'))
      ],
      allowedMentions: { repliedUser: false }
    });
  }
};
